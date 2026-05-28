import { useState, useEffect } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import Skeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import LockIcon from '@mui/icons-material/Lock';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyIcon from '@mui/icons-material/Key';
import InputIcon from '@mui/icons-material/Input';
import { api } from '../../api/client';
import { formatRelative } from '../../utils/format';
import StatusChip from '../common/StatusChip';
import type { Instance } from '../../types';

interface Props {
  groupId: string;
  onScaleDownSelected?: (linodeIds: number[]) => void;
}

export default function InstancesTable({ groupId, onScaleDownSelected }: Props) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordDialog, setPasswordDialog] = useState<{ instanceId: string; label: string } | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importId, setImportId] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Instance | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState<Instance | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchInstances = () => {
    api.getGroupInstances(groupId).then(setInstances).catch(() => {});
  };

  useEffect(() => {
    api.getGroupInstances(groupId)
      .then(setInstances)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    const interval = setInterval(fetchInstances, 10000);
    return () => clearInterval(interval);
  }, [groupId]);

  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  const handleForceDelete = async (inst: Instance) => {
    try {
      await api.forceDeleteInstance(groupId, inst.id);
      setActionMsg({ type: 'success', text: `Instance ${inst.linode_label || inst.id.slice(0, 8)} force-deleted` });
      setDeleteConfirm(null);
      fetchInstances();
    } catch (e) {
      setActionMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' });
    }
  };

  const handlePurge = async (inst: Instance) => {
    try {
      await api.purgeInstance(groupId, inst.id);
      setActionMsg({ type: 'success', text: `Instance ${inst.linode_label || inst.id.slice(0, 8)} purged from tracking` });
      setPurgeConfirm(null);
      fetchInstances();
    } catch (e) {
      setActionMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed' });
    }
  };

  const handleGetPassword = async (instanceId: string) => {
    setPasswordLoading(true);
    setPassword(null);
    try {
      const result = await api.getRootPassword(groupId, instanceId);
      setPassword(result.root_password);
    } catch (e) {
      setActionMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to get password' });
      setPasswordDialog(null);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importId.trim()) return;
    setImportLoading(true);
    try {
      await api.importInstance(groupId, Number(importId));
      setActionMsg({ type: 'success', text: `Linode ${importId} imported` });
      setImportOpen(false);
      setImportId('');
      fetchInstances();
    } catch (e) {
      setActionMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to import' });
    } finally {
      setImportLoading(false);
    }
  };

  const selectableInstances = instances.filter(
    (i) => i.status === 'active' && i.linode_id != null && !i.protected
  );

  if (loading) {
    return <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  return (
    <Box>
      {actionMsg && (
        <Alert severity={actionMsg.type} sx={{ mb: 2 }} onClose={() => setActionMsg(null)}>
          {actionMsg.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
        {selected.size > 0 && onScaleDownSelected && (
          <Button
            size="small"
            color="warning"
            variant="outlined"
            startIcon={<KeyboardArrowDownIcon />}
            onClick={() => onScaleDownSelected(Array.from(selected))}
          >
            Scale Down Selected ({selected.size})
          </Button>
        )}
        <Button size="small" startIcon={<InputIcon />} onClick={() => setImportOpen(true)}>
          Import Instance
        </Button>
      </Box>

      {!instances.length ? (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          <Typography>No instances found</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                {onScaleDownSelected && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      indeterminate={selected.size > 0 && selected.size < selectableInstances.length}
                      checked={selectableInstances.length > 0 && selected.size === selectableInstances.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected(new Set(selectableInstances.map((i) => i.linode_id!)));
                        } else {
                          setSelected(new Set());
                        }
                      }}
                    />
                  </TableCell>
                )}
                <TableCell>Label</TableCell>
                <TableCell>Linode ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Internal IP</TableCell>
                <TableCell>External IP</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Flags</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {instances.map((inst) => {
                const isSelectable = inst.status === 'active' && inst.linode_id != null && !inst.protected;
                const isSelected = inst.linode_id != null && selected.has(inst.linode_id);
                return (
                <TableRow key={inst.id} hover selected={isSelected}>
                  {onScaleDownSelected && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        disabled={!isSelectable}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) {
                            next.add(inst.linode_id!);
                          } else {
                            next.delete(inst.linode_id!);
                          }
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {inst.linode_label ?? inst.id.slice(0, 12)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {inst.linode_id ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={inst.status} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      {inst.vpc_ipv4 && (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.73rem' }} color="text.primary">
                          {inst.vpc_ipv4}
                        </Typography>
                      )}
                      {inst.private_ipv4 && (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.73rem' }} color="text.secondary">
                          {inst.private_ipv4}
                        </Typography>
                      )}
                      {!inst.vpc_ipv4 && !inst.private_ipv4 && (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.73rem' }} color="text.secondary">
                      {inst.public_ipv4 ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatRelative(inst.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {inst.protected && (
                        <Tooltip title="Protected">
                          <Chip icon={<LockIcon />} label="protected" size="small" color="warning" variant="outlined" />
                        </Tooltip>
                      )}
                      {inst.created_by !== 'autoscaler' && (
                        <Chip label={inst.created_by} size="small" variant="outlined" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0} justifyContent="flex-end">
                      <Tooltip title="View root password">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setPasswordDialog({ instanceId: inst.id, label: inst.linode_label || inst.id.slice(0, 8) });
                            handleGetPassword(inst.id);
                          }}
                        >
                          <KeyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {(inst.status === 'draining' || inst.status === 'deleting') && (
                        <Tooltip title="Purge from DB">
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => setPurgeConfirm(inst)}
                          >
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Force delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteConfirm(inst)}
                        >
                          <DeleteForeverIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Password Dialog */}
      <Dialog open={!!passwordDialog} onClose={() => { setPasswordDialog(null); setPassword(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Root Password</DialogTitle>
        <DialogContent>
          {passwordDialog && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Instance: {passwordDialog.label}
            </Typography>
          )}
          {passwordLoading ? (
            <Skeleton variant="rectangular" height={40} />
          ) : password ? (
            <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>
                {password}
              </Typography>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPasswordDialog(null); setPassword(null); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Import Linode Instance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Import an existing Linode into this scaling group by its Linode ID.
          </Typography>
          <TextField
            fullWidth
            label="Linode ID"
            value={importId}
            onChange={(e) => setImportId(e.target.value)}
            type="number"
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleImport} disabled={importLoading || !importId.trim()}>
            {importLoading ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs">
        <DialogTitle>Force Delete Instance</DialogTitle>
        <DialogContent>
          <Typography>
            This will forcefully remove instance{' '}
            <strong>{deleteConfirm?.linode_label || deleteConfirm?.id.slice(0, 8)}</strong>{' '}
            and destroy the Linode. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleForceDelete(deleteConfirm)}>
            Force Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Purge Confirmation */}
      <Dialog open={!!purgeConfirm} onClose={() => setPurgeConfirm(null)} maxWidth="xs">
        <DialogTitle>Purge Instance from Tracking</DialogTitle>
        <DialogContent>
          <Typography>
            This will remove instance{' '}
            <strong>{purgeConfirm?.linode_label || purgeConfirm?.id.slice(0, 8)}</strong>{' '}
            from the database without touching the Linode. You are responsible for manually deleting the VM.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurgeConfirm(null)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={() => purgeConfirm && handlePurge(purgeConfirm)}>
            Purge
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
