package metricpoller

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	dbpkg "github.com/linode-instance-autoscaler/controller/internal/db"
	"github.com/linode-instance-autoscaler/controller/internal/metrics"
	"go.uber.org/zap"
)

type Poller struct {
	db  *sql.DB
	log *zap.SugaredLogger

	mu       sync.Mutex
	samples  map[string]*sampleWindow
	lastPoll map[string]time.Time
}

type sampleWindow struct {
	values    []timedSample
	windowSec int
}

type timedSample struct {
	ts    time.Time
	value float64
}

func NewPoller(db *sql.DB, log *zap.SugaredLogger) *Poller {
	return &Poller{
		db:       db,
		log:      log.Named("metric-poller"),
		samples:  make(map[string]*sampleWindow),
		lastPoll: make(map[string]time.Time),
	}
}

func (p *Poller) Start() {
	go p.loop()
}

func (p *Poller) loop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		p.tick()
	}
}

func (p *Poller) tick() {
	groups, err := p.getGroupsWithMetricScaling()
	if err != nil {
		p.log.Errorw("failed to list groups with metric scaling", "error", err)
		return
	}

	for i := range groups {
		g := groups[i]
		go p.pollGroup(g.GroupID, g.MetricScalingConfigJSON)
	}
}

type groupMetricInfo struct {
	GroupID                 string
	MetricScalingConfigJSON sql.NullString
}

func (p *Poller) getGroupsWithMetricScaling() ([]groupMetricInfo, error) {
	rows, err := p.db.Query(`
		SELECT group_id, metric_scaling_config_json
		FROM groups
		WHERE enabled = true AND deleted_at IS NULL
		  AND metric_scaling_config_json IS NOT NULL
		  AND metric_scaling_config_json != ''
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []groupMetricInfo
	for rows.Next() {
		var g groupMetricInfo
		if err := rows.Scan(&g.GroupID, &g.MetricScalingConfigJSON); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, nil
}

func (p *Poller) pollGroup(groupID string, configJSON sql.NullString) {
	if !configJSON.Valid || configJSON.String == "" {
		return
	}

	cfg, err := ParseConfig(configJSON.String)
	if err != nil || cfg == nil || !cfg.Enabled {
		return
	}

	p.mu.Lock()
	lastPoll := p.lastPoll[groupID]
	p.mu.Unlock()

	if time.Since(lastPoll) < time.Duration(cfg.PollIntervalSeconds)*time.Second {
		return
	}

	p.mu.Lock()
	p.lastPoll[groupID] = time.Now()
	p.mu.Unlock()

	fetchStart := time.Now()
	value, err := FetchMetricValue(cfg)
	fetchDuration := time.Since(fetchStart).Seconds()

	if err != nil {
		metrics.MetricFetchErrorsTotal.WithLabelValues(groupID, cfg.SourceType).Inc()
		metrics.MetricFetchDuration.WithLabelValues(groupID, cfg.SourceType).Observe(fetchDuration)
		p.log.Warnw("metric fetch failed", "group_id", groupID, "source", cfg.SourceType, "error", err)
		p.emitEventWithMeta(groupID, "metric_fetch_failed", "warning",
			fmt.Sprintf("Failed to fetch metric from %s: %v", cfg.SourceType, err),
			map[string]interface{}{
				"error":       err.Error(),
				"phase":       "metric_fetch",
				"source_type": cfg.SourceType,
				"endpoint":    cfg.Endpoint,
				"query":       cfg.Query,
			})
		return
	}

	metrics.MetricFetchDuration.WithLabelValues(groupID, cfg.SourceType).Observe(fetchDuration)

	p.log.Debugw("metric fetched", "group_id", groupID, "value", value)

	p.mu.Lock()
	sw, exists := p.samples[groupID]
	if !exists {
		sw = &sampleWindow{windowSec: cfg.Rule.EvaluationWindowSeconds}
		p.samples[groupID] = sw
	}
	sw.windowSec = cfg.Rule.EvaluationWindowSeconds
	sw.values = append(sw.values, timedSample{ts: time.Now(), value: value})
	sw.prune()
	avg := sw.average()
	count := len(sw.values)
	p.mu.Unlock()

	if count < 2 {
		return
	}

	p.evaluate(groupID, cfg, avg)
}

func (p *Poller) evaluate(groupID string, cfg *MetricScalingConfig, avg float64) {
	if avg >= cfg.Rule.ScaleUpThreshold {
		group, err := dbpkg.GetGroupByGroupID(p.db, groupID)
		if err != nil {
			return
		}
		active, _ := dbpkg.CountActiveInstances(p.db, groupID)
		creating, _ := dbpkg.CountCreatingInstances(p.db, groupID)
		current := active + creating

		if current >= group.MaxInstances {
			p.emitEvent(groupID, "metric_scale_capped", "info",
				fmt.Sprintf("Metric avg %.2f >= threshold %.2f, but already at max instances (%d/%d)",
					avg, cfg.Rule.ScaleUpThreshold, current, group.MaxInstances))
			return
		}

		if group.DesiredCount > active {
			return
		}

		pending, _ := dbpkg.HasPendingScaleUp(p.db, groupID)
		if pending {
			return
		}
		p.log.Infow("metric threshold breached: scale up",
			"group_id", groupID, "avg", avg, "threshold", cfg.Rule.ScaleUpThreshold)

		p.submitScaleRequest(groupID, "scale_up", cfg.Rule.ScaleUpAmount,
			fmt.Sprintf("Metric avg %.2f >= threshold %.2f", avg, cfg.Rule.ScaleUpThreshold))

	} else if avg <= cfg.Rule.ScaleDownThreshold {
		group, err := dbpkg.GetGroupByGroupID(p.db, groupID)
		if err != nil {
			return
		}
		active, _ := dbpkg.CountActiveInstances(p.db, groupID)

		if active <= group.MinInstances {
			return
		}

		if group.DesiredCount < active {
			return
		}

		pending, _ := dbpkg.HasPendingScaleDown(p.db, groupID)
		if pending {
			return
		}
		p.log.Infow("metric threshold breached: scale down",
			"group_id", groupID, "avg", avg, "threshold", cfg.Rule.ScaleDownThreshold)

		p.submitScaleRequest(groupID, "scale_down", cfg.Rule.ScaleDownAmount,
			fmt.Sprintf("Metric avg %.2f <= threshold %.2f", avg, cfg.Rule.ScaleDownThreshold))
	}
}

func (p *Poller) submitScaleRequest(groupID, action string, amount int, reason string) {
	group, err := dbpkg.GetGroupByGroupID(p.db, groupID)
	if err == nil {
		if action == "scale_up" {
			newDesired := group.DesiredCount + amount
			if newDesired > group.MaxInstances {
				newDesired = group.MaxInstances
			}
			dbpkg.UpdateGroupDesiredCount(p.db, groupID, newDesired)
		} else if action == "scale_down" {
			newDesired := group.DesiredCount - amount
			if newDesired < group.MinInstances {
				newDesired = group.MinInstances
			}
			dbpkg.UpdateGroupDesiredCount(p.db, groupID, newDesired)
		}
	}

	req := &dbpkg.ScaleRequest{
		ID:          fmt.Sprintf("msr-%d", time.Now().UnixNano()),
		GroupID:     groupID,
		RequestType: action,
		Amount:      sql.NullInt64{Int64: int64(amount), Valid: true},
		Status:      "queued",
		Reason:      sql.NullString{String: reason, Valid: true},
		Source:      sql.NullString{String: "metric_poller", Valid: true},
		DryRun:      "false",
	}
	if err := dbpkg.InsertScaleRequest(p.db, req); err != nil {
		p.log.Errorw("failed to insert metric scale request", "group_id", groupID, "error", err)
		return
	}
	p.emitEvent(groupID, "metric_scale_triggered", "info", reason)
}

func (p *Poller) emitEvent(groupID, eventType, severity, message string) {
	p.emitEventWithMeta(groupID, eventType, severity, message, nil)
}

func (p *Poller) emitEventWithMeta(groupID, eventType, severity, message string, metadata map[string]interface{}) {
	e := &dbpkg.ScaleEvent{
		ID:        fmt.Sprintf("evt-%d", time.Now().UnixNano()),
		GroupID:   groupID,
		EventType: eventType,
		Severity:  severity,
		Message:   sql.NullString{String: message, Valid: true},
	}
	if metadata != nil {
		if raw, err := json.Marshal(metadata); err == nil {
			e.MetadataJSON = sql.NullString{String: string(raw), Valid: true}
		}
	}
	dbpkg.InsertScaleEvent(p.db, e)
}

func (sw *sampleWindow) prune() {
	cutoff := time.Now().Add(-time.Duration(sw.windowSec) * time.Second)
	start := 0
	for i, s := range sw.values {
		if s.ts.After(cutoff) {
			start = i
			break
		}
		start = i + 1
	}
	if start > 0 && start <= len(sw.values) {
		sw.values = sw.values[start:]
	}
}

func (sw *sampleWindow) average() float64 {
	if len(sw.values) == 0 {
		return 0
	}
	var sum float64
	for _, s := range sw.values {
		sum += s.value
	}
	return sum / float64(len(sw.values))
}
