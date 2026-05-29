package metrics

import (
	"database/sql"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	GroupsTotal = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "autoscaler_groups_total",
		Help: "Total number of groups",
	})
	InstancesTotal = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "autoscaler_instances_total",
		Help: "Total number of tracked instances",
	})
	InstancesActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "autoscaler_instances_active",
		Help: "Active instances",
	})
	ScaleRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_scale_requests_total",
		Help: "Total scale requests",
	}, []string{"group_id", "type", "status"})
	ScaleFailuresTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_scale_failures_total",
		Help: "Scale failures",
	}, []string{"group_id"})
	DriftRecordsTotal = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "autoscaler_drift_records_total",
		Help: "Open drift records",
	})
	LinodeAPIErrorsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_linode_api_errors_total",
		Help: "Linode API errors",
	}, []string{"group_id", "operation"})
	NodebalancerUpdateErrorsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_nodebalancer_update_errors_total",
		Help: "NodeBalancer update errors",
	}, []string{"group_id"})
	ReconciliationDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "autoscaler_reconciliation_duration_seconds",
		Help:    "Reconciliation duration",
		Buckets: prometheus.DefBuckets,
	}, []string{"group_id"})
	ReconciliationsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_reconciliations_total",
		Help: "Total reconciliations by outcome",
	}, []string{"group_id", "result"})
	ScaleRequestQueueDepth = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "autoscaler_scale_request_queue_depth",
		Help: "Number of pending scale requests",
	})
	ScaleBlockedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_scale_blocked_total",
		Help: "Scale requests blocked by constraint",
	}, []string{"group_id", "reason"})
	InstanceCreationDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "autoscaler_instance_creation_duration_seconds",
		Help:    "End-to-end instance creation duration",
		Buckets: []float64{30, 60, 90, 120, 180, 240, 300, 420, 600},
	}, []string{"group_id"})
	MetricFetchDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "autoscaler_metric_fetch_duration_seconds",
		Help:    "External metric fetch latency",
		Buckets: []float64{0.1, 0.25, 0.5, 1, 2, 5, 10, 15},
	}, []string{"group_id", "source_type"})
	MetricFetchErrorsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_metric_fetch_errors_total",
		Help: "External metric fetch failures",
	}, []string{"group_id", "source_type"})
	ReadinessCheckFailuresTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoscaler_readiness_check_failures_total",
		Help: "Readiness check failures",
	}, []string{"group_id", "check_type"})
)

func RefreshGauges(db *sql.DB) {
	var groups float64
	if err := db.QueryRow(`SELECT COUNT(*) FROM groups WHERE deleted_at IS NULL`).Scan(&groups); err == nil {
		GroupsTotal.Set(groups)
	}

	var total float64
	if err := db.QueryRow(`SELECT COUNT(*) FROM instances WHERE deleted_at IS NULL`).Scan(&total); err == nil {
		InstancesTotal.Set(total)
	}

	var active float64
	if err := db.QueryRow(`SELECT COUNT(*) FROM instances WHERE status = 'active' AND deleted_at IS NULL`).Scan(&active); err == nil {
		InstancesActive.Set(active)
	}

	var drift float64
	if err := db.QueryRow(`SELECT COUNT(*) FROM drift_records WHERE status = 'open'`).Scan(&drift); err == nil {
		DriftRecordsTotal.Set(drift)
	}

	var queueDepth float64
	if err := db.QueryRow(`SELECT COUNT(*) FROM scale_requests WHERE status IN ('queued', 'pending')`).Scan(&queueDepth); err == nil {
		ScaleRequestQueueDepth.Set(queueDepth)
	}
}
