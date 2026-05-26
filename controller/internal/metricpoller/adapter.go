package metricpoller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

func FetchMetricValue(cfg *MetricScalingConfig) (float64, error) {
	switch cfg.SourceType {
	case "prometheus":
		return fetchPrometheus(cfg)
	case "zabbix":
		return fetchZabbix(cfg)
	case "elasticsearch":
		return fetchElasticsearch(cfg)
	case "datadog":
		return fetchDatadog(cfg)
	case "nagios":
		return fetchNagios(cfg)
	case "custom_http":
		return fetchCustomHTTP(cfg)
	default:
		return fetchCustomHTTP(cfg)
	}
}

func fetchPrometheus(cfg *MetricScalingConfig) (float64, error) {
	url := fmt.Sprintf("%s/api/v1/query?query=%s", strings.TrimRight(cfg.Endpoint, "/"), cfg.Query)
	body, err := doHTTPGet(url, cfg)
	if err != nil {
		return 0, fmt.Errorf("prometheus request: %w", err)
	}

	var resp struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Value []json.RawMessage `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0, fmt.Errorf("prometheus parse: %w", err)
	}
	if resp.Status != "success" {
		return 0, fmt.Errorf("prometheus status: %s", resp.Status)
	}
	if len(resp.Data.Result) == 0 {
		return 0, fmt.Errorf("prometheus: empty result set")
	}
	if len(resp.Data.Result[0].Value) < 2 {
		return 0, fmt.Errorf("prometheus: no value in result")
	}

	var valStr string
	if err := json.Unmarshal(resp.Data.Result[0].Value[1], &valStr); err != nil {
		return 0, fmt.Errorf("prometheus value parse: %w", err)
	}
	return strconv.ParseFloat(valStr, 64)
}

func fetchZabbix(cfg *MetricScalingConfig) (float64, error) {
	reqBody := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "item.get",
		"params": map[string]interface{}{
			"output":    []string{"lastvalue"},
			"itemids":   cfg.Query,
			"sortfield": "itemid",
		},
		"id": 1,
	}
	if cfg.AuthTokenRef != "" {
		reqBody["auth"] = cfg.AuthTokenRef
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", cfg.Endpoint, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json-rpc")
	applyAuth(req, cfg)

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("zabbix request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var zResp struct {
		Result []struct {
			LastValue string `json:"lastvalue"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &zResp); err != nil {
		return 0, fmt.Errorf("zabbix parse: %w", err)
	}
	if len(zResp.Result) == 0 {
		return 0, fmt.Errorf("zabbix: no items returned")
	}
	return strconv.ParseFloat(zResp.Result[0].LastValue, 64)
}

func fetchElasticsearch(cfg *MetricScalingConfig) (float64, error) {
	url := fmt.Sprintf("%s/_search", strings.TrimRight(cfg.Endpoint, "/"))
	req, err := http.NewRequest("POST", url, strings.NewReader(cfg.Query))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	applyAuth(req, cfg)

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("elasticsearch request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	return extractJSONPath(body, cfg.ValuePath)
}

func fetchDatadog(cfg *MetricScalingConfig) (float64, error) {
	now := time.Now().Unix()
	from := now - int64(cfg.Rule.EvaluationWindowSeconds)
	url := fmt.Sprintf("%s/api/v1/query?query=%s&from=%d&to=%d",
		strings.TrimRight(cfg.Endpoint, "/"), cfg.Query, from, now)
	body, err := doHTTPGet(url, cfg)
	if err != nil {
		return 0, fmt.Errorf("datadog request: %w", err)
	}

	var ddResp struct {
		Series []struct {
			PointList [][]float64 `json:"pointlist"`
		} `json:"series"`
	}
	if err := json.Unmarshal(body, &ddResp); err != nil {
		return 0, fmt.Errorf("datadog parse: %w", err)
	}
	if len(ddResp.Series) == 0 || len(ddResp.Series[0].PointList) == 0 {
		return 0, fmt.Errorf("datadog: empty series")
	}
	points := ddResp.Series[0].PointList
	lastPoint := points[len(points)-1]
	if len(lastPoint) < 2 {
		return 0, fmt.Errorf("datadog: invalid point format")
	}
	return lastPoint[1], nil
}

func fetchNagios(cfg *MetricScalingConfig) (float64, error) {
	url := fmt.Sprintf("%s/state/%s", strings.TrimRight(cfg.Endpoint, "/"), cfg.Query)
	body, err := doHTTPGet(url, cfg)
	if err != nil {
		return 0, fmt.Errorf("nagios request: %w", err)
	}
	if cfg.ValuePath != "" {
		return extractJSONPath(body, cfg.ValuePath)
	}
	var valStr string
	if err := json.Unmarshal(body, &valStr); err != nil {
		val, err2 := strconv.ParseFloat(strings.TrimSpace(string(body)), 64)
		if err2 != nil {
			return 0, fmt.Errorf("nagios: cannot parse response as number: %s", string(body))
		}
		return val, nil
	}
	return strconv.ParseFloat(valStr, 64)
}

func fetchCustomHTTP(cfg *MetricScalingConfig) (float64, error) {
	url := cfg.Endpoint
	if cfg.Query != "" && !strings.Contains(url, "?") {
		url = url + "?" + cfg.Query
	}
	body, err := doHTTPGet(url, cfg)
	if err != nil {
		return 0, fmt.Errorf("custom_http request: %w", err)
	}
	if cfg.ValuePath != "" {
		return extractJSONPath(body, cfg.ValuePath)
	}
	val, err := strconv.ParseFloat(strings.TrimSpace(string(body)), 64)
	if err != nil {
		return 0, fmt.Errorf("custom_http: cannot parse response as number")
	}
	return val, nil
}

func doHTTPGet(url string, cfg *MetricScalingConfig) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	applyAuth(req, cfg)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}
	return io.ReadAll(resp.Body)
}

func applyAuth(req *http.Request, cfg *MetricScalingConfig) {
	switch cfg.AuthType {
	case "bearer":
		token := cfg.AuthTokenRef
		req.Header.Set("Authorization", "Bearer "+token)
	case "basic":
		parts := strings.SplitN(cfg.AuthTokenRef, ":", 2)
		if len(parts) == 2 {
			req.SetBasicAuth(parts[0], parts[1])
		}
	case "api_key_header":
		header := cfg.AuthHeader
		if header == "" {
			header = "X-API-Key"
		}
		req.Header.Set(header, cfg.AuthTokenRef)
	}
}

func extractJSONPath(body []byte, path string) (float64, error) {
	parts := strings.Split(path, ".")
	var current interface{}
	if err := json.Unmarshal(body, &current); err != nil {
		return 0, fmt.Errorf("json parse: %w", err)
	}

	for _, part := range parts {
		switch node := current.(type) {
		case map[string]interface{}:
			val, ok := node[part]
			if !ok {
				return 0, fmt.Errorf("path %q not found at key %q", path, part)
			}
			current = val
		case []interface{}:
			idx, err := strconv.Atoi(part)
			if err != nil || idx < 0 || idx >= len(node) {
				return 0, fmt.Errorf("path %q: invalid array index %q", path, part)
			}
			current = node[idx]
		default:
			return 0, fmt.Errorf("path %q: cannot traverse type %T at %q", path, current, part)
		}
	}

	switch v := current.(type) {
	case float64:
		return v, nil
	case string:
		return strconv.ParseFloat(v, 64)
	case json.Number:
		return v.Float64()
	default:
		return 0, fmt.Errorf("path %q: value is %T, not a number", path, current)
	}
}
