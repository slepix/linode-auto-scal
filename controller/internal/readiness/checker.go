package readiness

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

type TCPConfig struct {
	Enabled        bool `json:"enabled"`
	Port           int  `json:"port"`
	TimeoutSeconds int  `json:"timeout_seconds"`
}

type HTTPConfig struct {
	Enabled        bool   `json:"enabled"`
	URL            string `json:"url"`
	ExpectedStatus int    `json:"expected_status"`
	TimeoutSeconds int    `json:"timeout_seconds"`
}

type Config struct {
	InitialWaitSeconds          int         `json:"initial_wait_seconds"`
	TCP                         *TCPConfig  `json:"tcp"`
	HTTP                        *HTTPConfig `json:"http"`
	OverallTimeoutSeconds       int         `json:"overall_timeout_seconds"`
	RetryCount                  int         `json:"retry_count"`
	DelayBetweenAttemptsSeconds int         `json:"delay_between_attempts_seconds"`
}

func ParseConfig(jsonStr string) (*Config, error) {
	var cfg Config
	if err := json.Unmarshal([]byte(jsonStr), &cfg); err != nil {
		return nil, err
	}
	if cfg.RetryCount == 0 {
		cfg.RetryCount = 3
	}
	if cfg.InitialWaitSeconds == 0 {
		cfg.InitialWaitSeconds = 90
	}
	if cfg.DelayBetweenAttemptsSeconds == 0 {
		cfg.DelayBetweenAttemptsSeconds = 60
	}
	return &cfg, nil
}

func WaitForReady(cfg *Config, ip string) error {
	if cfg.InitialWaitSeconds > 0 {
		time.Sleep(time.Duration(cfg.InitialWaitSeconds) * time.Second)
	}

	var lastErr error
	for attempt := 0; attempt < cfg.RetryCount; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(cfg.DelayBetweenAttemptsSeconds) * time.Second)
		}

		if cfg.TCP != nil && cfg.TCP.Enabled {
			if err := checkTCP(ip, cfg.TCP.Port, cfg.TCP.TimeoutSeconds); err != nil {
				lastErr = fmt.Errorf("tcp check failed: %w", err)
				continue
			}
		}

		if cfg.HTTP != nil && cfg.HTTP.Enabled {
			url := strings.ReplaceAll(cfg.HTTP.URL, "{vpc_ipv4}", ip)
			url = strings.ReplaceAll(url, "{private_ipv4}", ip)
			if err := checkHTTP(url, cfg.HTTP.ExpectedStatus, cfg.HTTP.TimeoutSeconds); err != nil {
				lastErr = fmt.Errorf("http check failed: %w", err)
				continue
			}
		}

		return nil
	}

	if lastErr != nil {
		return lastErr
	}
	return nil
}

func checkTCP(host string, port, timeoutSeconds int) error {
	timeout := time.Duration(timeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), timeout)
	if err != nil {
		return err
	}
	conn.Close()
	return nil
}

func checkHTTP(url string, expectedStatus, timeoutSeconds int) error {
	timeout := time.Duration(timeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != expectedStatus {
		return fmt.Errorf("expected status %d, got %d", expectedStatus, resp.StatusCode)
	}
	return nil
}
