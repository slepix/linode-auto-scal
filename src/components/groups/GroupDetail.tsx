import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SyncIcon from '@mui/icons-material/Sync';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import TuneIcon from '@mui/icons-material/Tune';
import Grid from '@mui/material/Grid';
import { api } from '../../api/client';
import { useGroupStatus } from '../../hooks/useGroups';
import MetricCard from '../common/MetricCard';
import InstancesTable from '../instances/InstancesTable';
import EventsTimeline from '../scaling/EventsTimeline';
import CooldownStatus from '../scaling/CooldownStatus';
import DriftList from '../scaling/DriftList';
import type { Group, Instance } from '../../types';

interface Props {
  groupId: string;
  group: Group | null;
  onBack: () => void;
}

export default function GroupDetail({ groupId, group, onBack }: Props) {
  const [tab, setTab] = useState(0);
  const [scaling, setScaling] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [scaleSuccess, setScaleSuccess] = useState<string | null>(null);
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [scaleDownDialogOpen, setScaleDownDialogOpen] = useState(false);
  const { status, loading: statusLoading, refetch } = useGroupStatus(groupId, 8000);

  const handleScaleUp = async () => {
    setScaling(true);
    setScaleError(null);
    try {
      await api.scaleUp(groupId, 1, 'manual scale-up from dashboard');
      setScaleSuccess('Scale-up request submitted');
      refetch();
    } catch (e) {
      setScaleError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setScaling(false);
    }
  };

  const handleScaleDown = () => {
    setScaleDownDialogOpen(true);
  };

  const handleReconcile = async () => {
    try {
      await api.forceReconcile(groupId);
      setScaleSuccess('Reconciliation triggered');
    } catch (e) {
      setScaleError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleClearCooldown = async () => {
    try {
      await api.clearCooldown(groupId);
      setScaleSuccess('Cooldown cleared');
      refetch();
    } catch (e) {
      setScaleError(e instanceof Error ? e.message : 'Failed');
    }
  };

  useEffect(() => {
    if (scaleSuccess) {
      const t = setTimeout(() => setScaleSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [scaleSuccess]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={onBack} size="small" sx={{ mr: 0.5 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ lineHeight: 1.2 }}>{groupId}</Typography>
          {group && (
            <Typography variant="caption" color="text.secondary">
              {group.region} · {group.type} · {group.image}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {group && (
            <Chip
              label={group.enabled ? 'enabled' : 'disabled'}
              color={group.enabled ? 'success' : 'default'}
              size="small"
              variant="outlined"
            />
          )}
          <Tooltip title="Force reconcile">
            <IconButton size="small" onClick={handleReconcile}>
              <SyncIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear cooldown">
            <IconButton size="small" onClick={handleClearCooldown}>
              <TimerOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={refetch}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {scaleError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setScaleError(null)}>{scaleError}</Alert>}
      {scaleSuccess && <Alert severity="success" sx={{ mb: 2 }}>{scaleSuccess}</Alert>}
      {status?.active_scale_request && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Scaling operation in progress (request: {status.active_scale_request})
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Active"
            value={statusLoading ? '—' : (status?.active_instances ?? 0)}
            color="success"
            progress={status ? (status.active_instances / status.max_instances) * 100 : 0}
            sub={`desired: ${status?.desired_count ?? '—'}`}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Creating"
            value={statusLoading ? '—' : (status?.creating_instances ?? 0)}
            color="info"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Draining"
            value={statusLoading ? '—' : (status?.draining_instances ?? 0)}
            color="warning"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Failed"
            value={statusLoading ? '—' : (status?.failed_instances ?? 0)}
            color={status?.failed_instances ? 'error' : 'success'}
          />
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">Scale:</Typography>
        <ButtonGroup size="small" disabled={scaling || !group?.enabled}>
          <Button
            startIcon={<KeyboardArrowUpIcon />}
            onClick={handleScaleUp}
            color="success"
            variant="outlined"
          >
            +1
          </Button>
          <Button
            startIcon={<KeyboardArrowDownIcon />}
            onClick={handleScaleDown}
            color="warning"
            variant="outlined"
          >
            -1
          </Button>
        </ButtonGroup>
        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneIcon />}
          onClick={() => setScaleDialogOpen(true)}
          disabled={!group?.enabled}
        >
          Set Desired
        </Button>
        {group && (
          <Typography variant="caption" color="text.secondary">
            min: {group.min_instances} · max: {group.max_instances} · step: {group.max_scale_step}
          </Typography>
        )}
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="primary" indicatorColor="primary">
          <Tab label="Instances" />
          <Tab label="Events" />
          <Tab label="Cooldown" />
          <Tab label="Drift" />
        </Tabs>
      </Box>

      {tab === 0 && <InstancesTable groupId={groupId} />}
      {tab === 1 && <EventsTimeline groupId={groupId} />}
      {tab === 2 && <CooldownStatus groupId={groupId} />}
      {tab === 3 && <DriftList groupId={groupId} />}

      <ScaleDialog
        open={scaleDialogOpen}
        onClose={() => setScaleDialogOpen(false)}
        groupId={groupId}
        currentDesired={status?.desired_count ?? group?.desired_count ?? 0}
        onSuccess={(msg) => {
          setScaleSuccess(msg);
          setScaleDialogOpen(false);
          refetch();
        }}
        onError={(msg) => setScaleError(msg)}
      />

      <ScaleDownDialog
        open={scaleDownDialogOpen}
        onClose={() => setScaleDownDialogOpen(false)}
        groupId={groupId}
        onSuccess={(msg) => {
          setScaleSuccess(msg);
          setScaleDownDialogOpen(false);
          refetch();
        }}
        onError={(msg) => setScaleError(msg)}
      />
    </Box>
  );
}

function ScaleDialog({
  open, onClose, groupId, currentDesired, onSuccess, onError
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currentDesired: number;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [desired, setDesired] = useState(currentDesired);
  const [reason, setReason] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);

  useEffect(() => { setDesired(currentDesired); }, [currentDesired]);

  const handleSubmit = async () => {
    setLoading(true);
    setDryRunResult(null);
    try {
      const result = await api.setDesired(groupId, desired, reason || 'set from dashboard', dryRun);
      if (dryRun) {
        setDryRunResult(`Dry-run: would ${result.action || 'scale'} to ${result.desired_count} instances (status: ${result.status})`);
      } else {
        onSuccess(`Scale request submitted: desired=${desired}`);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Set Desired Count</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Current desired: {currentDesired}
        </Typography>
        <TextField
          fullWidth
          label="Desired Count"
          type="number"
          value={desired}
          onChange={(e) => setDesired(Number(e.target.value))}
          size="small"
          sx={{ mb: 2 }}
          slotProps={{ htmlInput: { min: 0 } }}
        />
        <TextField
          fullWidth
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          size="small"
          sx={{ mb: 2 }}
          placeholder="Optional reason for scaling"
        />
        <FormControlLabel
          control={<Switch checked={dryRun} onChange={(e) => { setDryRun(e.target.checked); setDryRunResult(null); }} />}
          label="Dry run (preview without applying)"
        />
        {dryRunResult && (
          <Alert severity="info" sx={{ mt: 2 }}>{dryRunResult}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Submitting...' : dryRun ? 'Preview' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ScaleDownDialog({
  open, onClose, groupId, onSuccess, onError
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingInstances, setFetchingInstances] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected([]);
      setReason('');
      setFetchingInstances(true);
      api.getGroupInstances(groupId)
        .then((all) => setInstances(all.filter((i) => i.status === 'active' && !i.protected)))
        .catch(() => {})
        .finally(() => setFetchingInstances(false));
    }
  }, [open, groupId]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    try {
      await api.scaleDown(groupId, selected.length, reason || 'manual scale-down from dashboard', selected);
      onSuccess(`Scale-down request submitted for ${selected.length} instance(s)`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Scale Down - Select Instances</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select which instance(s) to remove. Protected instances are excluded.
        </Typography>
        {fetchingInstances ? (
          <Typography color="text.secondary">Loading instances...</Typography>
        ) : instances.length === 0 ? (
          <Typography color="text.secondary">No eligible instances found.</Typography>
        ) : (
          <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
            {instances.map((inst) => (
              <ListItem key={inst.id} disablePadding>
                <ListItemButton onClick={() => toggle(inst.id)} dense>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      edge="start"
                      checked={selected.includes(inst.id)}
                      disableRipple
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={inst.linode_label || inst.id.slice(0, 12)}
                    secondary={`ID: ${inst.linode_id ?? '—'} · ${inst.vpc_ipv4 ?? inst.private_ipv4 ?? inst.public_ipv4 ?? '—'}`}
                    slotProps={{ primary: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
        <TextField
          fullWidth
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          size="small"
          sx={{ mt: 2 }}
          placeholder="Optional reason for scaling down"
        />
        {selected.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {selected.length} instance(s) will be drained and destroyed.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleSubmit}
          disabled={loading || selected.length === 0}
        >
          {loading ? 'Submitting...' : `Scale Down (${selected.length})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
