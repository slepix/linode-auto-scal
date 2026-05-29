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
}
