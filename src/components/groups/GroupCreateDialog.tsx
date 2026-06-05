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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { api } from '../../api/client';
import type { GroupCreate } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function GroupCreateDialog({ open, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupId, setGroupId] = useState('');
  const [region, setRegion] = useState('us-east');
  const [type, setType] = useState('g6-nanode-1');
  const [image, setImage] = useState('linode/ubuntu24.04');
  const [minInstances, setMinInstances] = useState(1);
  const [maxInstances, setMaxInstances] = useState(10);
  const [desiredCount, setDesiredCount] = useState(1);
  const [maxScaleStep, setMaxScaleStep] = useState(3);
  const [labelPrefix, setLabelPrefix] = useState('');
  const [linodeToken, setLinodeToken] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Network
  const [networkMode, setNetworkMode] = useState('vpc_ipv4');
  const [vpcId, setVpcId] = useState('');
  const [subnetId, setSubnetId] = useState('');
  const [firewallId, setFirewallId] = useState('');
  const [nat1To1, setNat1To1] = useState(false);

  // Nodebalancer
  const [nbEnabled, setNbEnabled] = useState(false);
  const [nbId, setNbId] = useState('');
  const [nbConfigId, setNbConfigId] = useState('');
  const [nbDrainWait, setNbDrainWait] = useState(60);
  const [nbDrainParallelism, setNbDrainParallelism] = useState(1);

  // Cooldowns
  const [scaleUpCooldown, setScaleUpCooldown] = useState(300);
  const [scaleDownCooldown, setScaleDownCooldown] = useState(600);
  const [stabilizationSeconds, setStabilizationSeconds] = useState(0);
  const [scaleRequestTimeout, setScaleRequestTimeout] = useState(600);

  // Readiness
  const [readinessWait, setReadinessWait] = useState(90);
  const [readinessTimeout, setReadinessTimeout] = useState(300);

  // Reconciliation
  const [autoReplace, setAutoReplace] = useState(false);

  // Boot
  const [authorizedKeys, setAuthorizedKeys] = useState('');

  const resetForm = () => {
    setGroupId('');
    setRegion('us-east');
    setType('g6-nanode-1');
    setImage('linode/ubuntu24.04');
    setMinInstances(1);
    setMaxInstances(10);
    setDesiredCount(1);
    setMaxScaleStep(3);
    setLabelPrefix('');
    setLinodeToken('');
    setEnabled(true);
    setNetworkMode('vpc_ipv4');
    setVpcId('');
    setSubnetId('');
    setFirewallId('');
    setNbEnabled(false);
    setNbId('');
    setNbConfigId('');
    setNbDrainWait(60);
    setNbDrainParallelism(1);
    setScaleUpCooldown(300);
    setScaleDownCooldown(600);
    setStabilizationSeconds(0);
    setReadinessWait(90);
    setReadinessTimeout(300);
    setAutoReplace(false);
    setAuthorizedKeys('');
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!groupId.trim()) { setError('Group ID is required'); return; }
    if (!linodeToken.trim()) { setError('Linode API token is required'); return; }

    setLoading(true);
    try {
      const data: GroupCreate = {
        group_id: groupId.trim(),
        enabled,
        region,
        type,
        image,
        min_instances: minInstances,
        max_instances: maxInstances,
        desired_count: desiredCount,
        max_scale_step: maxScaleStep,
        linode_token: linodeToken.trim(),
      };

      if (labelPrefix.trim()) data.label_prefix = labelPrefix.trim();

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
            backend_address_template: '{vpc_ipv4}:80',
            subnet_id: subnetId ? Number(subnetId) : null,
            active_mode: 'accept',
            drain_mode: 'drain',
            drain_wait_seconds: nbDrainWait,
            drain_parallelism: nbDrainParallelism,
          }],
        };
      }

      data.cooldowns = { scale_up_seconds: scaleUpCooldown, scale_down_seconds: scaleDownCooldown, stabilization_seconds: stabilizationSeconds, scale_request_timeout_seconds: scaleRequestTimeout };
      data.reconciliation = { enabled: true, interval_seconds: 60, auto_replace: autoReplace };
      data.readiness = {
        initial_wait_seconds: readinessWait,
        tcp: null,
        http: null,
        overall_timeout_seconds: readinessTimeout,
        retry_count: 3,
        delay_between_attempts_seconds: 60,
      };

      if (authorizedKeys.trim()) {
        data.boot = {
          root_password_strategy: 'generate_and_encrypt',
          authorized_keys: authorizedKeys.split('\n').map(k => k.trim()).filter(Boolean),
          cloud_init_user_data: null,
        };
      }

      await api.createGroup(data);
      resetForm();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Create Scaling Group</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Basic Configuration
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Group ID"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="my-web-servers"
              required
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Label Prefix"
              value={labelPrefix}
              onChange={(e) => setLabelPrefix(e.target.value)}
              placeholder="web"
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              label="Instance Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              label="Image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              size="small"
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
              required
              size="small"
              helperText="Token will be encrypted at rest"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
              label="Enabled"
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
            <Typography variant="subtitle2">Cooldowns & Readiness</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Scale Up Cooldown (s)"
                  type="number"
                  value={scaleUpCooldown}
                  onChange={(e) => setScaleUpCooldown(Number(e.target.value))}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Scale Down Cooldown (s)"
                  type="number"
                  value={scaleDownCooldown}
                  onChange={(e) => setScaleDownCooldown(Number(e.target.value))}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Stabilization (s)"
                  type="number"
                  value={stabilizationSeconds}
                  onChange={(e) => setStabilizationSeconds(Number(e.target.value))}
                  size="small"
                  helperText="Global lock after any event"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Request Timeout (s)"
                  type="number"
                  value={scaleRequestTimeout}
                  onChange={(e) => setScaleRequestTimeout(Number(e.target.value))}
                  size="small"
                  helperText="Stale request expiry"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Initial Wait (s)"
                  type="number"
                  value={readinessWait}
                  onChange={(e) => setReadinessWait(Number(e.target.value))}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  label="Overall Timeout (s)"
                  type="number"
                  value={readinessTimeout}
                  onChange={(e) => setReadinessTimeout(Number(e.target.value))}
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
            <FormControlLabel
              control={<Switch checked={autoReplace} onChange={(e) => setAutoReplace(e.target.checked)} />}
              label="Auto-replace missing instances"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Automatically provision replacement VMs when instances are detected as externally deleted.
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters sx={{ bgcolor: 'background.default', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Boot Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
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
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Creating...' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
