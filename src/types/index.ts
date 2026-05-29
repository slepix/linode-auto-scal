export interface Group {
  id: string;
  group_id: string;
  enabled: boolean;
  region: string;
  type: string;
  image: string;
  min_instances: number;
  max_instances: number;
  desired_count: number;
  max_scale_step: number;
  label_prefix: string;
  protected_tag: string;
  nodebalancer_id: number | null;
  network_config: NetworkConfig | null;
  nodebalancer_config: NodebalancerConfig | null;
  boot_config: BootConfig | null;
  readiness_config: ReadinessConfig | null;
  cooldown_config: CooldownConfig | null;
  reconciliation_config: ReconciliationConfig | null;
  alerting_config: AlertingConfig | null;
  metric_scaling_config: MetricScalingConfig | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkConfig {
  mode: string;
  vpc_id: number | null;
  subnet_id: number | null;
  firewall_id: number | null;
  fallback_private_ipv4: boolean;
  nat_1_to_1: boolean;
}

export interface NodebalancerBinding {
  config_id: number;
  backend_address_template: string;
  subnet_id: number | null;
  active_mode: string;
  drain_mode: string;
  drain_wait_seconds: number;
  drain_parallelism: number;
}

export interface NodebalancerConfig {
  id: number;
  bindings: NodebalancerBinding[];
}

export interface BootConfig {
  root_password_strategy: string;
  authorized_keys: string[];
  cloud_init_user_data: string | null;
}

export interface TcpReadiness {
  enabled: boolean;
  port: number;
  timeout_seconds: number;
}

export interface HttpReadiness {
  enabled: boolean;
  url: string;
  expected_status: number;
  timeout_seconds: number;
}

export interface ReadinessConfig {
  initial_wait_seconds: number;
  tcp: TcpReadiness | null;
  http: HttpReadiness | null;
  overall_timeout_seconds: number;
  retry_count: number;
  delay_between_attempts_seconds: number;
}

export interface CooldownConfig {
  scale_up_seconds: number;
  scale_down_seconds: number;
}

export interface ReconciliationConfig {
  enabled: boolean;
  interval_seconds: number;
  auto_replace: boolean;
}

export interface AlertingConfig {
  enabled: boolean;
  webhook_url: string | null;
  headers: Record<string, string> | null;
  bearer_token_ref: string | null;
  send_on: string[];
}

export interface MetricScalingRule {
  scale_up_threshold: number;
  scale_up_amount: number;
  scale_down_threshold: number;
  scale_down_amount: number;
  evaluation_window_seconds: number;
}

export interface MetricScalingConfig {
  enabled: boolean;
  source_type: string;
  endpoint: string;
  auth_type: string;
  auth_header: string | null;
  auth_token_ref: string | null;
  query: string;
  value_path: string;
  poll_interval_seconds: number;
  rule: MetricScalingRule;
}

export interface GroupCreate {
  group_id: string;
  enabled: boolean;
  region: string;
  type: string;
  image: string;
  min_instances: number;
  max_instances: number;
  desired_count: number;
  max_scale_step: number;
  label_prefix?: string;
  tags?: string[];
  protected_tag?: string;
  linode_token: string;
  network?: NetworkConfig;
  nodebalancer?: NodebalancerConfig;
  boot?: BootConfig;
  readiness?: ReadinessConfig;
  cooldowns?: CooldownConfig;
  reconciliation?: ReconciliationConfig;
  alerting?: AlertingConfig;
  metric_scaling?: MetricScalingConfig;
}

export interface GroupUpdate {
  enabled?: boolean;
  region?: string;
  type?: string;
  image?: string;
  min_instances?: number;
  max_instances?: number;
  desired_count?: number;
  max_scale_step?: number;
  linode_token?: string;
  network?: NetworkConfig;
  nodebalancer?: NodebalancerConfig;
  boot?: BootConfig;
  readiness?: ReadinessConfig;
  cooldowns?: CooldownConfig;
  reconciliation?: ReconciliationConfig;
  alerting?: AlertingConfig;
  metric_scaling?: MetricScalingConfig;
}

export interface GroupStatus {
  group_id: string;
  enabled: boolean;
  desired_count: number;
  min_instances: number;
  max_instances: number;
  total_instances: number;
  active_instances: number;
  creating_instances: number;
  draining_instances: number;
  failed_instances: number;
  active_scale_request: string | null;
}

export interface Instance {
  id: string;
  group_id: string;
  linode_id: number | null;
  linode_label: string | null;
  region: string | null;
  type: string | null;
  image: string | null;
  public_ipv4: string | null;
  private_ipv4: string | null;
  vpc_ipv4: string | null;
  status: string;
  protected: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ScaleEvent {
  id: string;
  group_id: string;
  instance_id: string | null;
  event_type: string;
  severity: string;
  message: string | null;
  reason: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ScaleRequest {
  id: string;
  group_id: string;
  request_type: string;
  desired_count: number | null;
  action: string | null;
  amount: number | null;
  status: string;
  reason: string | null;
  source: string | null;
  idempotency_key: string | null;
  dry_run: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CooldownStatus {
  group_id: string;
  scale_up_cooldown_seconds: number;
  scale_down_cooldown_seconds: number;
  scale_up_remaining_seconds: number;
  scale_down_remaining_seconds: number;
  scale_up_in_cooldown: boolean;
  scale_down_in_cooldown: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
  allowed_groups: string[] | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface DriftRecord {
  id: string;
  group_id: string;
  linode_id: number | null;
  drift_type: string;
  status: string;
  message: string | null;
  created_at: string;
}

export interface RootPasswordResponse {
  instance_id: string;
  linode_id: number;
  linode_label: string;
  root_password: string;
}
