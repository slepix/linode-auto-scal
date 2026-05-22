package alerting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Config struct {
	Enabled        bool              `json:"enabled"`
	WebhookURL     string            `json:"webhook_url"`
	Headers        map[string]string `json:"headers"`
	BearerTokenRef string            `json:"bearer_token_ref"`
	SendOn         []string          `json:"send_on"`
}

type AlertPayload struct {
	EventType string `json:"event_type"`
	Severity  string `json:"severity"`
	GroupID   string `json:"group_id"`
	EventID   string `json:"event_id"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

type Alerter struct {
	cfg    *Config
	client *http.Client
}

func NewAlerter(cfg *Config) *Alerter {
	return &Alerter{
		cfg:    cfg,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *Alerter) ShouldSend(eventType string) bool {
	if a.cfg == nil || !a.cfg.Enabled {
		return false
	}
	for _, t := range a.cfg.SendOn {
		if t == eventType {
			return true
		}
	}
	return false
}

func (a *Alerter) Send(payload AlertPayload) error {
	if !a.ShouldSend(payload.EventType) {
		return nil
	}
	if a.cfg.WebhookURL == "" {
		return nil
	}

	payload.Timestamp = time.Now().UTC().Format(time.RFC3339)

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", a.cfg.WebhookURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	if a.cfg.BearerTokenRef != "" {
		req.Header.Set("Authorization", "Bearer "+a.cfg.BearerTokenRef)
	}

	for k, v := range a.cfg.Headers {
		req.Header.Set(k, v)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("alert webhook returned status %d", resp.StatusCode)
	}
	return nil
}
