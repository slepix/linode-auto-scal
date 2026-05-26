-- Migration: 001_initial_schema
-- Creates all tables for the Linode Instance Autoscaler

CREATE TABLE IF NOT EXISTS groups (
    id                        VARCHAR(64)  PRIMARY KEY,
    group_id                  VARCHAR(128) UNIQUE NOT NULL,
    enabled                   BOOLEAN      NOT NULL DEFAULT true,
    region                    VARCHAR(64)  NOT NULL,
    type                      VARCHAR(64)  NOT NULL,
    image                     VARCHAR(128) NOT NULL,
    min_instances             INT          NOT NULL DEFAULT 1,
    max_instances             INT          NOT NULL DEFAULT 10,
    desired_count             INT          NOT NULL DEFAULT 1,
    max_scale_step            INT          NOT NULL DEFAULT 3,
    label_prefix              VARCHAR(128) NOT NULL,
    protected_tag             VARCHAR(128) NOT NULL DEFAULT 'autoscaler:protected',
    nodebalancer_id           INT,
    network_config_json       TEXT,
    readiness_config_json     TEXT,
    cooldown_config_json      TEXT,
    reconciliation_config_json TEXT,
    alerting_config_json      TEXT,
    boot_config_json          TEXT,
    tags_json                 TEXT,
    nodebalancer_config_json  TEXT,
    metric_scaling_config_json TEXT,
    encrypted_linode_token    TEXT         NOT NULL,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at                TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_groups_group_id ON groups (group_id);
CREATE INDEX IF NOT EXISTS idx_groups_deleted_at ON groups (deleted_at);

CREATE TABLE IF NOT EXISTS instances (
    id                      VARCHAR(64)  PRIMARY KEY,
    group_id                VARCHAR(128) NOT NULL,
    linode_id               BIGINT,
    linode_label            VARCHAR(256),
    region                  VARCHAR(64),
    type                    VARCHAR(64),
    image                   VARCHAR(128),
    public_ipv4             VARCHAR(45),
    private_ipv4            VARCHAR(45),
    vpc_ipv4                VARCHAR(45),
    vpc_id                  BIGINT,
    subnet_id               BIGINT,
    status                  VARCHAR(64)  NOT NULL DEFAULT 'creating',
    created_by              VARCHAR(64)  NOT NULL DEFAULT 'autoscaler',
    protected               BOOLEAN      NOT NULL DEFAULT false,
    encrypted_root_password TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instances_group_id ON instances (group_id);
CREATE INDEX IF NOT EXISTS idx_instances_linode_id ON instances (linode_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances (status);
CREATE INDEX IF NOT EXISTS idx_instances_deleted_at ON instances (deleted_at);

CREATE TABLE IF NOT EXISTS nodebalancer_bindings (
    id              VARCHAR(64)  PRIMARY KEY,
    group_id        VARCHAR(128) NOT NULL,
    instance_id     VARCHAR(64)  NOT NULL,
    nodebalancer_id BIGINT       NOT NULL,
    config_id       BIGINT       NOT NULL,
    node_id         BIGINT,
    address         VARCHAR(128),
    subnet_id       BIGINT,
    mode            VARCHAR(32)  NOT NULL DEFAULT 'accept',
    status          VARCHAR(32)  NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nb_bindings_group_id ON nodebalancer_bindings (group_id);
CREATE INDEX IF NOT EXISTS idx_nb_bindings_instance_id ON nodebalancer_bindings (instance_id);
CREATE INDEX IF NOT EXISTS idx_nb_bindings_deleted_at ON nodebalancer_bindings (deleted_at);

CREATE TABLE IF NOT EXISTS scale_requests (
    id                   VARCHAR(64)  PRIMARY KEY,
    group_id             VARCHAR(128) NOT NULL,
    request_type         VARCHAR(64)  NOT NULL,
    desired_count        INT,
    action               VARCHAR(64),
    amount               INT,
    status               VARCHAR(64)  NOT NULL DEFAULT 'queued',
    reason               TEXT,
    source               VARCHAR(128),
    idempotency_key      VARCHAR(256),
    request_hash         VARCHAR(64),
    instance_ids_json    TEXT,
    created_by_api_key_id VARCHAR(64),
    dry_run              VARCHAR(8)   NOT NULL DEFAULT 'false',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scale_requests_group_id ON scale_requests (group_id);
CREATE INDEX IF NOT EXISTS idx_scale_requests_status ON scale_requests (status);
CREATE INDEX IF NOT EXISTS idx_scale_requests_idempotency ON scale_requests (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_scale_requests_created_at ON scale_requests (created_at);

CREATE TABLE IF NOT EXISTS scale_events (
    id            VARCHAR(64)  PRIMARY KEY,
    group_id      VARCHAR(128) NOT NULL,
    instance_id   VARCHAR(64),
    event_type    VARCHAR(128) NOT NULL,
    severity      VARCHAR(32)  NOT NULL DEFAULT 'info',
    message       TEXT,
    metadata_json TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scale_events_group_id ON scale_events (group_id);
CREATE INDEX IF NOT EXISTS idx_scale_events_instance_id ON scale_events (instance_id);
CREATE INDEX IF NOT EXISTS idx_scale_events_event_type ON scale_events (event_type);
CREATE INDEX IF NOT EXISTS idx_scale_events_created_at ON scale_events (created_at);

CREATE TABLE IF NOT EXISTS api_keys (
    id           VARCHAR(64)  PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    key_hash     VARCHAR(64)  UNIQUE NOT NULL,
    role         VARCHAR(32)  NOT NULL DEFAULT 'readonly',
    enabled      BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_deleted_at ON api_keys (deleted_at);

CREATE TABLE IF NOT EXISTS drift_records (
    id            VARCHAR(64)  PRIMARY KEY,
    group_id      VARCHAR(128) NOT NULL,
    linode_id     BIGINT,
    drift_type    VARCHAR(64)  NOT NULL,
    status        VARCHAR(32)  NOT NULL DEFAULT 'open',
    message       TEXT,
    metadata_json TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drift_records_group_id ON drift_records (group_id);
CREATE INDEX IF NOT EXISTS idx_drift_records_linode_id ON drift_records (linode_id);
CREATE INDEX IF NOT EXISTS idx_drift_records_status ON drift_records (status);

-- 90-day event cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_events() RETURNS void AS $$
BEGIN
    DELETE FROM scale_events WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
