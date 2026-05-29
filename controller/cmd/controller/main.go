package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"

	"github.com/linode-instance-autoscaler/controller/internal/config"
	dbpkg "github.com/linode-instance-autoscaler/controller/internal/db"
	"github.com/linode-instance-autoscaler/controller/internal/metricpoller"
	"github.com/linode-instance-autoscaler/controller/internal/metrics"
	"github.com/linode-instance-autoscaler/controller/internal/reconciler"
	"github.com/linode-instance-autoscaler/controller/internal/scaler"
)

func main() {
	cfg := config.Load()

	logger, _ := zap.NewProduction()
	defer logger.Sync()
	log := logger.Sugar()

	log.Infow("controller starting",
		"poll_interval", cfg.PollInterval,
		"reconcile_interval", cfg.ReconcileInterval,
	)

	db, err := dbpkg.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalw("failed to connect to database", "error", err)
	}
	defer db.Close()

	log.Infow("connected to database")

	s := scaler.New(db, cfg.SecretKey, log)
	rec := reconciler.New(db, cfg.SecretKey, log)

	// Start metric-based scaling poller (non-blocking)
	mp := metricpoller.NewPoller(db, log)
	mp.Start()

	// Start metrics server
	go func() {
		mux := http.NewServeMux()
		mux.Handle("/metrics", promhttp.Handler())
		mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			w.Write([]byte(`{"status":"ok"}`))
		})
		log.Infow("metrics server starting", "addr", cfg.MetricsAddr)
		if err := http.ListenAndServe(cfg.MetricsAddr, mux); err != nil {
			log.Fatalw("metrics server failed", "error", err)
		}
	}()

	// Start reconciliation loop
	go func() {
		ticker := time.NewTicker(time.Duration(cfg.ReconcileInterval) * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			groups, err := listEnabledGroups(db)
			if err != nil {
				log.Errorw("failed to list groups for reconciliation", "error", err)
				continue
			}
			for _, g := range groups {
				groupCopy := g
				go rec.ReconcileGroup(&groupCopy)
			}
		}
	}()

	// Main scale request poller
	ticker := time.NewTicker(time.Duration(cfg.PollInterval) * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		metrics.RefreshGauges(db)
		processScaleRequests(db, s, log, cfg)
	}
}

func processScaleRequests(db *sql.DB, s *scaler.Scaler, log *zap.SugaredLogger, cfg *config.Config) {
	requests, err := dbpkg.GetPendingScaleRequests(db)
	if err != nil {
		log.Errorw("failed to get pending scale requests", "error", err)
		return
	}

	for _, req := range requests {
		reqCopy := req
		go processRequest(db, s, log, cfg, &reqCopy)
	}
}

func processRequest(db *sql.DB, s *scaler.Scaler, log *zap.SugaredLogger, cfg *config.Config, req *dbpkg.ScaleRequest) {
	log = log.With("request_id", req.ID, "group_id", req.GroupID)

	group, err := dbpkg.GetGroupByGroupID(db, req.GroupID)
	if err != nil {
		log.Errorw("group not found", "error", err)
		dbpkg.UpdateScaleRequestStatus(db, req.ID, "failed")
		return
	}

	if !group.Enabled {
		log.Warnw("group is disabled")
		dbpkg.UpdateScaleRequestStatus(db, req.ID, "cancelled")
		return
	}

	// Determine action and amount
	action, amount := resolveScaleAction(db, req, group)
	if action == "" {
		log.Warnw("could not resolve scale action")
		dbpkg.UpdateScaleRequestStatus(db, req.ID, "failed")
		return
	}

	// Update group desired_count when explicitly set
	if req.DesiredCount.Valid {
		dbpkg.UpdateGroupDesiredCount(db, req.GroupID, int(req.DesiredCount.Int64))
	}

	// Check cooldown - only applies to explicit scale_up/scale_down requests,
	// not to requests that are fulfilling the desired_count target.
	skipCooldown := false
	if req.RequestType == "scale" || req.RequestType == "set_desired_count" {
		skipCooldown = true
	}
	if req.DesiredCount.Valid {
		skipCooldown = true
	}

	if !skipCooldown {
		cooldownCfg, _ := scaler.ParseCooldownConfig(group.CooldownConfigJSON.String)
		if action == "scale_up" {
			lastEvent, _ := dbpkg.GetLastScaleEventOfType(db, req.GroupID, "scale_up_completed")
			clearEvent, _ := dbpkg.GetLastScaleEventOfType(db, req.GroupID, "cooldown_cleared")
			cooldownCleared := clearEvent != nil && lastEvent != nil && clearEvent.CreatedAt.After(lastEvent.CreatedAt)
			if lastEvent != nil && !cooldownCleared {
				elapsed := time.Since(lastEvent.CreatedAt).Seconds()
				if elapsed < float64(cooldownCfg.ScaleUpSeconds) {
					log.Infow("scale-up blocked by cooldown", "elapsed", elapsed, "required", cooldownCfg.ScaleUpSeconds)
					metrics.ScaleBlockedTotal.WithLabelValues(req.GroupID, "cooldown").Inc()
					dbpkg.UpdateScaleRequestStatus(db, req.ID, "blocked_by_cooldown")
					return
				}
			}
		} else if action == "scale_down" {
			lastEvent, _ := dbpkg.GetLastScaleEventOfType(db, req.GroupID, "scale_down_completed")
			clearEvent, _ := dbpkg.GetLastScaleEventOfType(db, req.GroupID, "cooldown_cleared")
			cooldownCleared := clearEvent != nil && lastEvent != nil && clearEvent.CreatedAt.After(lastEvent.CreatedAt)
			if lastEvent != nil && !cooldownCleared {
				elapsed := time.Since(lastEvent.CreatedAt).Seconds()
				if elapsed < float64(cooldownCfg.ScaleDownSeconds) {
					log.Infow("scale-down blocked by cooldown", "elapsed", elapsed, "required", cooldownCfg.ScaleDownSeconds)
					metrics.ScaleBlockedTotal.WithLabelValues(req.GroupID, "cooldown").Inc()
					dbpkg.UpdateScaleRequestStatus(db, req.ID, "blocked_by_cooldown")
					return
				}
			}
		}
	}

	if action == "scale_up" {
		remaining := amount
		anySuccess := false
		for remaining > 0 {
			active, _ := countActiveInstances(db, req.GroupID)
			creating, _ := countCreatingInstances(db, req.GroupID)
			inFlight := int(active) + int(creating)

			// Cap at desired_count to prevent over-provisioning
			cap := group.MaxInstances
			if group.DesiredCount > 0 && group.DesiredCount < cap {
				cap = group.DesiredCount
			}
			canCreate := cap - inFlight
			if canCreate <= 0 {
				if !anySuccess {
					log.Infow("already at or above target", "in_flight", inFlight, "cap", cap)
					metrics.ScaleBlockedTotal.WithLabelValues(req.GroupID, "max_instances").Inc()
					dbpkg.UpdateScaleRequestStatus(db, req.ID, "blocked_by_max_instances")
					return
				}
				break
			}

			batch := remaining
			if batch > group.MaxScaleStep {
				batch = group.MaxScaleStep
			}
			if batch > canCreate {
				batch = canCreate
			}

			if err := s.ExecuteScaleUp(req, group, batch); err != nil {
				log.Errorw("scale-up batch failed", "error", err, "batch_size", batch)
				metrics.ScaleRequestsTotal.WithLabelValues(req.GroupID, "scale_up", "failed").Inc()
				metrics.ScaleFailuresTotal.WithLabelValues(req.GroupID).Inc()
				if !anySuccess {
					s.FailScaleUp(req, req.GroupID)
					return
				}
				break
			}
			anySuccess = true
			remaining -= batch
		}
		metrics.ScaleRequestsTotal.WithLabelValues(req.GroupID, "scale_up", "succeeded").Inc()
		s.FinalizeScaleUp(req, req.GroupID)
	} else if action == "scale_down" {
		if err := s.ExecuteScaleDown(req, group, amount); err != nil {
			log.Errorw("scale-down failed", "error", err)
			metrics.ScaleRequestsTotal.WithLabelValues(req.GroupID, "scale_down", "failed").Inc()
			metrics.ScaleFailuresTotal.WithLabelValues(req.GroupID).Inc()
		} else {
			metrics.ScaleRequestsTotal.WithLabelValues(req.GroupID, "scale_down", "succeeded").Inc()
		}
	}
}

func resolveScaleAction(db *sql.DB, req *dbpkg.ScaleRequest, group *dbpkg.Group) (string, int) {
	switch req.RequestType {
	case "scale_up":
		amount := 1
		if req.Amount.Valid {
			amount = int(req.Amount.Int64)
		}
		return "scale_up", amount
	case "scale_down":
		amount := 1
		if req.Amount.Valid {
			amount = int(req.Amount.Int64)
		}
		return "scale_down", amount
	case "scale", "set_desired_count":
		if req.Action.Valid {
			switch req.Action.String {
			case "scale_up":
				amount := 1
				if req.Amount.Valid {
					amount = int(req.Amount.Int64)
				}
				return "scale_up", amount
			case "scale_down":
				amount := 1
				if req.Amount.Valid {
					amount = int(req.Amount.Int64)
				}
				return "scale_down", amount
			}
		}
		if req.DesiredCount.Valid {
			desired := int(req.DesiredCount.Int64)
			active, _ := countActiveInstances(db, req.GroupID)
			creating, _ := countCreatingInstances(db, req.GroupID)
			current := int(active) + int(creating)
			if desired > current {
				return "scale_up", desired - current
			} else if desired < current {
				return "scale_down", current - desired
			}
		}
	}
	return "", 0
}

func countActiveInstances(db *sql.DB, groupID string) (int64, error) {
	var count int64
	err := db.QueryRow(
		`SELECT COUNT(*) FROM instances WHERE group_id = $1 AND status = 'active' AND deleted_at IS NULL`,
		groupID,
	).Scan(&count)
	return count, err
}

func countCreatingInstances(db *sql.DB, groupID string) (int64, error) {
	var count int64
	err := db.QueryRow(
		`SELECT COUNT(*) FROM instances WHERE group_id = $1 AND status IN ('creating', 'booting', 'waiting_initial_delay', 'checking_tcp', 'checking_http', 'attaching_to_nodebalancer') AND deleted_at IS NULL`,
		groupID,
	).Scan(&count)
	return count, err
}

func listEnabledGroups(db *sql.DB) ([]dbpkg.Group, error) {
	rows, err := db.Query(`
		SELECT id, group_id, enabled, region, type, image,
		       min_instances, max_instances, desired_count, max_scale_step,
		       label_prefix, protected_tag, nodebalancer_id,
		       network_config_json, readiness_config_json, cooldown_config_json,
		       reconciliation_config_json, alerting_config_json, boot_config_json,
		       tags_json, nodebalancer_config_json, metric_scaling_config_json,
		       encrypted_linode_token, created_at, updated_at, deleted_at
		FROM groups WHERE enabled = true AND deleted_at IS NULL
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []dbpkg.Group
	for rows.Next() {
		var g dbpkg.Group
		err := rows.Scan(
			&g.ID, &g.GroupID, &g.Enabled, &g.Region, &g.Type, &g.Image,
			&g.MinInstances, &g.MaxInstances, &g.DesiredCount, &g.MaxScaleStep,
			&g.LabelPrefix, &g.ProtectedTag, &g.NodebalancerID,
			&g.NetworkConfigJSON, &g.ReadinessConfigJSON, &g.CooldownConfigJSON,
			&g.ReconciliationConfigJSON, &g.AlertingConfigJSON, &g.BootConfigJSON,
			&g.TagsJSON, &g.NodebalancerConfigJSON, &g.MetricScalingConfigJSON,
			&g.EncryptedLinodeToken, &g.CreatedAt, &g.UpdatedAt, &g.DeletedAt,
		)
		if err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, nil
}

// groupConfigJSON is used for reconciliation config parsing
type groupReconciliationConfig struct {
	Enabled         bool `json:"enabled"`
	IntervalSeconds int  `json:"interval_seconds"`
}

func parseReconciliationConfig(jsonStr sql.NullString) groupReconciliationConfig {
	cfg := groupReconciliationConfig{Enabled: true, IntervalSeconds: 60}
	if jsonStr.Valid && jsonStr.String != "" {
		json.Unmarshal([]byte(jsonStr.String), &cfg)
	}
	return cfg
}

// Suppress unused import warning
var _ = fmt.Sprintf
