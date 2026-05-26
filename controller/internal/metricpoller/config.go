package metricpoller

import (
	"encoding/json"
)

type ScalingRule struct {
	ScaleUpThreshold        float64 `json:"scale_up_threshold"`
	ScaleUpAmount           int     `json:"scale_up_amount"`
	ScaleDownThreshold      float64 `json:"scale_down_threshold"`
	ScaleDownAmount         int     `json:"scale_down_amount"`
	EvaluationWindowSeconds int     `json:"evaluation_window_seconds"`
}

type MetricScalingConfig struct {
	Enabled             bool        `json:"enabled"`
	SourceType          string      `json:"source_type"`
	Endpoint            string      `json:"endpoint"`
	AuthType            string      `json:"auth_type"`
	AuthHeader          string      `json:"auth_header"`
	AuthTokenRef        string      `json:"auth_token_ref"`
	Query               string      `json:"query"`
	ValuePath           string      `json:"value_path"`
	PollIntervalSeconds int         `json:"poll_interval_seconds"`
	Rule                ScalingRule `json:"rule"`
}

func ParseConfig(jsonStr string) (*MetricScalingConfig, error) {
	if jsonStr == "" {
		return nil, nil
	}
	var cfg MetricScalingConfig
	if err := json.Unmarshal([]byte(jsonStr), &cfg); err != nil {
		return nil, err
	}
	if cfg.PollIntervalSeconds < 10 {
		cfg.PollIntervalSeconds = 60
	}
	if cfg.Rule.EvaluationWindowSeconds < 1 {
		cfg.Rule.EvaluationWindowSeconds = 60
	}
	return &cfg, nil
}
