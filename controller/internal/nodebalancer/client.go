package nodebalancer

import (
	"fmt"

	"github.com/linode-instance-autoscaler/controller/internal/linode"
)

type NodeBalancerNode struct {
	ID             int64  `json:"id"`
	NodebalancerID int64  `json:"nodebalancer_id"`
	ConfigID       int64  `json:"config_id"`
	Label          string `json:"label"`
	Address        string `json:"address"`
	Weight         int    `json:"weight"`
	Mode           string `json:"mode"`
	Status         string `json:"status"`
}

type CreateNodeRequest struct {
	Label    string `json:"label"`
	Address  string `json:"address"`
	Weight   int    `json:"weight"`
	Mode     string `json:"mode"`
	SubnetID int    `json:"subnet_id,omitempty"`
}

type Client struct {
	linodeClient *linode.Client
}

func NewClient(linodeClient *linode.Client) *Client {
	return &Client{linodeClient: linodeClient}
}

func (c *Client) CreateNode(nodebalancerID, configID int64, req CreateNodeRequest) (*NodeBalancerNode, error) {
	var result NodeBalancerNode
	path := fmt.Sprintf("/nodebalancers/%d/configs/%d/nodes", nodebalancerID, configID)
	err := c.linodeClient.DoPublic("POST", path, req, &result)
	return &result, err
}

func (c *Client) UpdateNodeMode(nodebalancerID, configID, nodeID int64, mode string) error {
	path := fmt.Sprintf("/nodebalancers/%d/configs/%d/nodes/%d", nodebalancerID, configID, nodeID)
	return c.linodeClient.DoPublic("PUT", path, map[string]string{"mode": mode}, nil)
}

func (c *Client) DeleteNode(nodebalancerID, configID, nodeID int64) error {
	path := fmt.Sprintf("/nodebalancers/%d/configs/%d/nodes/%d", nodebalancerID, configID, nodeID)
	return c.linodeClient.DoPublic("DELETE", path, nil, nil)
}

func (c *Client) GetNode(nodebalancerID, configID, nodeID int64) (*NodeBalancerNode, error) {
	var result NodeBalancerNode
	path := fmt.Sprintf("/nodebalancers/%d/configs/%d/nodes/%d", nodebalancerID, configID, nodeID)
	err := c.linodeClient.DoPublic("GET", path, nil, &result)
	return &result, err
}

type ListNodesResponse struct {
	Data []NodeBalancerNode `json:"data"`
}

func (c *Client) ListNodes(nodebalancerID, configID int64) ([]NodeBalancerNode, error) {
	var result ListNodesResponse
	path := fmt.Sprintf("/nodebalancers/%d/configs/%d/nodes", nodebalancerID, configID)
	err := c.linodeClient.DoPublic("GET", path, nil, &result)
	return result.Data, err
}
