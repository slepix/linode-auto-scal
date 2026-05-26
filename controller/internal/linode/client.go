package linode

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/linode/linodego"
	"golang.org/x/oauth2"
)

type Client struct {
	api        linodego.Client
	token      string
	baseURL    string
	httpClient *http.Client
}

func NewClient(token, baseURL string, maxRetries int) *Client {
	tokenSource := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	oauth2Client := oauth2.NewClient(context.Background(), tokenSource)
	oauth2Client.Timeout = 30 * time.Second

	client := linodego.NewClient(oauth2Client)
	if baseURL != "" {
		client.SetBaseURL(baseURL)
	}
	client.SetRetryCount(maxRetries)

	return &Client{
		api:        client,
		token:      token,
		baseURL:    baseURL,
		httpClient: oauth2Client,
	}
}

// LinodeInstance is the subset of instance data used by the controller.
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

func instanceFromAPI(inst *linodego.Instance) *LinodeInstance {
	var ipv4 []string
	for _, ip := range inst.IPv4 {
		ipv4 = append(ipv4, ip.String())
	}
	return &LinodeInstance{
		ID:     int64(inst.ID),
		Label:  inst.Label,
		Status: string(inst.Status),
		IPv4:   ipv4,
		Tags:   inst.Tags,
		Region: inst.Region,
		Type:   inst.Type,
		Image:  inst.Image,
	}
}

// CreateLinodeRequest uses the new Linode Interfaces API format for VPC support.
type CreateLinodeRequest struct {
	Region              string            `json:"region"`
	Type                string            `json:"type"`
	Image               string            `json:"image"`
	Label               string            `json:"label"`
	Tags                []string          `json:"tags"`
	RootPass            string            `json:"root_pass"`
	AuthorizedKeys      []string          `json:"authorized_keys,omitempty"`
	Metadata            *LinodeMetadata   `json:"metadata,omitempty"`
	PrivateIP           bool              `json:"private_ip,omitempty"`
	InterfaceGeneration string            `json:"interface_generation,omitempty"`
	Interfaces          []LinodeInterface `json:"interfaces,omitempty"`
}

type LinodeMetadata struct {
	UserData string `json:"user_data"`
}

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
	SubnetID int            `json:"subnet_id"`
	IPv4     *VPCIPv4Config `json:"ipv4,omitempty"`
}

type VPCIPv4Config struct {
	Addresses []VPCIPv4Address `json:"addresses,omitempty"`
}

type VPCIPv4Address struct {
	Address        string `json:"address"`
	Primary        bool   `json:"primary,omitempty"`
	NAT1To1Address string `json:"nat_1_1_address,omitempty"`
}

type DefaultRoute struct {
	IPv4 *bool `json:"ipv4,omitempty"`
	IPv6 *bool `json:"ipv6,omitempty"`
}

func (c *Client) CreateLinode(req CreateLinodeRequest) (*LinodeInstance, error) {
	ctx := context.Background()

	// When using the new Linode Interfaces API (VPC), fall back to raw HTTP
	// since linodego may not fully support the interface_generation field.
	if req.InterfaceGeneration != "" || len(req.Interfaces) > 0 {
		var result LinodeInstance
		err := c.doRaw("POST", "/linode/instances", req, &result)
		return &result, err
	}

	createOpts := linodego.InstanceCreateOptions{
		Region:         req.Region,
		Type:           req.Type,
		Image:          req.Image,
		Label:          req.Label,
		Tags:           req.Tags,
		RootPass:       req.RootPass,
		AuthorizedKeys: req.AuthorizedKeys,
		PrivateIP:      req.PrivateIP,
	}

	if req.Metadata != nil {
		createOpts.Metadata = &linodego.InstanceMetadataOptions{
			UserData: req.Metadata.UserData,
		}
	}

	inst, err := c.api.CreateInstance(ctx, createOpts)
	if err != nil {
		return nil, err
	}
	return instanceFromAPI(inst), nil
}

func (c *Client) GetLinode(linodeID int64) (*LinodeInstance, error) {
	inst, err := c.api.GetInstance(context.Background(), int(linodeID))
	if err != nil {
		return nil, err
	}
	return instanceFromAPI(inst), nil
}

func (c *Client) DeleteLinode(linodeID int64) error {
	return c.api.DeleteInstance(context.Background(), int(linodeID))
}

func (c *Client) ListLinodes(tags []string) ([]LinodeInstance, error) {
	ctx := context.Background()

	instances, err := c.api.ListInstances(ctx, linodego.NewListOptions(0, ""))
	if err != nil {
		return nil, err
	}

	var filtered []LinodeInstance
	for _, inst := range instances {
		li := instanceFromAPI(&inst)
		if hasAllTags(li.Tags, tags) {
			filtered = append(filtered, *li)
		}
	}
	return filtered, nil
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

// GetLinodeVPCIP retrieves the VPC IPv4 address for a Linode using the Interfaces API.
func (c *Client) GetLinodeVPCIP(linodeID int64) (string, error) {
	var result LinodeInterfaceResponse
	err := c.doRaw("GET", fmt.Sprintf("/linode/instances/%d/interfaces", linodeID), nil, &result)
	if err != nil {
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
	err := c.doRaw("GET", fmt.Sprintf("/linode/instances/%d/configs", linodeID), nil, &result)
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

// LinodeInterfaceResponse represents the response from the Linode Interfaces API.
type LinodeInterfaceResponse struct {
	Interfaces []LinodeInterfaceData `json:"interfaces"`
}

type LinodeInterfaceData struct {
	ID     int                    `json:"id"`
	VPC    *LinodeInterfaceVPC    `json:"vpc"`
	Public *LinodeInterfacePublic `json:"public"`
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

// DoPublic exposes raw HTTP calls for use by other packages (e.g., nodebalancer).
func (c *Client) DoPublic(method, path string, body interface{}, result interface{}) error {
	return c.doRaw(method, path, body, result)
}

// doRaw performs a raw HTTP request against the Linode API.
// Used for endpoints not yet fully supported by linodego.
func (c *Client) doRaw(method, path string, body interface{}, result interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("linode API error %d: %s", resp.StatusCode, string(respBody))
	}

	if result != nil && len(respBody) > 0 {
		return json.Unmarshal(respBody, result)
	}
	return nil
}
