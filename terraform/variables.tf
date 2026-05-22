variable "linode_token" {
  description = "Linode API token (account-level permissions)"
  type        = string
  sensitive   = true
}

variable "label_prefix" {
  description = "Prefix for all resource labels and tags"
  type        = string
  default     = "linode-autoscaler"
}

variable "region" {
  description = "Linode region (e.g. us-east, eu-central)"
  type        = string
  default     = "nl-ams"
}

variable "instance_type" {
  description = "Linode instance type for the autoscaler VM"
  type        = string
  default     = "g6-standard-1"
}

variable "image" {
  description = "Linode image for the autoscaler VM"
  type        = string
  default     = "linode/ubuntu24.04"
}

variable "ssh_public_key" {
  description = "SSH public key for VM access"
  type        = string
}

variable "root_password" {
  description = "Root password for the autoscaler VM (auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "autoscaler_secret_key" {
  description = "Encryption key for the autoscaler (AUTOSCALER_SECRET_KEY, auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "postgres_password" {
  description = "PostgreSQL password override (auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_app_user" {
  description = "Application-level PostgreSQL user (non-root)"
  type        = string
  default     = "autoscaler_app"
}

variable "db_app_password" {
  description = "Password for the application-level PostgreSQL user (auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Database ─────────────────────────────────────────────────────────────────

variable "db_engine_id" {
  description = "Linode Managed PostgreSQL engine ID (e.g. postgresql/16)"
  type        = string
  default     = "postgresql/18"
}

variable "db_type" {
  description = "Linode Managed PostgreSQL node type"
  type        = string
  default     = "g6-nanode-1"
}

variable "db_updates_day_of_week" {
  description = "Day of the week for managed DB maintenance window (1=Monday … 7=Sunday)."
  type        = number
  default     = 7
}

variable "db_updates_hour_of_day" {
  description = "UTC hour to begin the managed DB maintenance window (0–23)."
  type        = number
  default     = 3
}

# ─── Networking ───────────────────────────────────────────────────────────────

variable "vpc_subnet_cidr" {
  description = "IPv4 CIDR for the autoscaler VPC subnet"
  type        = string
  default     = "10.8.0.0/24"
}

variable "allowed_ssh_ips" {
  description = "IPv4 CIDRs allowed to SSH to the autoscaler VM"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_api_ips" {
  description = "IPv4 CIDRs allowed to reach the API port (8000)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_metrics_ips" {
  description = "IPv4 CIDRs allowed to reach the metrics port (9090)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ─── Optional DNS ─────────────────────────────────────────────────────────────

variable "domain_id" {
  description = "Linode domain ID for optional DNS A record (empty to skip)"
  type        = string
  default     = ""
}

variable "dns_subdomain" {
  description = "DNS subdomain for the autoscaler API"
  type        = string
  default     = "autoscaler"
}
