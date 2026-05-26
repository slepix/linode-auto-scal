import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { api } from '../../api/client';
import type { Group, GroupUpdate } from '../../types';

interface Props {
  open: boolean;
  group: Group;
  onClose: () => void;
  onUpdated: () => void;
}

export default function GroupEditDialog({ open, group, onClose, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(group.enabled);
  const [minInstances, setMinInstances] = useState(group.min_instances);
  const [maxInstances, setMaxInstances] = useState(group.max_instances);
  const [desiredCount, setDesiredCount] = useState(group.desired_count);
  const [maxScaleStep, setMaxScaleStep] = useState(group.max_scale_step);

  // Region & Type
  const [region, setRegion] = useState(group.region);
  const [instanceType, setInstanceType] = useState(group.type);

  // Image
  const [image, setImage] = useState(group.image);

  // Linode Token
  const [linodeToken, setLinodeToken] = useState('');

  // Network
  const [networkMode, setNetworkMode] = useState(group.network_config?.mode ?? 'vpc_ipv4');
  const [vpcId, setVpcId] = useState(group.network_config?.vpc_id?.toString() ?? '');
  const [subnetId, setSubnetId] = useState(group.network_config?.subnet_id?.toString() ?? '');
  const [firewallId, setFirewallId] = useState(group.network_config?.firewall_id?.toString() ?? '');
  const [nat1To1, setNat1To1] = useState(group.network_config?.nat_1_to_1 ?? false);

  // NodeBalancer
  const [nbEnabled, setNbEnabled] = useState(!!group.nodebalancer_config);
  const [nbId, setNbId] = useState(group.nodebalancer_config?.id?.toString() ?? '');
  const [nbConfigId, setNbConfigId] = useState(
    group.nodebalancer_config?.bindings?.[0]?.config_id?.toString() ?? ''
  );
  const [nbBackendTemplate, setNbBackendTemplate] = useState(
    group.nodebalancer_config?.bindings?.[0]?.backend_address_template ?? '{vpc_ipv4}:80'
  );
  const [nbDrainWait, setNbDrainWait] = useState(
    group.nodebalancer_config?.bindings?.[0]?.drain_wait_seconds ?? 60
  );
  const [nbDrainParallelism, setNbDrainParallelism] = useState(
    group.nodebalancer_config?.bindings?.[0]?.drain_parallelism ?? 1
  );

  // Boot
  const [authorizedKeys, setAuthorizedKeys] = useState(
    group.boot_config?.authorized_keys?.join('\n') ?? ''
  );
  const [cloudInitUserData, setCloudInitUserData] = useState(
    group.boot_config?.cloud_init_user_data ?? ''
  );

  // Readiness
  const [initialWait, setInitialWait] = useState(group.readiness_config?.initial_wait_seconds ?? 90);
  const [overallTimeout, setOverallTimeout] = useState(group.readiness_config?.overall_timeout_seconds ?? 0);
  const [retryCount, setRetryCount] = useState(group.readiness_config?.retry_count ?? 3);
  const [delayBetweenAttempts, setDelayBetweenAttempts] = useState(group.readiness_config?.delay_between_attempts_seconds ?? 60);
  const [tcpEnabled, setTcpEnabled] = useState(group.readiness_config?.tcp?.enabled ?? false);
  const [tcpPort, setTcpPort] = useState(group.readiness_config?.tcp?.port ?? 80);
  const [tcpTimeout, setTcpTimeout] = useState(group.readiness_config?.tcp?.timeout_seconds ?? 5);
  const [httpEnabled, setHttpEnabled] = useState(group.readiness_config?.http?.enabled ?? false);
  const [httpUrl, setHttpUrl] = useState(group.readiness_config?.http?.url ?? 'http://{vpc_ipv4}:80/healthz');
  const [httpExpectedStatus, setHttpExpectedStatus] = useState(group.readiness_config?.http?.expected_status ?? 200);
  const [httpTimeout, setHttpTimeout] = useState(group.readiness_config?.http?.timeout_seconds ?? 5);

  // Cooldowns
  const [scaleUpCooldown, setScaleUpCooldown] = useState(group.cooldown_config?.scale_up_seconds ?? 300);
  const [scaleDownCooldown, setScaleDownCooldown] = useState(group.cooldown_config?.scale_down_seconds ?? 600);

  // Reconciliation
  const [reconcileEnabled, setReconcileEnabled] = useState(group.reconciliation_config?.enabled ?? true);
  const [reconcileInterval, setReconcileInterval] = useState(group.reconciliation_config?.interval_seconds ?? 60);
  const [autoReplace, setAutoReplace] = useState(group.reconciliation_config?.auto_replace ?? false);

  // Alerting
  const [alertingEnabled, setAlertingEnabled] = useState(group.alerting_config?.enabled ?? false);
  const [webhookUrl, setWebhookUrl] = useState(group.alerting_config?.webhook_url ?? '');

  // Metric Scaling
  const [metricEnabled, setMetricEnabled] = useState(group.metric_scaling_config?.enabled ?? false);
  const [metricSourceType, setMetricSourceType] = useState(group.metric_scaling_config?.source_type ?? 'prometheus');
  const [metricEndpoint, setMetricEndpoint] = useState(group.metric_scaling_config?.endpoint ?? '');
  const [metricAuthType, setMetricAuthType] = useState(group.metric_scaling_config?.auth_type ?? 'none');
  const [metricAuthHeader, setMetricAuthHeader] = useState(group.metric_scaling_config?.auth_header ?? '');
  const [metricAuthToken, setMetricAuthToken] = useState(group.metric_scaling_config?.auth_token_ref ?? '');
  const [metricQuery, setMetricQuery] = useState(group.metric_scaling_config?.query ?? '');
  const [metricValuePath, setMetricValuePath] = useState(group.metric_scaling_config?.value_path ?? '');
  const [metricPollInterval, setMetricPollInterval] = useState(group.metric_scaling_config?.poll_interval_seconds ?? 60);
  const [metricScaleUpThreshold, setMetricScaleUpThreshold] = useState(group.metric_scaling_config?.rule?.scale_up_threshold ?? 80);
  const [metricScaleUpAmount, setMetricScaleUpAmount] = useState(group.metric_scaling_config?.rule?.scale_up_amount ?? 1);
  const [metricScaleDownThreshold, setMetricScaleDownThreshold] = useState(group.metric_scaling_config?.rule?.scale_down_threshold ?? 20);
  const [metricScaleDownAmount, setMetricScaleDownAmount] = useState(group.metric_scaling_config?.rule?.scale_down_amount ?? 1);
  const [metricEvalWindow, setMetricEvalWindow] = useState(group.metric_scaling_config?.rule?.evaluation_window_seconds ?? 60);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const data: GroupUpdate = {
        enabled,
        region: region !== group.region ? region : undefined,
        type: instanceType !== group.type ? instanceType : undefined,
        image: image !== group.image ? image : undefined,
        min_instances: minInstances !== group.min_instances ? minInstances : undefined,
        max_instances: maxInstances !== group.max_instances ? maxInstances : undefined,
        desired_count: desiredCount !== group.desired_count ? desiredCount : undefined,
        max_scale_step: maxScaleStep !== group.max_scale_step ? maxScaleStep : undefined,
        cooldowns: { scale_up_seconds: scaleUpCooldown, scale_down_seconds: scaleDownCooldown },
        reconciliation: { enabled: reconcileEnabled, interval_seconds: reconcileInterval, auto_replace: autoReplace },
        alerting: {
          enabled: alertingEnabled,
          webhook_url: webhookUrl || null,
          headers: null,
          bearer_token_ref: null,
          send_on: [],
        },
      };

      data.metric_scaling = {
        enabled: metricEnabled,
        source_type: metricSourceType,
        endpoint: metricEndpoint,
        auth_type: metricAuthType,
        auth_header: metricAuthHeader || null,
        auth_token_ref: metricAuthToken || null,
        query: metricQuery,
        value_path: metricValuePath,
        poll_interval_seconds: metricPollInterval,
        rule: {
          scale_up_threshold: metricScaleUpThreshold,
          scale_up_amount: metricScaleUpAmount,
          scale_down_threshold: metricScaleDownThreshold,
          scale_down_amount: metricScaleDownAmount,
          evaluation_window_seconds: metricEvalWindow,
        },
      };

      if (linodeToken.trim()) {
        data.linode_token = linodeToken.trim();
      }

      if (vpcId || subnetId) {
        data.network = {
          mode: networkMode,
          vpc_id: vpcId ? Number(vpcId) : null,
          subnet_id: subnetId ? Number(subnetId) : null,
          firewall_id: firewallId ? Number(firewallId) : null,
          fallback_private_ipv4: true,
          nat_1_to_1: nat1To1,
        };
      }

      if (nbEnabled && nbId && nbConfigId) {
        data.nodebalancer = {
          id: Number(nbId),
          bindings: [{
            config_id: Number(nbConfigId),
            backend_address_template: nbBackendTemplate,
            subnet_id: subnetId ? Number(subnetId) : null,
            active_mode: 'accept',
            drain_mode: 'drain',
            drain_wait_seconds: nbDrainWait,
            drain_parallelism: nbDrainParallelism,
          }],
        };
      } else if (!nbEnabled && group.nodebalancer_config) {
        data.nodebalancer = { id: 0, bindings: [] };
      }

      const keys = authorizedKeys.split('\n').map(k => k.trim()).filter(Boolean);
      if (keys.length > 0 || cloudInitUserData.trim()) {
        data.boot = {
          root_password_strategy: 'generate_and_encrypt',
          authorized_keys: keys,
          cloud_init_user_data: cloudInitUserData.trim() || null,
        };
      }

      data.readiness = {
        initial_wait_seconds: initialWait,
        tcp: tcpEnabled ? { enabled: true, port: tcpPort, timeout_seconds: tcpTimeout } : null,
        http: httpEnabled ? { enabled: true, url: httpUrl, expected_status: httpExpectedStatus, timeout_seconds: httpTimeout } : null,
        overall_timeout_seconds: overallTimeout,
        retry_count: retryCount,
        delay_between_attempts_seconds: delayBetweenAttempts,
      };

      await api.updateGroup(group.group_id, data);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Group
        <Box sx={{ mt: 0.5 }}>
          <Chip label={group.group_id} size="small" color="primary" variant="outlined" />
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
              label="Enabled"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              size="small"
              helperText="Linode region (e.g. eu-central, us-east)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Instance Type"
              value={instanceType}
              onChange={(e) => setInstanceType(e.target.value)}
              size="small"
              helperText="Linode plan (e.g. g6-standard-2, g6-nanode-1)"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              size="small"
              helperText="Linode image ID (e.g. linode/ubuntu24.04). New instances will use this image."
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              label="Min Instances"
              type="number"
              value={minInstances}
              onChange={(e) => setMinInstances(Number(e.target.value))}
              size="small"
              slotProps={{ htmlInput: { min: 0 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              label="Max Instances"
              type="number"
              value={maxInstances}
              onChange={(e) => setMaxInstances(Number(e.target.value))}
              size="small"
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              label="Desired Count"
              type="number"
              value={desiredCount}
              onChange={(e) => setDesiredCount(Number(e.target.value))}
              size="small"
              slotProps={{ htmlInput: { min: 0 } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              label="Max Scale Step"
              type="number"
              value={maxScaleStep}
              onChange={(e) => setMaxScaleStep(Number(e.target.value))}
              size="small"
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Linode API Token"
              value={linodeToken}
              onChange={(e) => setLinodeToken(e.target.value)}
              type="password"
              size="small"
              helperText="Leave blank to keep existing token. Enter a new value to replace it."
              placeholder="Enter new token to replace..."
            />
          </Grid>
        </Grid>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Network Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Network Mode"
                  value={networkMode}
                  onChange={(e) => setNetworkMode(e.target.value)}
                  size="small"
                  helperText="vpc_ipv4, private_ipv4, public_ipv4"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Firewall ID"
                  value={firewallId}
                  onChange={(e) => setFirewallId(e.target.value)}
                  size="small"
                  type="number"
                  helperText="Required for Linode Interfaces"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="VPC ID"
                  value={vpcId}
                  onChange={(e) => setVpcId(e.target.value)}
                  size="small"
                  type="number"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Subnet ID"
                  value={subnetId}
                  onChange={(e) => setSubnetId(e.target.value)}
                  size="small"
                  type="number"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={nat1To1} onChange={(e) => setNat1To1(e.target.checked)} />}
                  label="Enable 1:1 NAT (public IP)"
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 6 }}>
                  Assigns a public IPv4 address via 1:1 NAT on the VPC interface. Required for internet access without a separate public adapter.
                </Typography>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">NodeBalancer</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormControlLabel
              control={<Switch checked={nbEnabled} onChange={(e) => setNbEnabled(e.target.checked)} />}
              label="Attach NodeBalancer"
              sx={{ mb: 2 }}
            />
            {nbEnabled && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="NodeBalancer ID"
                    value={nbId}
                    onChange={(e) => setNbId(e.target.value)}
                    size="small"
                    type="number"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Config ID"
                    value={nbConfigId}
                    onChange={(e) => setNbConfigId(e.target.value)}
                    size="small"
                    type="number"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Backend Address Template"
                    value={nbBackendTemplate}
                    onChange={(e) => setNbBackendTemplate(e.target.value)}
                    size="small"
                    helperText="{vpc_ipv4}:80 or {private_ipv4}:8080"
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    label="Drain Wait (s)"
                    type="number"
                    value={nbDrainWait}
                    onChange={(e) => setNbDrainWait(Number(e.target.value))}
                    size="small"
                    slotProps={{ htmlInput: { min: 0 } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    label="Drain Parallelism"
                    type="number"
                    value={nbDrainParallelism}
                    onChange={(e) => setNbDrainParallelism(Number(e.target.value))}
                    size="small"
                    slotProps={{ htmlInput: { min: 1 } }}
                    helperText="Nodes drained concurrently"
                  />
                </Grid>
              </Grid>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Boot Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Authorized SSH Keys"
                  value={authorizedKeys}
                  onChange={(e) => setAuthorizedKeys(e.target.value)}
                  multiline
                  rows={3}
                  size="small"
                  helperText="One key per line"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Cloud-Init User Data"
                  value={cloudInitUserData}
                  onChange={(e) => setCloudInitUserData(e.target.value)}
                  multiline
                  rows={3}
                  size="small"
                  helperText="cloud-config YAML (stored as-is, base64-encoded on deploy)"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Readiness Checks</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Initial Wait (s)"
                  type="number"
                  value={initialWait}
                  onChange={(e) => setInitialWait(Number(e.target.value))}
                  size="small"
                  slotProps={{ htmlInput: { min: 0 } }}
                  helperText="Delay before first check"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Retry Count"
                  type="number"
                  value={retryCount}
                  onChange={(e) => setRetryCount(Number(e.target.value))}
                  size="small"
                  slotProps={{ htmlInput: { min: 1 } }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Delay Between (s)"
                  type="number"
                  value={delayBetweenAttempts}
                  onChange={(e) => setDelayBetweenAttempts(Number(e.target.value))}
                  size="small"
                  slotProps={{ htmlInput: { min: 0 } }}
                  helperText="Between retries"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Overall Timeout (s)"
                  type="number"
                  value={overallTimeout}
                  onChange={(e) => setOverallTimeout(Number(e.target.value))}
                  size="small"
                  slotProps={{ htmlInput: { min: 0 } }}
                  helperText="0 = no limit"
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={tcpEnabled} onChange={(e) => setTcpEnabled(e.target.checked)} />}
                  label="TCP Check"
                />
              </Grid>
              {tcpEnabled && (
                <>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      label="TCP Port"
                      type="number"
                      value={tcpPort}
                      onChange={(e) => setTcpPort(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      label="TCP Timeout (s)"
                      type="number"
                      value={tcpTimeout}
                      onChange={(e) => setTcpTimeout(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </Grid>
                </>
              )}

              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={httpEnabled} onChange={(e) => setHttpEnabled(e.target.checked)} />}
                  label="HTTP Check"
                />
              </Grid>
              {httpEnabled && (
                <>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="HTTP URL"
                      value={httpUrl}
                      onChange={(e) => setHttpUrl(e.target.value)}
                      size="small"
                      helperText="Use {vpc_ipv4} or {private_ipv4} as placeholders"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Expected Status"
                      type="number"
                      value={httpExpectedStatus}
                      onChange={(e) => setHttpExpectedStatus(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 100, max: 599 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="HTTP Timeout (s)"
                      type="number"
                      value={httpTimeout}
                      onChange={(e) => setHttpTimeout(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Cooldowns</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Scale Up (s)"
                  type="number"
                  value={scaleUpCooldown}
                  onChange={(e) => setScaleUpCooldown(Number(e.target.value))}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Scale Down (s)"
                  type="number"
                  value={scaleDownCooldown}
                  onChange={(e) => setScaleDownCooldown(Number(e.target.value))}
                  size="small"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Reconciliation</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={reconcileEnabled} onChange={(e) => setReconcileEnabled(e.target.checked)} />}
                  label="Auto-reconcile"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={autoReplace} onChange={(e) => setAutoReplace(e.target.checked)} disabled={!reconcileEnabled} />}
                  label="Auto-replace missing instances"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Interval (s)"
                  type="number"
                  value={reconcileInterval}
                  onChange={(e) => setReconcileInterval(Number(e.target.value))}
                  size="small"
                  disabled={!reconcileEnabled}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Alerting</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={alertingEnabled} onChange={(e) => setAlertingEnabled(e.target.checked)} />}
                  label="Enable Alerts"
                />
              </Grid>
              {alertingEnabled && (
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Webhook URL"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    size="small"
                    placeholder="https://hooks.slack.com/..."
                  />
                </Grid>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Metric-Based Scaling</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={metricEnabled} onChange={(e) => setMetricEnabled(e.target.checked)} />}
                  label="Enable Metric-Based Scaling"
                />
              </Grid>
              {metricEnabled && (
                <>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      select
                      label="Source Type"
                      value={metricSourceType}
                      onChange={(e) => setMetricSourceType(e.target.value)}
                      size="small"
                      helperText="Monitoring system template"
                    >
                      <MenuItem value="prometheus">Prometheus</MenuItem>
                      <MenuItem value="zabbix">Zabbix</MenuItem>
                      <MenuItem value="nagios">Nagios</MenuItem>
                      <MenuItem value="elasticsearch">Elasticsearch</MenuItem>
                      <MenuItem value="datadog">Datadog</MenuItem>
                      <MenuItem value="custom_http">Custom HTTP</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      select
                      label="Auth Type"
                      value={metricAuthType}
                      onChange={(e) => setMetricAuthType(e.target.value)}
                      size="small"
                    >
                      <MenuItem value="none">None</MenuItem>
                      <MenuItem value="bearer">Bearer Token</MenuItem>
                      <MenuItem value="basic">Basic Auth</MenuItem>
                      <MenuItem value="api_key_header">API Key Header</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Endpoint URL"
                      value={metricEndpoint}
                      onChange={(e) => setMetricEndpoint(e.target.value)}
                      size="small"
                      placeholder={metricSourceType === 'prometheus' ? 'http://prometheus:9090' : 'https://monitoring.example.com'}
                      helperText={metricSourceType === 'prometheus' ? 'Prometheus server base URL (without /api/v1/query)' : 'Monitoring system API endpoint'}
                    />
                  </Grid>
                  {metricAuthType !== 'none' && (
                    <>
                      {metricAuthType === 'api_key_header' && (
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <TextField
                            fullWidth
                            label="Header Name"
                            value={metricAuthHeader}
                            onChange={(e) => setMetricAuthHeader(e.target.value)}
                            size="small"
                            placeholder="X-API-Key"
                          />
                        </Grid>
                      )}
                      <Grid size={{ xs: 12, sm: metricAuthType === 'api_key_header' ? 8 : 12 }}>
                        <TextField
                          fullWidth
                          label={metricAuthType === 'basic' ? 'Credentials (user:pass)' : 'Token / Key'}
                          value={metricAuthToken}
                          onChange={(e) => setMetricAuthToken(e.target.value)}
                          size="small"
                          type="password"
                          placeholder={metricAuthType === 'basic' ? 'username:password' : 'token-value'}
                        />
                      </Grid>
                    </>
                  )}
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Query"
                      value={metricQuery}
                      onChange={(e) => setMetricQuery(e.target.value)}
                      size="small"
                      multiline
                      rows={2}
                      placeholder={metricSourceType === 'prometheus' ? 'avg(cpu_usage_percent{group="my-group"})' : metricSourceType === 'zabbix' ? 'Item ID (e.g. 12345)' : 'Query expression'}
                      helperText={metricSourceType === 'prometheus' ? 'PromQL expression' : metricSourceType === 'zabbix' ? 'Zabbix item ID' : metricSourceType === 'elasticsearch' ? 'Elasticsearch query body (JSON)' : 'Query string or parameters'}
                    />
                  </Grid>
                  {(metricSourceType === 'elasticsearch' || metricSourceType === 'custom_http' || metricSourceType === 'nagios') && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Value Path (JSONPath)"
                        value={metricValuePath}
                        onChange={(e) => setMetricValuePath(e.target.value)}
                        size="small"
                        placeholder="aggregations.avg_cpu.value"
                        helperText="Dot-separated path to numeric value in JSON response"
                      />
                    </Grid>
                  )}
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Poll Interval (s)"
                      type="number"
                      value={metricPollInterval}
                      onChange={(e) => setMetricPollInterval(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 10 } }}
                      helperText="Min 10 seconds"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Eval Window (s)"
                      type="number"
                      value={metricEvalWindow}
                      onChange={(e) => setMetricEvalWindow(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 10 } }}
                      helperText="Samples averaged over"
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Scaling Rules: scale up when average metric value exceeds the upper threshold, scale down when it falls below the lower threshold.
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Scale Up Threshold"
                      type="number"
                      value={metricScaleUpThreshold}
                      onChange={(e) => setMetricScaleUpThreshold(Number(e.target.value))}
                      size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Scale Up Amount"
                      type="number"
                      value={metricScaleUpAmount}
                      onChange={(e) => setMetricScaleUpAmount(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Scale Down Threshold"
                      type="number"
                      value={metricScaleDownThreshold}
                      onChange={(e) => setMetricScaleDownThreshold(Number(e.target.value))}
                      size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      fullWidth
                      label="Scale Down Amount"
                      type="number"
                      value={metricScaleDownAmount}
                      onChange={(e) => setMetricScaleDownAmount(Number(e.target.value))}
                      size="small"
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
