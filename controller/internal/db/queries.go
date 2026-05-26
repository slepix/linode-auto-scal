package db

import (
	"database/sql"
	"fmt"
	"time"
)

func GetPendingScaleRequests(db *sql.DB) ([]ScaleRequest, error) {
	rows, err := db.Query(`
		SELECT id, group_id, request_type, desired_count, action, amount, status,
		       reason, source, instance_ids_json, idempotency_key, request_hash,
		       created_by_api_key_id, dry_run, created_at, updated_at, completed_at
		FROM scale_requests
		WHERE status = 'queued' AND dry_run = 'false'
		ORDER BY created_at ASC
		LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []ScaleRequest
	for rows.Next() {
		var r ScaleRequest
		err := rows.Scan(
			&r.ID, &r.GroupID, &r.RequestType, &r.DesiredCount, &r.Action, &r.Amount,
			&r.Status, &r.Reason, &r.Source, &r.InstanceIDsJSON, &r.IdempotencyKey,
			&r.RequestHash, &r.CreatedByAPIKeyID, &r.DryRun, &r.CreatedAt, &r.UpdatedAt,
			&r.CompletedAt,
		)
		if err != nil {
			return nil, err
		}
		requests = append(requests, r)
	}
	return requests, nil
}

func GetGroupByGroupID(db *sql.DB, groupID string) (*Group, error) {
	var g Group
	err := db.QueryRow(`
		SELECT id, group_id, enabled, region, type, image,
		       min_instances, max_instances, desired_count, max_scale_step,
		       label_prefix, protected_tag, nodebalancer_id,
		       network_config_json, readiness_config_json, cooldown_config_json,
		       reconciliation_config_json, alerting_config_json, boot_config_json,
		       tags_json, nodebalancer_config_json, metric_scaling_config_json,
		       encrypted_linode_token, created_at, updated_at, deleted_at
		FROM groups WHERE group_id = $1 AND deleted_at IS NULL
	`, groupID).Scan(
		&g.ID, &g.GroupID, &g.Enabled, &g.Region, &g.Type, &g.Image,
		&g.MinInstances, &g.MaxInstances, &g.DesiredCount, &g.MaxScaleStep,
		&g.LabelPrefix, &g.ProtectedTag, &g.NodebalancerID,
		&g.NetworkConfigJSON, &g.ReadinessConfigJSON, &g.CooldownConfigJSON,
		&g.ReconciliationConfigJSON, &g.AlertingConfigJSON, &g.BootConfigJSON,
		&g.TagsJSON, &g.NodebalancerConfigJSON, &g.MetricScalingConfigJSON,
		&g.EncryptedLinodeToken, &g.CreatedAt, &g.UpdatedAt, &g.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func GetActiveInstances(db *sql.DB, groupID string) ([]Instance, error) {
	rows, err := db.Query(`
		SELECT id, group_id, linode_id, linode_label, region, type, image,
		       public_ipv4, private_ipv4, vpc_ipv4, vpc_id, subnet_id,
		       status, created_by, protected, encrypted_root_password,
		       created_at, updated_at, deleted_at
		FROM instances
		WHERE group_id = $1 AND status = 'active' AND deleted_at IS NULL
		ORDER BY created_at DESC
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanInstances(rows)
}

func GetAllNonDeletedInstances(db *sql.DB, groupID string) ([]Instance, error) {
	rows, err := db.Query(`
		SELECT id, group_id, linode_id, linode_label, region, type, image,
		       public_ipv4, private_ipv4, vpc_ipv4, vpc_id, subnet_id,
		       status, created_by, protected, encrypted_root_password,
		       created_at, updated_at, deleted_at
		FROM instances
		WHERE group_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanInstances(rows)
}

func scanInstances(rows *sql.Rows) ([]Instance, error) {
	var instances []Instance
	for rows.Next() {
		var i Instance
		err := rows.Scan(
			&i.ID, &i.GroupID, &i.LinodeID, &i.LinodeLabel, &i.Region, &i.Type, &i.Image,
			&i.PublicIPv4, &i.PrivateIPv4, &i.VpcIPv4, &i.VpcID, &i.SubnetID,
			&i.Status, &i.CreatedBy, &i.Protected, &i.EncryptedRootPassword,
			&i.CreatedAt, &i.UpdatedAt, &i.DeletedAt,
		)
		if err != nil {
			return nil, err
		}
		instances = append(instances, i)
	}
	return instances, nil
}

func UpdateScaleRequestStatus(db *sql.DB, id, status string) error {
	var completedAt interface{}
	if status == "succeeded" || status == "failed" || status == "cancelled" {
		completedAt = time.Now().UTC()
	}
	if completedAt != nil {
		_, err := db.Exec(
			`UPDATE scale_requests SET status = $1, updated_at = NOW(), completed_at = $2 WHERE id = $3`,
			status, completedAt, id,
		)
		return err
	}
	_, err := db.Exec(
		`UPDATE scale_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	return err
}

func UpdateGroupDesiredCount(db *sql.DB, groupID string, count int) error {
	_, err := db.Exec(
		`UPDATE groups SET desired_count = $1, updated_at = NOW() WHERE group_id = $2`,
		count, groupID,
	)
	return err
}

func InsertInstance(db *sql.DB, inst *Instance) error {
	_, err := db.Exec(`
		INSERT INTO instances (id, group_id, linode_id, linode_label, region, type, image,
		                       public_ipv4, private_ipv4, vpc_ipv4, vpc_id, subnet_id,
		                       status, created_by, protected, encrypted_root_password)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
	`,
		inst.ID, inst.GroupID, inst.LinodeID, inst.LinodeLabel, inst.Region, inst.Type, inst.Image,
		inst.PublicIPv4, inst.PrivateIPv4, inst.VpcIPv4, inst.VpcID, inst.SubnetID,
		inst.Status, inst.CreatedBy, inst.Protected, inst.EncryptedRootPassword,
	)
	return err
}

func UpdateInstanceStatus(db *sql.DB, instanceID, status string) error {
	_, err := db.Exec(
		`UPDATE instances SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, instanceID,
	)
	return err
}

func UpdateInstanceIPs(db *sql.DB, instanceID string, publicIPv4, privateIPv4, vpcIPv4 sql.NullString) error {
	_, err := db.Exec(
		`UPDATE instances SET public_ipv4 = $1, private_ipv4 = $2, vpc_ipv4 = $3, updated_at = NOW() WHERE id = $4`,
		publicIPv4, privateIPv4, vpcIPv4, instanceID,
	)
	return err
}

func MarkInstanceDeleted(db *sql.DB, instanceID string) error {
	_, err := db.Exec(
		`UPDATE instances SET status = 'deleted', deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
		instanceID,
	)
	return err
}

func InsertNodebalancerBinding(db *sql.DB, b *NodebalancerBinding) error {
	_, err := db.Exec(`
		INSERT INTO nodebalancer_bindings (id, group_id, instance_id, nodebalancer_id, config_id, node_id, address, subnet_id, mode, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`,
		b.ID, b.GroupID, b.InstanceID, b.NodebalancerID, b.ConfigID,
		b.NodeID, b.Address, b.SubnetID, b.Mode, b.Status,
	)
	return err
}

func UpdateNodebalancerBindingMode(db *sql.DB, bindingID, mode string) error {
	_, err := db.Exec(
		`UPDATE nodebalancer_bindings SET mode = $1, updated_at = NOW() WHERE id = $2`,
		mode, bindingID,
	)
	return err
}

func DeleteNodebalancerBinding(db *sql.DB, bindingID string) error {
	_, err := db.Exec(
		`UPDATE nodebalancer_bindings SET deleted_at = NOW(), updated_at = NOW(), status = 'deleted' WHERE id = $1`,
		bindingID,
	)
	return err
}

func GetBindingsForInstance(db *sql.DB, instanceID string) ([]NodebalancerBinding, error) {
	rows, err := db.Query(`
		SELECT id, group_id, instance_id, nodebalancer_id, config_id, node_id, address, subnet_id, mode, status, created_at, updated_at, deleted_at
		FROM nodebalancer_bindings
		WHERE instance_id = $1 AND deleted_at IS NULL
	`, instanceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bindings []NodebalancerBinding
	for rows.Next() {
		var b NodebalancerBinding
		err := rows.Scan(
			&b.ID, &b.GroupID, &b.InstanceID, &b.NodebalancerID, &b.ConfigID,
			&b.NodeID, &b.Address, &b.SubnetID, &b.Mode, &b.Status,
			&b.CreatedAt, &b.UpdatedAt, &b.DeletedAt,
		)
		if err != nil {
			return nil, err
		}
		bindings = append(bindings, b)
	}
	return bindings, nil
}

func InsertScaleEvent(db *sql.DB, e *ScaleEvent) error {
	_, err := db.Exec(`
		INSERT INTO scale_events (id, group_id, instance_id, event_type, severity, message, metadata_json)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`,
		e.ID, e.GroupID, e.InstanceID, e.EventType, e.Severity, e.Message, e.MetadataJSON,
	)
	return err
}

func GetLastScaleEventOfType(db *sql.DB, groupID, eventType string) (*ScaleEvent, error) {
	var e ScaleEvent
	err := db.QueryRow(`
		SELECT id, group_id, instance_id, event_type, severity, message, metadata_json, created_at
		FROM scale_events
		WHERE group_id = $1 AND event_type = $2
		ORDER BY created_at DESC
		LIMIT 1
	`, groupID, eventType).Scan(
		&e.ID, &e.GroupID, &e.InstanceID, &e.EventType, &e.Severity, &e.Message, &e.MetadataJSON, &e.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &e, err
}

func InsertDriftRecord(db *sql.DB, groupID string, linodeID int64, driftType, message string) error {
	id := fmt.Sprintf("%d", time.Now().UnixNano())
	_, err := db.Exec(`
		INSERT INTO drift_records (id, group_id, linode_id, drift_type, status, message)
		VALUES ($1,$2,$3,$4,'open',$5)
		ON CONFLICT DO NOTHING
	`, id, groupID, linodeID, driftType, message)
	return err
}

func SetInstanceLinodeData(db *sql.DB, instanceID string, linodeID int64, label string) error {
	_, err := db.Exec(
		`UPDATE instances SET linode_id = $1, linode_label = $2, updated_at = NOW() WHERE id = $3`,
		linodeID, label, instanceID,
	)
	return err
}

func SetInstanceEncryptedRootPassword(db *sql.DB, instanceID, encrypted string) error {
	_, err := db.Exec(
		`UPDATE instances SET encrypted_root_password = $1, updated_at = NOW() WHERE id = $2`,
		encrypted, instanceID,
	)
	return err
}

func InsertScaleRequest(db *sql.DB, r *ScaleRequest) error {
	_, err := db.Exec(`
		INSERT INTO scale_requests (id, group_id, request_type, desired_count, action, amount, status, reason, source, dry_run)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`,
		r.ID, r.GroupID, r.RequestType, r.DesiredCount, r.Action, r.Amount,
		r.Status, r.Reason, r.Source, r.DryRun,
	)
	return err
}

func HasPendingScaleUp(db *sql.DB, groupID string) (bool, error) {
	var count int
	err := db.QueryRow(
		`SELECT COUNT(*) FROM scale_requests WHERE group_id = $1
		 AND (request_type IN ('scale_up', 'scale', 'set_desired_count'))
		 AND status IN ('queued', 'running')
		 AND dry_run = 'false'`,
		groupID,
	).Scan(&count)
	return count > 0, err
}

func HasPendingScaleDown(db *sql.DB, groupID string) (bool, error) {
	var count int
	err := db.QueryRow(
		`SELECT COUNT(*) FROM scale_requests WHERE group_id = $1
		 AND (request_type IN ('scale_down', 'scale', 'set_desired_count'))
		 AND status IN ('queued', 'running')
		 AND dry_run = 'false'`,
		groupID,
	).Scan(&count)
	return count > 0, err
}

func CountActiveInstances(db *sql.DB, groupID string) (int, error) {
	var count int
	err := db.QueryRow(
		`SELECT COUNT(*) FROM instances WHERE group_id = $1 AND status = 'active' AND deleted_at IS NULL`,
		groupID,
	).Scan(&count)
	return count, err
}

func CountCreatingInstances(db *sql.DB, groupID string) (int, error) {
	var count int
	err := db.QueryRow(
		`SELECT COUNT(*) FROM instances WHERE group_id = $1 AND status IN ('creating', 'booting', 'waiting_initial_delay', 'checking_tcp', 'checking_http', 'attaching_to_nodebalancer') AND deleted_at IS NULL`,
		groupID,
	).Scan(&count)
	return count, err
}
