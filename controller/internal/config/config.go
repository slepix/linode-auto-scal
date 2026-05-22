package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL          string
	SecretKey            string
	LinodeAPIBaseURL     string
	LinodeAPIMaxRPS      int
	LinodeAPIMaxRetries  int
	ReconcileInterval    int
	PollInterval         int
	MetricsAddr          string
}

func Load() *Config {
	return &Config{
		DatabaseURL:         getenv("DATABASE_URL", "postgres://autoscaler:autoscaler@postgres:5432/autoscaler?sslmode=disable"),
		SecretKey:           getenv("AUTOSCALER_SECRET_KEY", "change-me-in-production-32-chars!!"),
		LinodeAPIBaseURL:    getenv("LINODE_API_BASE_URL", "https://api.linode.com/v4"),
		LinodeAPIMaxRPS:     getenvInt("LINODE_API_MAX_RPS", 5),
		LinodeAPIMaxRetries: getenvInt("LINODE_API_MAX_RETRIES", 5),
		ReconcileInterval:   getenvInt("RECONCILE_INTERVAL_SECONDS", 60),
		PollInterval:        getenvInt("POLL_INTERVAL_SECONDS", 5),
		MetricsAddr:         getenv("METRICS_ADDR", ":9090"),
	}
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
