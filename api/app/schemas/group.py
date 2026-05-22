from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class NetworkConfig(BaseModel):
    mode: str = "vpc_ipv4"
    vpc_id: Optional[int] = None
    subnet_id: Optional[int] = None
    firewall_id: Optional[int] = None
    fallback_private_ipv4: bool = True


class NodebalancerBinding(BaseModel):
    config_id: int
    backend_address_template: str = "{vpc_ipv4}:80"
    subnet_id: Optional[int] = None
    active_mode: str = "accept"
    drain_mode: str = "drain"
    drain_wait_seconds: int = 60
    drain_parallelism: int = 1


class NodebalancerConfig(BaseModel):
    id: int
    bindings: List[NodebalancerBinding] = []


class BootConfig(BaseModel):
    root_password_strategy: str = "generate_and_encrypt"
    authorized_keys: List[str] = []
    cloud_init_user_data: Optional[str] = None


class TcpReadiness(BaseModel):
    enabled: bool = True
    port: int = 80
    timeout_seconds: int = 5


class HttpReadiness(BaseModel):
    enabled: bool = True
    url: str = "http://{vpc_ipv4}:80/health"
    expected_status: int = 200
    timeout_seconds: int = 5


class ReadinessConfig(BaseModel):
    initial_wait_seconds: int = 90
    tcp: Optional[TcpReadiness] = None
    http: Optional[HttpReadiness] = None
    overall_timeout_seconds: int = 300
    retry_count: int = 3
    delay_between_attempts_seconds: int = 60


class CooldownConfig(BaseModel):
    scale_up_seconds: int = 300
    scale_down_seconds: int = 600


class ReconciliationConfig(BaseModel):
    enabled: bool = True
    interval_seconds: int = 60
    auto_replace: bool = False


class AlertingConfig(BaseModel):
    enabled: bool = False
    webhook_url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    bearer_token_ref: Optional[str] = None
    send_on: List[str] = []


class LinodeTokenInput(BaseModel):
    token: str


class GroupCreate(BaseModel):
    group_id: str
    enabled: bool = True
    region: str
    type: str
    image: str
    min_instances: int = 1
    max_instances: int = 10
    desired_count: int = 1
    max_scale_step: int = 3
    label_prefix: Optional[str] = None
    tags: List[str] = []
    protected_tag: str = "autoscaler:protected"
    linode_token: str = Field(..., description="Plain-text Linode API token (encrypted on store)")
    network: Optional[NetworkConfig] = None
    nodebalancer: Optional[NodebalancerConfig] = None
    boot: Optional[BootConfig] = None
    readiness: Optional[ReadinessConfig] = None
    cooldowns: Optional[CooldownConfig] = None
    reconciliation: Optional[ReconciliationConfig] = None
    alerting: Optional[AlertingConfig] = None


class GroupUpdate(BaseModel):
    enabled: Optional[bool] = None
    image: Optional[str] = None
    min_instances: Optional[int] = None
    max_instances: Optional[int] = None
    desired_count: Optional[int] = None
    max_scale_step: Optional[int] = None
    linode_token: Optional[str] = Field(None, description="New Linode API token (re-encrypted on store)")
    network: Optional[NetworkConfig] = None
    nodebalancer: Optional[NodebalancerConfig] = None
    boot: Optional[BootConfig] = None
    readiness: Optional[ReadinessConfig] = None
    cooldowns: Optional[CooldownConfig] = None
    reconciliation: Optional[ReconciliationConfig] = None
    alerting: Optional[AlertingConfig] = None


class GroupResponse(BaseModel):
    id: str
    group_id: str
    enabled: bool
    region: str
    type: str
    image: str
    min_instances: int
    max_instances: int
    desired_count: int
    max_scale_step: int
    label_prefix: str
    protected_tag: str
    nodebalancer_id: Optional[int]
    network_config: Optional[NetworkConfig]
    nodebalancer_config: Optional[NodebalancerConfig]
    boot_config: Optional[BootConfig]
    readiness_config: Optional[ReadinessConfig]
    cooldown_config: Optional[CooldownConfig]
    reconciliation_config: Optional[ReconciliationConfig]
    alerting_config: Optional[AlertingConfig]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
