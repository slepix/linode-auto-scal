import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { api } from '../../api/client';
import { formatRelative } from '../../utils/format';
import type { ApiKey, ApiKeyCreated } from '../../types';

const ROLE_COLORS: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
  admin: 'error',
  operator: 'warning',
  webhook: 'info',
  readonly: 'success',
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api.getApiKeys();
      setKeys(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteApiKey(id);
      setKeys(keys.filter(k => k.id !== id));
      setDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete key');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5">API Keys</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage authentication keys for API access
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Create Key
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Stack spacing={1}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={52} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No API keys found
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((key) => (
                  <TableRow key={key.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{key.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{key.id}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={key.role}
                        size="small"
                        color={ROLE_COLORS[key.role] || 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={key.enabled ? 'active' : 'disabled'}
                        size="small"
                        color={key.enabled ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{formatRelative(key.created_at)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {key.last_used_at ? formatRelative(key.last_used_at) : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setDeleteId(key.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(key) => {
          setCreatedKey(key);
          setCreateOpen(false);
          fetchKeys();
        }}
      />

      {createdKey && (
        <KeyRevealDialog
          apiKey={createdKey}
          onClose={() => setCreatedKey(null)}
        />
      )}

      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete API Key</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently revoke this key. Any services using it will lose access immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteId && handleDelete(deleteId)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function CreateKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (key: ApiKeyCreated) => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('readonly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    setLoading(true);
    try {
      const key = await api.createApiKey(name.trim(), role);
      setName('');
      setRole('readonly');
      onCreated(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create API Key</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          fullWidth
          label="Key Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          sx={{ mt: 1, mb: 2 }}
          placeholder="e.g. monitoring-service"
        />
        <FormControl fullWidth size="small">
          <InputLabel>Role</InputLabel>
          <Select value={role} onChange={(e) => setRole(e.target.value)} label="Role">
            <MenuItem value="admin">Admin (full access)</MenuItem>
            <MenuItem value="operator">Operator (scale + manage groups)</MenuItem>
            <MenuItem value="webhook">Webhook (scale only)</MenuItem>
            <MenuItem value="readonly">Read-only (view only)</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={loading}>
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KeyRevealDialog({ apiKey, onClose }: { apiKey: ApiKeyCreated; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>API Key Created</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Copy this key now. It will not be shown again.
        </Alert>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 2,
            bgcolor: 'background.default',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              flex: 1,
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {apiKey.key}
          </Typography>
          <Tooltip title={copied ? 'Copied' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Name: {apiKey.name} | Role: {apiKey.role}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
