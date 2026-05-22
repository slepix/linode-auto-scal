output "autoscaler_ip" {
  description = "Public IPv4 of the autoscaler VM"
  value       = tolist(linode_instance.autoscaler.ipv4)[0]
}

output "api_url" {
  description = "API base URL"
  value       = "http://${tolist(linode_instance.autoscaler.ipv4)[0]}:8000"
}

output "dashboard_url" {
  description = "Frontend dashboard URL"
  value       = "http://${tolist(linode_instance.autoscaler.ipv4)[0]}"
}

output "autoscaler_secret_key" {
  description = "Generated AUTOSCALER_SECRET_KEY (store this safely)"
  value       = local.autoscaler_secret_key
  sensitive   = true
}

output "postgres_host" {
  description = "Managed PostgreSQL primary host"
  value       = linode_database_postgresql_v2.autoscaler.host_primary
  sensitive   = true
}

output "postgres_root_user" {
  description = "Managed PostgreSQL root username"
  value       = linode_database_postgresql_v2.autoscaler.root_username
  sensitive   = true
}

output "postgres_app_user" {
  description = "Application-level PostgreSQL username"
  value       = var.db_app_user
}

output "postgres_app_password" {
  description = "Application-level PostgreSQL password"
  value       = local.db_app_password
  sensitive   = true
}

output "vpc_id" {
  description = "VPC ID"
  value       = linode_vpc.autoscaler.id
}

output "subnet_id" {
  description = "VPC Subnet ID"
  value       = linode_vpc_subnet.autoscaler.id
}
