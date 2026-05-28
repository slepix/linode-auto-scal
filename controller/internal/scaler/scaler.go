package scaler

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	dbpkg "github.com/linode-instance-autoscaler/controller/internal/db"
	"github.com/linode-instance-autoscaler/controller/internal/linode"
	"github.com/linode-instance-autoscaler/controller/internal/metrics"
	"github.com/linode-instance-autoscaler/controller/internal/nodebalancer"
	"github.com/linode-instance-autoscaler/controller/internal/readiness"
	"go.uber.org/zap"
)

type Scaler struct {
	db        *sql.DB
	secretKey string
	log       *zap.SugaredLogger
}

func New(db *sql.DB, secretKey string, log *zap.SugaredLogger) *Scaler {
	return &Scaler{db: db, secretKey: secretKey, log: log}
}

func (s *Scaler) emitEvent(groupID, instanceID, eventType, severity, message string) {
	s.emitEventWithMeta(groupID, instanceID, eventType, severity, message, nil)
}

func (s *Scaler) emitEventWithMeta(groupID, instanceID, eventType, severity, message string, metadata map[string]interface{}) {
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
	if err := dbpkg.InsertScaleEvent(s.db, e); err != nil {
		s.log.Warnw("failed to insert event", "error", err)
	}
}

func (s *Scaler) ExecuteScaleUp(req *dbpkg.ScaleRequest, group *dbpkg.Group, amount int) error {
	log := s.log.With("group_id", group.GroupID, "request_id", req.ID)
	log.Infow("starting scale-up batch", "amount", amount)

	dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "running")

	// Parse configs
	token, err := decryptFernet(s.secretKey, group.EncryptedLinodeToken)
	if err != nil {
		log.Errorw("failed to decrypt linode token", "error", err)
		return err
	}

	linodeClient := linode.NewClient(token, "https://api.linode.com/v4", 5)
	nbClient := nodebalancer.NewClient(linodeClient)

	bootCfg, _ := ParseBootConfig(group.BootConfigJSON.String)
	networkCfg, _ := ParseNetworkConfig(group.NetworkConfigJSON.String)
	nbCfg, _ := ParseNodebalancerConfig(group.NodebalancerConfigJSON.String)
	tags := ParseTags(group.TagsJSON.String)

	readinessCfg, _ := readiness.ParseConfig(group.ReadinessConfigJSON.String)

	var successCount int64
	var wg sync.WaitGroup
	wg.Add(amount)

	for i := 0; i < amount; i++ {
		go func(idx int) {
			defer wg.Done()
			if err := s.createSingleInstance(log, linodeClient, nbClient, group, bootCfg, networkCfg, nbCfg, tags, readinessCfg); err != nil {
				log.Errorw("failed to create instance", "error", err, "instance_num", idx+1)
				s.emitEventWithMeta(group.GroupID, "", "scale_failed", "critical",
					fmt.Sprintf("Scale-up failed: %v", err),
					map[string]interface{}{
						"error":         err.Error(),
						"phase":         "scale_up",
						"instance_num":  idx + 1,
						"total_batch":   amount,
						"request_id":    req.ID,
						"region":        group.Region,
						"instance_type": group.Type,
						"image":         group.Image,
					})
			} else {
				atomic.AddInt64(&successCount, 1)
			}
		}(i)
	}

	wg.Wait()

	if successCount == 0 {
		return fmt.Errorf("all %d instance creation attempts failed", amount)
	}

	s.emitEvent(group.GroupID, "", "scale_up_batch_completed", "info",
		fmt.Sprintf("Scale-up batch completed: %d/%d instances created", successCount, amount))
	return nil
}

func (s *Scaler) FinalizeScaleUp(req *dbpkg.ScaleRequest, groupID string) {
	dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "succeeded")
	s.emitEvent(groupID, "", "scale_up_completed", "info", "Scale-up request completed")
}

func (s *Scaler) FailScaleUp(req *dbpkg.ScaleRequest, groupID string) {
	dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "failed")
}

func (s *Scaler) createSingleInstance(
	log *zap.SugaredLogger,
	linodeClient *linode.Client,
	nbClient *nodebalancer.Client,
	group *dbpkg.Group,
	bootCfg *BootConfig,
	networkCfg *NetworkConfig,
	nbCfg *NodebalancerConfig,
	tags []string,
	readinessCfg *readiness.Config,
) error {
	label := GenerateInstanceLabel(group.LabelPrefix, group.Region)

	// Generate root password
	rootPass, err := GeneratePassword(32)
	if err != nil {
		return fmt.Errorf("generate password: %w", err)
	}

	// Build Linode Interfaces (new generation API)
	var interfaces []linode.LinodeInterface
	useLinodeInterfaces := networkCfg != nil && networkCfg.VPCID > 0

	if useLinodeInterfaces {
		// Single VPC interface; use 1:1 NAT for public IP if enabled
		ipv4True := true
		vpcAddr := linode.VPCIPv4Address{Address: "auto", Primary: true}
		if networkCfg.NAT1To1 {
			vpcAddr.NAT1To1Address = "auto"
		}
		vpcIface := linode.LinodeInterface{
			VPC: &linode.LinodeVPCInterface{
				SubnetID: networkCfg.SubnetID,
				IPv4: &linode.VPCIPv4Config{
					Addresses: []linode.VPCIPv4Address{vpcAddr},
				},
			},
			DefaultRoute: &linode.DefaultRoute{IPv4: &ipv4True},
		}
		if networkCfg.FirewallID > 0 {
			fwID := networkCfg.FirewallID
			vpcIface.FirewallID = &fwID
		} else {
			noFW := -1
			vpcIface.FirewallID = &noFW
		}
		interfaces = append(interfaces, vpcIface)
	}

	createReq := linode.CreateLinodeRequest{
		Region:         group.Region,
		Type:           group.Type,
		Image:          group.Image,
		Label:          label,
		Tags:           tags,
		RootPass:       rootPass,
		AuthorizedKeys: bootCfg.AuthorizedKeys,
	}

	if useLinodeInterfaces {
		createReq.InterfaceGeneration = "linode"
		createReq.Interfaces = interfaces
	} else {
		createReq.PrivateIP = true
	}

	if bootCfg.CloudInitUserData != "" {
		encoded := base64.StdEncoding.EncodeToString([]byte(bootCfg.CloudInitUserData))
		createReq.Metadata = &linode.LinodeMetadata{UserData: encoded}
	}

	// Insert instance record first
	instanceID := fmt.Sprintf("inst-%d", time.Now().UnixNano())
	inst := &dbpkg.Instance{
		ID:        instanceID,
		GroupID:   group.GroupID,
		Status:    "creating",
		CreatedBy: "autoscaler",
	}
	if err := dbpkg.InsertInstance(s.db, inst); err != nil {
		return fmt.Errorf("insert instance record: %w", err)
	}

	log.Infow("creating linode", "label", label)
	created, err := linodeClient.CreateLinode(createReq)
	if err != nil {
		metrics.LinodeAPIErrorsTotal.WithLabelValues(group.GroupID, "create_instance").Inc()
		dbpkg.UpdateInstanceStatus(s.db, instanceID, "failed")
		return fmt.Errorf("create linode: %w", err)
	}

	// Store linode ID and label
	dbpkg.SetInstanceLinodeData(s.db, instanceID, created.ID, created.Label)

	// Encrypt and store root password
	encPass, err := Encrypt(s.secretKey, rootPass)
	if err == nil {
		dbpkg.SetInstanceEncryptedRootPassword(s.db, instanceID, encPass)
	}

	dbpkg.UpdateInstanceStatus(s.db, instanceID, "booting")
	s.emitEvent(group.GroupID, instanceID, "instance_created", "info",
		fmt.Sprintf("Linode %d (%s) created", created.ID, label))

	// Wait for boot and get IPs
	dbpkg.UpdateInstanceStatus(s.db, instanceID, "waiting_initial_delay")

	// Get IPs (poll until available)
	var publicIP, privateIP, vpcIP string
	for attempt := 0; attempt < 10; attempt++ {
		time.Sleep(10 * time.Second)
		linodeData, err := linodeClient.GetLinode(created.ID)
		if err == nil && len(linodeData.IPv4) > 0 {
			for _, ip := range linodeData.IPv4 {
				if isPrivateIP(ip) {
					if privateIP == "" {
						privateIP = ip
					}
				} else {
					publicIP = ip
				}
			}
			// Try to get VPC IP from interfaces
			if networkCfg != nil && networkCfg.VPCID > 0 {
				vpcIP, _ = linodeClient.GetLinodeVPCIP(created.ID)
			}
			if networkCfg != nil && networkCfg.VPCID > 0 && vpcIP != "" {
				break
			}
			if networkCfg == nil || networkCfg.VPCID == 0 {
				break
			}
		}
	}

	dbpkg.UpdateInstanceIPs(s.db, instanceID,
		toNullString(publicIP),
		toNullString(privateIP),
		toNullString(vpcIP),
	)

	log.Infow("resolved instance IPs", "linode_id", created.ID, "public_ip", publicIP, "private_ip", privateIP, "vpc_ip", vpcIP)

	// Select the IP to use for readiness checks
	primaryIP := vpcIP
	if primaryIP == "" {
		primaryIP = privateIP
	}
	if primaryIP == "" {
		primaryIP = publicIP
	}

	// Run readiness checks
	dbpkg.UpdateInstanceStatus(s.db, instanceID, "checking_tcp")
	if readinessCfg != nil && primaryIP != "" {
		if err := readiness.WaitForReady(readinessCfg, primaryIP); err != nil {
			log.Warnw("readiness check failed, cleaning up", "error", err, "linode_id", created.ID)
			meta := map[string]interface{}{
				"error":           err.Error(),
				"phase":           "readiness_check",
				"linode_id":       created.ID,
				"linode_label":    label,
				"target_ip":       primaryIP,
				"retry_count":     readinessCfg.RetryCount,
				"timeout_seconds": readinessCfg.OverallTimeoutSeconds,
			}
			if readinessCfg.TCP != nil && readinessCfg.TCP.Enabled {
				meta["tcp_port"] = readinessCfg.TCP.Port
			}
			if readinessCfg.HTTP != nil && readinessCfg.HTTP.Enabled {
				meta["http_url"] = readinessCfg.HTTP.URL
				meta["expected_status"] = readinessCfg.HTTP.ExpectedStatus
			}
			s.emitEventWithMeta(group.GroupID, instanceID, "readiness_failed", "error",
				fmt.Sprintf("Readiness checks failed after %d attempts: %v", readinessCfg.RetryCount, err),
				meta)
			// Cleanup
			linodeClient.DeleteLinode(created.ID)
			dbpkg.MarkInstanceDeleted(s.db, instanceID)
			return fmt.Errorf("readiness failed: %w", err)
		}
	}

	// Attach to NodeBalancer
	if nbCfg != nil && len(nbCfg.Bindings) > 0 && primaryIP != "" {
		dbpkg.UpdateInstanceStatus(s.db, instanceID, "attaching_to_nodebalancer")
		for _, binding := range nbCfg.Bindings {
			address := binding.BackendAddressTemplate
			if vpcIP != "" {
				address = strings.ReplaceAll(address, "{vpc_ipv4}", vpcIP)
			} else {
				address = strings.ReplaceAll(address, "{vpc_ipv4}", privateIP)
			}
			address = strings.ReplaceAll(address, "{private_ipv4}", privateIP)
			address = strings.ReplaceAll(address, "{public_ipv4}", publicIP)

			subnetID := binding.SubnetID
			if subnetID == 0 && networkCfg != nil {
				subnetID = networkCfg.SubnetID
			}

			nbNode, err := nbClient.CreateNode(
				int64(nbCfg.ID),
				int64(binding.ConfigID),
				nodebalancer.CreateNodeRequest{
					Label:    label,
					Address:  address,
					Weight:   100,
					Mode:     binding.ActiveMode,
					SubnetID: subnetID,
				},
			)
			if err != nil {
				metrics.NodebalancerUpdateErrorsTotal.WithLabelValues(group.GroupID).Inc()
				log.Errorw("failed to attach to nodebalancer", "error", err, "config_id", binding.ConfigID)
				s.emitEventWithMeta(group.GroupID, instanceID, "nodebalancer_update_failed", "error",
					fmt.Sprintf("Failed to attach to NB config %d: %v", binding.ConfigID, err),
					map[string]interface{}{
						"error":           err.Error(),
						"phase":           "nodebalancer_attach",
						"nodebalancer_id": nbCfg.ID,
						"config_id":       binding.ConfigID,
						"linode_id":       created.ID,
						"linode_label":    label,
						"address":         address,
					})
				continue
			}

			b := &dbpkg.NodebalancerBinding{
				ID:             fmt.Sprintf("nb-%d", time.Now().UnixNano()),
				GroupID:        group.GroupID,
				InstanceID:     instanceID,
				NodebalancerID: int64(nbCfg.ID),
				ConfigID:       int64(binding.ConfigID),
				NodeID:         sql.NullInt64{Int64: nbNode.ID, Valid: true},
				Address:        sql.NullString{String: address, Valid: true},
				SubnetID:       sql.NullInt64{Int64: int64(binding.SubnetID), Valid: binding.SubnetID > 0},
				Mode:           binding.ActiveMode,
				Status:         "active",
			}
			dbpkg.InsertNodebalancerBinding(s.db, b)
		}
	}

	dbpkg.UpdateInstanceStatus(s.db, instanceID, "active")
	s.emitEvent(group.GroupID, instanceID, "instance_active", "info",
		fmt.Sprintf("Instance %s (linode %d) is now active", instanceID, created.ID))

	return nil
}

func (s *Scaler) ExecuteScaleDown(req *dbpkg.ScaleRequest, group *dbpkg.Group, amount int) error {
	log := s.log.With("group_id", group.GroupID, "request_id", req.ID)
	log.Infow("starting scale-down", "amount", amount)

	if err := dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "running"); err != nil {
		return err
	}

	activeInstances, err := dbpkg.GetActiveInstances(s.db, group.GroupID)
	if err != nil {
		dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "failed")
		return err
	}

	// Parse targeted instance IDs (Linode IDs) if specified
	var targetLinodeIDs []int64
	if req.InstanceIDsJSON.Valid && req.InstanceIDsJSON.String != "" {
		if err := json.Unmarshal([]byte(req.InstanceIDsJSON.String), &targetLinodeIDs); err != nil {
			log.Errorw("failed to parse instance_ids_json", "error", err)
			dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "failed")
			return fmt.Errorf("invalid instance_ids_json: %w", err)
		}
	}

	var toDelete []dbpkg.Instance

	if len(targetLinodeIDs) > 0 {
		// Targeted scale-down: select specific instances by Linode ID
		targetSet := make(map[int64]bool, len(targetLinodeIDs))
		for _, id := range targetLinodeIDs {
			targetSet[id] = true
		}

		for _, inst := range activeInstances {
			if inst.LinodeID.Valid && targetSet[inst.LinodeID.Int64] {
				if inst.Protected {
					log.Warnw("skipping protected instance from targeted scale-down",
						"instance_id", inst.ID, "linode_id", inst.LinodeID.Int64)
					continue
				}
				toDelete = append(toDelete, inst)
			}
		}

		if len(toDelete) == 0 {
			log.Warnw("no matching active instances found for targeted scale-down",
				"requested_linode_ids", targetLinodeIDs)
			dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "failed")
			return fmt.Errorf("no matching active instances found for the specified Linode IDs")
		}

		// Still respect min_instances
		nonTargeted := len(activeInstances) - len(toDelete)
		if nonTargeted < group.MinInstances {
			allowed := len(activeInstances) - group.MinInstances
			if allowed <= 0 {
				log.Infow("targeted scale-down blocked by min_instances constraint")
				dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "blocked_by_min_instances")
				return nil
			}
			toDelete = toDelete[:allowed]
		}
	} else {
		// Default behavior: newest-first strategy
		var candidates []dbpkg.Instance
		for _, inst := range activeInstances {
			if !inst.Protected {
				candidates = append(candidates, inst)
			}
		}

		if len(candidates) < amount {
			amount = len(candidates)
		}

		if len(candidates)-amount < group.MinInstances {
			amount = len(candidates) - group.MinInstances
		}

		if amount <= 0 {
			log.Infow("no instances eligible for scale-down (min_instances constraint)")
			dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "blocked_by_min_instances")
			return nil
		}

		toDelete = candidates[:amount]
	}

	token, err := decryptFernet(s.secretKey, group.EncryptedLinodeToken)
	if err != nil {
		dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "failed")
		return err
	}

	linodeClient := linode.NewClient(token, "https://api.linode.com/v4", 5)
	nbClient := nodebalancer.NewClient(linodeClient)
	nbCfg, _ := ParseNodebalancerConfig(group.NodebalancerConfigJSON.String)

	// Determine parallelism from config (default 1 = sequential)
	parallelism := 1
	if nbCfg != nil && len(nbCfg.Bindings) > 0 && nbCfg.Bindings[0].DrainParallelism > 0 {
		parallelism = nbCfg.Bindings[0].DrainParallelism
	}

	var successCount int64
	var wg sync.WaitGroup
	sem := make(chan struct{}, parallelism)

	for i := range toDelete {
		wg.Add(1)
		go func(inst dbpkg.Instance) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			if err := s.deleteInstance(log, linodeClient, nbClient, nbCfg, group.GroupID, &inst); err != nil {
				log.Errorw("failed to delete instance", "error", err, "instance_id", inst.ID)
				s.emitEventWithMeta(group.GroupID, inst.ID, "scale_failed", "error",
					fmt.Sprintf("Scale-down failed for instance %s: %v", inst.ID, err),
					map[string]interface{}{
						"error":        err.Error(),
						"phase":        "scale_down",
						"instance_id":  inst.ID,
						"linode_id":    inst.LinodeID.Int64,
						"linode_label": inst.LinodeLabel.String,
						"request_id":   req.ID,
					})
			} else {
				atomic.AddInt64(&successCount, 1)
			}
		}(toDelete[i])
	}

	wg.Wait()

	if successCount == 0 {
		dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "failed")
		return fmt.Errorf("all %d scale-down attempts failed", len(toDelete))
	}

	dbpkg.UpdateScaleRequestStatus(s.db, req.ID, "succeeded")
	s.emitEvent(group.GroupID, "", "scale_down_completed", "info",
		fmt.Sprintf("Scale-down completed: %d instances removed", successCount))
	return nil
}

func (s *Scaler) deleteInstance(
	log *zap.SugaredLogger,
	linodeClient *linode.Client,
	nbClient *nodebalancer.Client,
	nbCfg *NodebalancerConfig,
	groupID string,
	inst *dbpkg.Instance,
) error {
	// Get bindings to determine if drain is needed
	bindings, err := dbpkg.GetBindingsForInstance(s.db, inst.ID)
	if err != nil {
		return fmt.Errorf("get bindings: %w", err)
	}

	// Only drain if there are active NodeBalancer bindings
	if len(bindings) > 0 {
		log.Infow("draining instance", "instance_id", inst.ID, "linode_id", inst.LinodeID.Int64)
		dbpkg.UpdateInstanceStatus(s.db, inst.ID, "draining")

		drainWait := 60
		if nbCfg != nil && len(nbCfg.Bindings) > 0 {
			drainWait = nbCfg.Bindings[0].DrainWaitSeconds
		}

		for _, b := range bindings {
			if b.NodeID.Valid {
				if err := nbClient.UpdateNodeMode(b.NodebalancerID, b.ConfigID, b.NodeID.Int64, "drain"); err != nil {
					metrics.NodebalancerUpdateErrorsTotal.WithLabelValues(groupID).Inc()
					log.Warnw("failed to set drain mode", "error", err, "node_id", b.NodeID.Int64)
					s.emitEventWithMeta(groupID, inst.ID, "nodebalancer_update_failed", "warning",
						fmt.Sprintf("Failed to drain NB node %d: %v", b.NodeID.Int64, err),
						map[string]interface{}{
							"error":           err.Error(),
							"phase":           "nodebalancer_drain",
							"nodebalancer_id": b.NodebalancerID,
							"config_id":       b.ConfigID,
							"node_id":         b.NodeID.Int64,
							"instance_id":     inst.ID,
							"linode_id":       inst.LinodeID.Int64,
						})
				} else {
					dbpkg.UpdateNodebalancerBindingMode(s.db, b.ID, "drain")
				}
			}
		}

		log.Infow("waiting for drain", "seconds", drainWait)
		time.Sleep(time.Duration(drainWait) * time.Second)

		for _, b := range bindings {
			if b.NodeID.Valid {
				if err := nbClient.DeleteNode(b.NodebalancerID, b.ConfigID, b.NodeID.Int64); err != nil {
					log.Warnw("failed to delete NB node", "error", err, "node_id", b.NodeID.Int64)
				} else {
					dbpkg.DeleteNodebalancerBinding(s.db, b.ID)
				}
			}
		}
	}

	// Delete Linode
	dbpkg.UpdateInstanceStatus(s.db, inst.ID, "deleting")
	if inst.LinodeID.Valid {
		if err := linodeClient.DeleteLinode(inst.LinodeID.Int64); err != nil {
			metrics.LinodeAPIErrorsTotal.WithLabelValues(groupID, "delete_instance").Inc()
			log.Errorw("failed to delete linode", "error", err, "linode_id", inst.LinodeID.Int64)
			return fmt.Errorf("delete linode %d: %w", inst.LinodeID.Int64, err)
		}
	}

	dbpkg.MarkInstanceDeleted(s.db, inst.ID)
	s.emitEvent(groupID, inst.ID, "instance_deleted", "info",
		fmt.Sprintf("Instance %s (linode %d) deleted", inst.ID, inst.LinodeID.Int64))
	return nil
}

// decryptFernet handles Python Fernet-encrypted tokens
func decryptFernet(secretKey, ciphertext string) (string, error) {
	result, err := Decrypt(secretKey, ciphertext)
	if err != nil {
		return "", fmt.Errorf("decrypt linode token: %w", err)
	}
	return result, nil
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
