package reconciler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	dbpkg "github.com/linode-instance-autoscaler/controller/internal/db"
	"github.com/linode-instance-autoscaler/controller/internal/linode"
	"github.com/linode-instance-autoscaler/controller/internal/metrics"
	"github.com/linode-instance-autoscaler/controller/internal/scaler"
	"go.uber.org/zap"
)

type Reconciler struct {
	db        *sql.DB
	secretKey string
	log       *zap.SugaredLogger
}

func New(db *sql.DB, secretKey string, log *zap.SugaredLogger) *Reconciler {
	return &Reconciler{db: db, secretKey: secretKey, log: log}
}

func (r *Reconciler) ReconcileGroup(group *dbpkg.Group) {
	log := r.log.With("group_id", group.GroupID)

	start := time.Now()
	log.Infow("starting reconciliation")

	reconcileCfg := scaler.ParseReconciliationConfig(group.ReconciliationConfigJSON.String)

	token, err := scaler.Decrypt(r.secretKey, group.EncryptedLinodeToken)
	if err != nil {
		metrics.ReconciliationsTotal.WithLabelValues(group.GroupID, "failure").Inc()
		log.Errorw("failed to decrypt token for reconciliation", "error", err)
		r.emitEventWithMeta(group.GroupID, "", "reconcile_failed", "error",
			fmt.Sprintf("Failed to decrypt token: %v", err),
			map[string]interface{}{
				"error": err.Error(),
				"phase": "token_decryption",
			})
		return
	}

	linodeClient := linode.NewClient(token, "https://api.linode.com/v4", 5)
	requiredTags := scaler.ParseTags(group.TagsJSON.String)

	// Get Linodes matching group tags
	linodes, err := linodeClient.ListLinodes(requiredTags)
	if err != nil {
		metrics.LinodeAPIErrorsTotal.WithLabelValues(group.GroupID, "list_instances").Inc()
		metrics.ReconciliationsTotal.WithLabelValues(group.GroupID, "failure").Inc()
		log.Errorw("failed to list linodes for reconciliation", "error", err)
		r.emitEventWithMeta(group.GroupID, "", "reconcile_failed", "error",
			fmt.Sprintf("Failed to list linodes: %v", err),
			map[string]interface{}{
				"error": err.Error(),
				"phase": "linode_api_list",
			})
		return
	}

	// Get DB instances
	dbInstances, err := dbpkg.GetAllNonDeletedInstances(r.db, group.GroupID)
	if err != nil {
		metrics.ReconciliationsTotal.WithLabelValues(group.GroupID, "failure").Inc()
		log.Errorw("failed to get DB instances", "error", err)
		return
	}

	// Build maps
	linodeByID := make(map[int64]linode.LinodeInstance)
	for _, l := range linodes {
		linodeByID[l.ID] = l
	}

	dbByLinodeID := make(map[int64]dbpkg.Instance)
	for _, inst := range dbInstances {
		if inst.LinodeID.Valid {
			dbByLinodeID[inst.LinodeID.Int64] = inst
		}
	}

	// Detect missing linodes (in DB but not in Linode API - already deleted externally)
	missingCount := 0
	for _, inst := range dbInstances {
		if !inst.LinodeID.Valid {
			continue
		}
		if _, exists := linodeByID[inst.LinodeID.Int64]; !exists {
			if inst.Status != "deleted" && inst.Status != "deleting" {
				log.Warnw("instance missing from Linode API (external deletion?)",
					"instance_id", inst.ID, "linode_id", inst.LinodeID.Int64)
				r.emitEvent(group.GroupID, inst.ID, "drift_detected", "warning",
					fmt.Sprintf("Linode %d not found in API, marking as deleted", inst.LinodeID.Int64))
				dbpkg.MarkInstanceDeleted(r.db, inst.ID)
				dbpkg.InsertDriftRecord(r.db, group.GroupID, inst.LinodeID.Int64,
					"missing_linode",
					fmt.Sprintf("Linode %d was in DB but not found in Linode API", inst.LinodeID.Int64))
				missingCount++
			}
		}
	}

	// Auto-replace: maintain desired state by scaling up or down as needed
	if reconcileCfg.AutoReplace {
		r.maybeQueueReplacement(group, log)
		r.maybeQueueScaleDown(group, log)
	}

	// Detect unmanaged matching linodes (in API with tags, but not in DB)
	for _, l := range linodes {
		if _, exists := dbByLinodeID[l.ID]; !exists {
			log.Warnw("unmanaged linode found with group tags",
				"linode_id", l.ID, "label", l.Label)
			r.emitEvent(group.GroupID, "", "drift_detected", "warning",
				fmt.Sprintf("Unmanaged linode %d (%s) found with group tags", l.ID, l.Label))
			dbpkg.InsertDriftRecord(r.db, group.GroupID, l.ID,
				"unmanaged_drift",
				fmt.Sprintf("Linode %d (%s) has group tags but is not in DB", l.ID, l.Label))
		}
	}

	// Finalize pending imports: validate against Linode API and transition to active
	r.finalizePendingImports(group, linodeClient, linodeByID, log)

	elapsed := time.Since(start).Seconds()
	metrics.ReconciliationDuration.WithLabelValues(group.GroupID).Observe(elapsed)
	metrics.ReconciliationsTotal.WithLabelValues(group.GroupID, "success").Inc()
	log.Infow("reconciliation complete", "duration_seconds", elapsed)
}

func (r *Reconciler) finalizePendingImports(group *dbpkg.Group, linodeClient *linode.Client, linodeByID map[int64]linode.LinodeInstance, log *zap.SugaredLogger) {
	pending, err := dbpkg.GetPendingImports(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to get pending imports", "error", err)
		return
	}

	for _, inst := range pending {
		if !inst.LinodeID.Valid {
			log.Warnw("imported instance has no linode_id, marking failed", "instance_id", inst.ID)
			dbpkg.UpdateInstanceStatus(r.db, inst.ID, "failed")
			continue
		}

		linodeID := inst.LinodeID.Int64

		// Check if the Linode exists (prefer the already-fetched list, fall back to direct API call)
		linodeData, found := linodeByID[linodeID]
		if !found {
			fetched, err := linodeClient.GetLinode(linodeID)
			if err != nil {
				log.Warnw("imported linode not found in API, marking failed",
					"instance_id", inst.ID, "linode_id", linodeID, "error", err)
				dbpkg.UpdateInstanceStatus(r.db, inst.ID, "failed")
				r.emitEvent(group.GroupID, inst.ID, "import_failed", "error",
					fmt.Sprintf("Imported linode %d not found in API: %v", linodeID, err))
				continue
			}
			linodeData = *fetched
		}

		// Populate instance metadata from Linode API data
		dbpkg.SetInstanceLinodeData(r.db, inst.ID, linodeData.ID, linodeData.Label)

		var publicIP, privateIP string
		for _, ip := range linodeData.IPv4 {
			if isPrivateIP(ip) {
				if privateIP == "" {
					privateIP = ip
				}
			} else {
				publicIP = ip
			}
		}

		// Try to get VPC IP
		vpcIP, _ := linodeClient.GetLinodeVPCIP(linodeData.ID)

		dbpkg.UpdateInstanceIPs(r.db, inst.ID,
			toNullString(publicIP),
			toNullString(privateIP),
			toNullString(vpcIP),
		)

		dbpkg.UpdateInstanceStatus(r.db, inst.ID, "active")
		dbpkg.ResolveDriftRecord(r.db, group.GroupID, linodeID)

		log.Infow("import finalized",
			"instance_id", inst.ID, "linode_id", linodeID, "label", linodeData.Label,
			"public_ip", publicIP, "private_ip", privateIP, "vpc_ip", vpcIP)
		r.emitEvent(group.GroupID, inst.ID, "import_completed", "info",
			fmt.Sprintf("Imported linode %d (%s) is now active", linodeID, linodeData.Label))
	}
}

func (r *Reconciler) maybeQueueReplacement(group *dbpkg.Group, log *zap.SugaredLogger) {
	active, err := dbpkg.CountActiveInstances(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to count active instances for auto-replace", "error", err)
		return
	}
	creating, err := dbpkg.CountCreatingInstances(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to count creating instances for auto-replace", "error", err)
		return
	}

	current := active + creating
	target := group.DesiredCount
	if target < group.MinInstances {
		target = group.MinInstances
	}

	deficit := target - current
	if deficit <= 0 {
		return
	}

	// Don't queue if there's already a pending scale-up for this group
	hasPending, err := dbpkg.HasPendingScaleUp(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to check pending scale requests", "error", err)
		return
	}
	if hasPending {
		return
	}

	reqID := fmt.Sprintf("auto-replace-%s-%d", group.GroupID, time.Now().UnixNano())
	req := &dbpkg.ScaleRequest{
		ID:          reqID,
		GroupID:     group.GroupID,
		RequestType: "scale_up",
		Action:      sql.NullString{String: "scale_up", Valid: true},
		Amount:      sql.NullInt64{Int64: int64(deficit), Valid: true},
		Status:      "queued",
		Reason:      sql.NullString{String: "auto-replace: instances missing from Linode API", Valid: true},
		Source:      sql.NullString{String: "reconciler", Valid: true},
		DryRun:      "false",
	}

	if err := dbpkg.InsertScaleRequest(r.db, req); err != nil {
		log.Errorw("failed to queue auto-replace scale request", "error", err)
		return
	}

	log.Infow("queued auto-replace scale request",
		"deficit", deficit, "active", active, "creating", creating, "target", target)
	r.emitEvent(group.GroupID, "", "auto_replace_triggered", "info",
		fmt.Sprintf("Queued scale-up of %d instance(s) to replace missing VMs", deficit))
}

func (r *Reconciler) maybeQueueScaleDown(group *dbpkg.Group, log *zap.SugaredLogger) {
	active, err := dbpkg.CountActiveInstances(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to count active instances for auto-scale-down", "error", err)
		return
	}
	creating, err := dbpkg.CountCreatingInstances(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to count creating instances for auto-scale-down", "error", err)
		return
	}

	current := active + creating
	target := group.DesiredCount
	if target > group.MaxInstances {
		target = group.MaxInstances
	}

	surplus := current - target
	if surplus <= 0 {
		return
	}

	hasPending, err := dbpkg.HasPendingScaleDown(r.db, group.GroupID)
	if err != nil {
		log.Errorw("failed to check pending scale-down requests", "error", err)
		return
	}
	if hasPending {
		return
	}

	reqID := fmt.Sprintf("auto-scaledown-%s-%d", group.GroupID, time.Now().UnixNano())
	req := &dbpkg.ScaleRequest{
		ID:          reqID,
		GroupID:     group.GroupID,
		RequestType: "scale_down",
		Action:      sql.NullString{String: "scale_down", Valid: true},
		Amount:      sql.NullInt64{Int64: int64(surplus), Valid: true},
		Status:      "queued",
		Reason:      sql.NullString{String: "auto-replace: instance count exceeds desired state", Valid: true},
		Source:      sql.NullString{String: "reconciler", Valid: true},
		DryRun:      "false",
	}

	if err := dbpkg.InsertScaleRequest(r.db, req); err != nil {
		log.Errorw("failed to queue auto-scale-down request", "error", err)
		return
	}

	log.Infow("queued auto-scale-down request",
		"surplus", surplus, "active", active, "creating", creating, "target", target)
	r.emitEvent(group.GroupID, "", "auto_scale_down_triggered", "info",
		fmt.Sprintf("Queued scale-down of %d instance(s) to match desired count", surplus))
}

func (r *Reconciler) emitEvent(groupID, instanceID, eventType, severity, message string) {
	r.emitEventWithMeta(groupID, instanceID, eventType, severity, message, nil)
}

func (r *Reconciler) emitEventWithMeta(groupID, instanceID, eventType, severity, message string, metadata map[string]interface{}) {
	e := &dbpkg.ScaleEvent{
		ID:        fmt.Sprintf("evt-%d", time.Now().UnixNano()),
		GroupID:   groupID,
		EventType: eventType,
		Severity:  severity,
		Message:   sql.NullString{String: message, Valid: true},
	}
	if instanceID != "" {
		e.InstanceID = sql.NullString{String: instanceID, Valid: true}
	}
	if metadata != nil {
		if raw, err := json.Marshal(metadata); err == nil {
			e.MetadataJSON = sql.NullString{String: string(raw), Valid: true}
		}
	}
	dbpkg.InsertScaleEvent(r.db, e)
}

func isPrivateIP(ip string) bool {
	return strings.HasPrefix(ip, "192.168.") ||
		strings.HasPrefix(ip, "10.") ||
		strings.HasPrefix(ip, "172.16.") ||
		strings.HasPrefix(ip, "172.17.") ||
		strings.HasPrefix(ip, "172.18.") ||
		strings.HasPrefix(ip, "172.19.") ||
		strings.HasPrefix(ip, "172.2") ||
		strings.HasPrefix(ip, "172.30.") ||
		strings.HasPrefix(ip, "172.31.")
}

func toNullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
