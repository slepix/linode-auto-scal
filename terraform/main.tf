terraform {
  required_providers {
    linode = {
      source  = "linode/linode"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.5"
}

provider "linode" {
  token = var.linode_token
}

# ─── Random secrets ───────────────────────────────────────────────────────────

resource "random_password" "secret_key" {
  length  = 48
  special = false
}

resource "random_password" "root_pass" {
  length  = 32
  special = true
}

resource "random_password" "postgres_password" {
  length  = 24
  special = false
}

resource "random_password" "db_app_password" {
  length  = 24
  special = false
}

locals {
  autoscaler_secret_key = var.autoscaler_secret_key != "" ? var.autoscaler_secret_key : random_password.secret_key.result
  vm_root_pass          = var.root_password != "" ? var.root_password : random_password.root_pass.result
  db_password           = var.postgres_password != "" ? var.postgres_password : random_password.postgres_password.result
  db_app_password       = var.db_app_password != "" ? var.db_app_password : random_password.db_app_password.result

  vm_label = "${var.label_prefix}-vm"
  db_label = "${var.label_prefix}-db"

  common_tags = [var.label_prefix, "terraform", "autoscaler"]
}

# ─── VPC & Subnet ─────────────────────────────────────────────────────────────

resource "linode_vpc" "autoscaler" {
  label       = "${var.label_prefix}-vpc"
  region      = var.region
  description = "VPC for ${var.label_prefix}"
}

resource "linode_vpc_subnet" "autoscaler" {
  vpc_id = linode_vpc.autoscaler.id
  label  = "${var.label_prefix}-subnet"
  ipv4   = var.vpc_subnet_cidr
}

# ─── Managed PostgreSQL ───────────────────────────────────────────────────────
# allow_list uses the subnet CIDR — avoids circular dep with the VM instance

resource "linode_database_postgresql_v2" "autoscaler" {
  label     = local.db_label
  engine_id = var.db_engine_id
  region    = var.region
  type      = var.db_type

  cluster_size = 1

  allow_list = [var.vpc_subnet_cidr]

  private_network = {
    vpc_id        = linode_vpc.autoscaler.id
    subnet_id     = linode_vpc_subnet.autoscaler.id
    public_access = false
  }

  updates = {
    frequency   = "weekly"
    day_of_week = var.db_updates_day_of_week
    hour_of_day = var.db_updates_hour_of_day
    duration    = 4
  }
}

# ─── Firewall ─────────────────────────────────────────────────────────────────

resource "linode_firewall" "autoscaler" {
  label = "${var.label_prefix}-firewall"
  tags  = local.common_tags

  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"

  inbound {
    label    = "allow-ssh"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "22"
    ipv4     = var.allowed_ssh_ips
  }

  inbound {
    label    = "allow-api"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "8000"
    ipv4     = var.allowed_api_ips
  }

  inbound {
    label    = "allow-http"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "80"
    ipv4     = ["0.0.0.0/0"]
  }

  inbound {
    label    = "allow-metrics"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "9090"
    ipv4     = var.allowed_metrics_ips
  }

  linodes = [linode_instance.autoscaler.id]
}

# ─── Autoscaler VM ────────────────────────────────────────────────────────────
# DB is created independently; its host is passed into user_data after both
# resources exist — no circular dependency.

resource "linode_instance" "autoscaler" {
  label           = local.vm_label
  region          = var.region
  type            = var.instance_type
  image           = var.image
  root_pass       = local.vm_root_pass
  authorized_keys = [var.ssh_public_key]
  tags            = local.common_tags

  interface_generation = "legacy_config"

  interface {
    purpose   = "vpc"
    subnet_id = linode_vpc_subnet.autoscaler.id
    ipv4 {
      nat_1_1 = "any"
    }
  }

  metadata {
    user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
      autoscaler_secret_key = local.autoscaler_secret_key
      db_host               = linode_database_postgresql_v2.autoscaler.host_primary
      db_port               = tostring(linode_database_postgresql_v2.autoscaler.port)
      db_root_user          = linode_database_postgresql_v2.autoscaler.root_username
      db_root_password      = linode_database_postgresql_v2.autoscaler.root_password
      db_app_user           = var.db_app_user
      db_app_password       = local.db_app_password
      db_name               = "autoscaler"
    }))
  }

  lifecycle {
    ignore_changes = [metadata]
  }
}

# ─── Optional DNS record ──────────────────────────────────────────────────────

resource "linode_domain_record" "api" {
  count       = var.domain_id != "" ? 1 : 0
  domain_id   = var.domain_id
  name        = var.dns_subdomain
  record_type = "A"
  target      = tolist(linode_instance.autoscaler.ipv4)[0]
  ttl_sec     = 300
}
