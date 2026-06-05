package scaler

import (
	"encoding/json"
)

type NetworkConfig struct {
	Mode               string `json:"mode"`
	VPCID              int    `json:"vpc_id"`
	SubnetID           int    `json:"subnet_id"`
	FirewallID         int    `json:"firewall_id"`
	FallbackPrivateIPv4 bool  `json:"fallback_private_ipv4"`
	NAT1To1            bool   `json:"nat_1_to_1"`
}

type NodebalancerBinding struct {
	ConfigID                int    `json:"config_id"`
	BackendAddressTemplate  string `json:"backend_address_template"`
	SubnetID                int    `json:"subnet_id"`
	ActiveMode              string `json:"active_mode"`
	DrainMode               string `json:"drain_mode"`
	DrainWaitSeconds        int    `json:"drain_wait_seconds"`
	DrainParallelism        int    `json:"drain_parallelism"`
}

type NodebalancerConfig struct {
	ID       int                   `json:"id"`
	Bindings []NodebalancerBinding `json:"bindings"`
}

type BootConfig struct {
	RootPasswordStrategy string   `json:"root_password_strategy"`
	AuthorizedKeys       []string `json:"authorized_keys"`
	CloudInitUserData    string   `json:"cloud_init_user_data"`
}

type CooldownConfig struct {
	ScaleUpSeconds             int `json:"scale_up_seconds"`
	ScaleDownSeconds           int `json:"scale_down_seconds"`
	StabilizationSeconds       int `json:"stabilization_seconds"`
	ScaleRequestTimeoutSeconds int `json:"scale_request_timeout_seconds"`
}

func ParseNetworkConfig(jsonStr string) (*NetworkConfig, error) {
	if jsonStr == "" {
		return &NetworkConfig{FallbackPrivateIPv4: true}, nil
	}
	var cfg NetworkConfig
	return &cfg, json.Unmarshal([]byte(jsonStr), &cfg)
}

func ParseNodebalancerConfig(jsonStr string) (*NodebalancerConfig, error) {
	if jsonStr == "" {
		return nil, nil
	}
	var cfg NodebalancerConfig
	return &cfg, json.Unmarshal([]byte(jsonStr), &cfg)
}

func ParseBootConfig(jsonStr string) (*BootConfig, error) {
	if jsonStr == "" {
		return &BootConfig{RootPasswordStrategy: "generate_and_encrypt"}, nil
	}
	var cfg BootConfig
	return &cfg, json.Unmarshal([]byte(jsonStr), &cfg)
}

func ParseCooldownConfig(jsonStr string) (*CooldownConfig, error) {
	cfg := &CooldownConfig{ScaleUpSeconds: 300, ScaleDownSeconds: 600, ScaleRequestTimeoutSeconds: 600}
	if jsonStr == "" {
		return cfg, nil
	}
	return cfg, json.Unmarshal([]byte(jsonStr), cfg)
}

type ReconciliationConfig struct {
	Enabled         bool `json:"enabled"`
	IntervalSeconds int  `json:"interval_seconds"`
	AutoReplace     bool `json:"auto_replace"`
}

func ParseReconciliationConfig(jsonStr string) *ReconciliationConfig {
	cfg := &ReconciliationConfig{Enabled: true, IntervalSeconds: 60, AutoReplace: false}
	if jsonStr == "" {
		return cfg
	}
	json.Unmarshal([]byte(jsonStr), cfg)
	return cfg
}

func ParseTags(jsonStr string) []string {
	if jsonStr == "" {
		return nil
	}
	var tags []string
	json.Unmarshal([]byte(jsonStr), &tags)
	return tags
}
