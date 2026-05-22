package metrics

import (
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
)
