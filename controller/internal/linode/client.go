package linode

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	token      string
	baseURL    string
	httpClient *http.Client
	maxRetries int
}

func NewClient(token, baseURL string, maxRetries int) *Client {
	return &Client{
		token:   token,
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		maxRetries: maxRetries,
	}
}

func (c *Client) do(method, path string, body interface{}, result interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*attempt) * time.Second
			if backoff > 60*time.Second {
				backoff = 60 * time.Second
			}
			time.Sleep(backoff)
			if bodyReader != nil {
				if seeker, ok := bodyReader.(io.Seeker); ok {
					seeker.Seek(0, io.SeekStart)
				}
			}
		}

		req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode == 429 {
			lastErr = fmt.Errorf("rate limited (429)")
			continue
		}

		if resp.StatusCode >= 400 {
			return fmt.Errorf("linode API error %d: %s", resp.StatusCode, string(respBody))
		}

		if result != nil && len(respBody) > 0 {
			return json.Unmarshal(respBody, result)
		}
		return nil
	}
	return fmt.Errorf("max retries exceeded: %w", lastErr)
}

// CreateLinodeRequest uses the new Linode Interfaces API format for VPC support.
type CreateLinodeRequest struct {
	Region              string                 `json:"region"`
	Type                string                 `json:"type"`
	Image               string                 `json:"image"`
	Label               string                 `json:"label"`
	Tags                []string               `json:"tags"`
	RootPass            string                 `json:"root_pass"`
	AuthorizedKeys      []string               `json:"authorized_keys,omitempty"`
	Metadata            *LinodeMetadata        `json:"metadata,omitempty"`
	PrivateIP           bool                   `json:"private_ip,omitempty"`
	InterfaceGeneration string                 `json:"interface_generation,omitempty"`
	Interfaces          []LinodeInterface      `json:"interfaces,omitempty"`
}

type LinodeMetadata struct {
	UserData string `json:"user_data"`
}

// LinodeInterface represents a Linode Interface (new generation).
type LinodeInterface struct {
	Public       *LinodePublicInterface `json:"public,omitempty"`
	VPC          *LinodeVPCInterface    `json:"vpc,omitempty"`
	DefaultRoute *DefaultRoute          `json:"default_route,omitempty"`
	FirewallID   *int                   `json:"firewall_id,omitempty"`
}

type LinodePublicInterface struct {
	IPv4 *PublicIPv4Config `json:"ipv4,omitempty"`
}

type PublicIPv4Config struct {
	Addresses []PublicIPv4Address `json:"addresses,omitempty"`
}

type PublicIPv4Address struct {
	Address string `json:"address"`
	Primary bool   `json:"primary,omitempty"`
}

type LinodeVPCInterface struct {
	SubnetID int             `json:"subnet_id"`
	IPv4     *VPCIPv4Config  `json:"ipv4,omitempty"`
}

type VPCIPv4Config struct {
	Addresses []VPCIPv4Address `json:"addresses,omitempty"`
}

type VPCIPv4Address struct {
	Address       string `json:"address"`
	Primary       bool   `json:"primary,omitempty"`
	NAT1To1Address string `json:"nat_1_1_address,omitempty"`
}

type DefaultRoute struct {
	IPv4 *bool `json:"ipv4,omitempty"`
	IPv6 *bool `json:"ipv6,omitempty"`
}

type LinodeInstance struct {
	ID     int64    `json:"id"`
	Label  string   `json:"label"`
	Status string   `json:"status"`
	IPv4   []string `json:"ipv4"`
	Tags   []string `json:"tags"`
	Region string   `json:"region"`
	Type   string   `json:"type"`
	Image  string   `json:"image"`
}

func (c *Client) CreateLinode(req CreateLinodeRequest) (*LinodeInstance, error) {
	var result LinodeInstance
	err := c.do("POST", "/linode/instances", req, &result)
	return &result, err
}

func (c *Client) GetLinode(linodeID int64) (*LinodeInstance, error) {
	var result LinodeInstance
	err := c.do("GET", fmt.Sprintf("/linode/instances/%d", linodeID), nil, &result)
	return &result, err
}

func (c *Client) DeleteLinode(linodeID int64) error {
	return c.do("DELETE", fmt.Sprintf("/linode/instances/%d", linodeID), nil, nil)
}

type ListLinodesResponse struct {
	Data  []LinodeInstance `json:"data"`
	Page  int              `json:"page"`
	Pages int              `json:"pages"`
}

func (c *Client) ListLinodes(tags []string) ([]LinodeInstance, error) {
	var all []LinodeInstance
	page := 1
	for {
		var result ListLinodesResponse
		err := c.do("GET", fmt.Sprintf("/linode/instances?page=%d&page_size=100", page), nil, &result)
		if err != nil {
			return nil, err
		}
		for _, inst := range result.Data {
			if hasAllTags(inst.Tags, tags) {
				all = append(all, inst)
			}
		}
		if page >= result.Pages {
			break
		}
		page++
	}
	return all, nil
}

func hasAllTags(instTags, required []string) bool {
	tagSet := make(map[string]struct{}, len(instTags))
	for _, t := range instTags {
		tagSet[t] = struct{}{}
	}
	for _, t := range required {
		if _, ok := tagSet[t]; !ok {
			return false
		}
	}
	return true
}

// LinodeInterfaceResponse represents the response from the Linode Interfaces API.
type LinodeInterfaceResponse struct {
	Interfaces []LinodeInterfaceData `json:"interfaces"`
}

type LinodeInterfaceData struct {
	ID      int                    `json:"id"`
	VPC     *LinodeInterfaceVPC    `json:"vpc"`
	Public  *LinodeInterfacePublic `json:"public"`
}

type LinodeInterfaceVPC struct {
	IPv4 *LinodeInterfaceVPCIPv4 `json:"ipv4"`
}

type LinodeInterfaceVPCIPv4 struct {
	Addresses []LinodeInterfaceVPCAddr `json:"addresses"`
}

type LinodeInterfaceVPCAddr struct {
	Address string `json:"address"`
	Primary bool   `json:"primary"`
}

type LinodeInterfacePublic struct {
	IPv4 *LinodeInterfacePublicIPv4 `json:"ipv4"`
}

type LinodeInterfacePublicIPv4 struct {
	Addresses []LinodeInterfacePublicAddr `json:"addresses"`
}

type LinodeInterfacePublicAddr struct {
	Address string `json:"address"`
	Primary bool   `json:"primary"`
}

// DoPublic exposes the internal do method for use by other packages (e.g., nodebalancer)
func (c *Client) DoPublic(method, path string, body interface{}, result interface{}) error {
	return c.do(method, path, body, result)
}

// GetLinodeVPCIP retrieves the VPC IPv4 address for a Linode using the Linode Interfaces API.
func (c *Client) GetLinodeVPCIP(linodeID int64) (string, error) {
	var result LinodeInterfaceResponse
	err := c.do("GET", fmt.Sprintf("/linode/instances/%d/interfaces", linodeID), nil, &result)
	if err != nil {
		// Fallback to legacy config-based lookup
		return c.getLinodeVPCIPLegacy(linodeID)
	}
	for _, iface := range result.Interfaces {
		if iface.VPC != nil && iface.VPC.IPv4 != nil {
			for _, addr := range iface.VPC.IPv4.Addresses {
				if addr.Address != "" {
					return addr.Address, nil
				}
			}
		}
	}
	return "", nil
}

// getLinodeVPCIPLegacy uses the legacy configs endpoint as a fallback.
func (c *Client) getLinodeVPCIPLegacy(linodeID int64) (string, error) {
	var result struct {
		Data []struct {
			Interfaces []struct {
				Purpose string `json:"purpose"`
				IPv4    *struct {
					VPC string `json:"vpc"`
				} `json:"ipv4"`
			} `json:"interfaces"`
		} `json:"data"`
	}
	err := c.do("GET", fmt.Sprintf("/linode/instances/%d/configs", linodeID), nil, &result)
	if err != nil {
		return "", err
	}
	for _, cfg := range result.Data {
		for _, iface := range cfg.Interfaces {
			if iface.Purpose == "vpc" && iface.IPv4 != nil && iface.IPv4.VPC != "" {
				return iface.IPv4.VPC, nil
			}
		}
	}
	return "", nil
}
