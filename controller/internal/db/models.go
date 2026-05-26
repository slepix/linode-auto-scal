package db

import (
	"database/sql"
	"time"
)

type Group struct {
	ID                      string
	GroupID                 string
	Enabled                 bool
	Region                  string
	Type                    string
	Image                   string
	MinInstances            int
	MaxInstances            int
	DesiredCount            int
	MaxScaleStep            int
	LabelPrefix             string
	ProtectedTag            string
	NodebalancerID          sql.NullInt64
	NetworkConfigJSON       sql.NullString
	ReadinessConfigJSON     sql.NullString
	CooldownConfigJSON      sql.NullString
	ReconciliationConfigJSON sql.NullString
	AlertingConfigJSON      sql.NullString
	BootConfigJSON          sql.NullString
	TagsJSON                sql.NullString
	NodebalancerConfigJSON    sql.NullString
	MetricScalingConfigJSON   sql.NullString
	EncryptedLinodeToken      string
	CreatedAt               time.Time
	UpdatedAt               time.Time
	DeletedAt               sql.NullTime
}

type Instance struct {
	ID                     string
	GroupID                string
	LinodeID               sql.NullInt64
	LinodeLabel            sql.NullString
	Region                 sql.NullString
	Type                   sql.NullString
	Image                  sql.NullString
	PublicIPv4             sql.NullString
	PrivateIPv4            sql.NullString
	VpcIPv4                sql.NullString
	VpcID                  sql.NullInt64
	SubnetID               sql.NullInt64
	Status                 string
	CreatedBy              string
	Protected              bool
	EncryptedRootPassword  sql.NullString
	CreatedAt              time.Time
	UpdatedAt              time.Time
	DeletedAt              sql.NullTime
}

type ScaleRequest struct {
	ID               string
	GroupID          string
	RequestType      string
	DesiredCount     sql.NullInt64
	Action           sql.NullString
	Amount           sql.NullInt64
	Status           string
	Reason           sql.NullString
	Source           sql.NullString
	InstanceIDsJSON  sql.NullString
	IdempotencyKey   sql.NullString
	RequestHash      sql.NullString
	CreatedByAPIKeyID sql.NullString
	DryRun           string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	CompletedAt      sql.NullTime
}

type NodebalancerBinding struct {
	ID             string
	GroupID        string
	InstanceID     string
	NodebalancerID int64
	ConfigID       int64
	NodeID         sql.NullInt64
	Address        sql.NullString
	SubnetID       sql.NullInt64
	Mode           string
	Status         string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	DeletedAt      sql.NullTime
}

type ScaleEvent struct {
	ID           string
	GroupID      string
	InstanceID   sql.NullString
	EventType    string
	Severity     string
	Message      sql.NullString
	MetadataJSON sql.NullString
	CreatedAt    time.Time
}
