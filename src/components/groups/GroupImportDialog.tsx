import { useState, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import { api } from '../../api/client';
import type { Group, GroupCreate } from '../../types';

type ExportedGroup = Omit<Group, 'id' | 'created_at' | 'updated_at'>;

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function GroupImportDialog({ open, onClose, onImported }: Props) {
  const [linodeToken, setLinodeToken] = useState('');
  const [fileData, setFileData] = useState<ExportedGroup[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<{ group_id: string; success: boolean; error?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileData(null);
    setFileName('');
    setParseError(null);
    setLinodeToken('');
    setImporting(false);
    setProgress({ done: 0, total: 0 });
    setResults([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setFileName(file.name);
    setResults([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const groups = Array.isArray(raw) ? raw : [raw];
        if (!groups.length) {
          setParseError('File contains no groups');
          return;
        }
        for (const g of groups) {
          if (!g.group_id || !g.region || !g.type || !g.image) {
            setParseError(`Invalid group entry: missing required fields (group_id, region, type, image)`);
            return;
          }
        }
        setFileData(groups);
      } catch {
        setParseError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!fileData || !linodeToken.trim()) return;

    setImporting(true);
    setProgress({ done: 0, total: fileData.length });
    const importResults: typeof results = [];

    for (const group of fileData) {
      const payload: GroupCreate = {
        group_id: group.group_id,
        enabled: group.enabled ?? false,
        region: group.region,
        type: group.type,
        image: group.image,
        min_instances: group.min_instances ?? 1,
        max_instances: group.max_instances ?? 10,
        desired_count: group.desired_count ?? 1,
        max_scale_step: group.max_scale_step ?? 3,
        linode_token: linodeToken.trim(),
        ...(group.label_prefix && { label_prefix: group.label_prefix }),
        ...(group.protected_tag && { protected_tag: group.protected_tag }),
        ...(group.network_config && { network: group.network_config }),
        ...(group.nodebalancer_config && { nodebalancer: group.nodebalancer_config }),
        ...(group.boot_config && { boot: group.boot_config }),
        ...(group.readiness_config && { readiness: group.readiness_config }),
        ...(group.cooldown_config && { cooldowns: group.cooldown_config }),
        ...(group.reconciliation_config && { reconciliation: group.reconciliation_config }),
        ...(group.alerting_config && { alerting: group.alerting_config }),
        ...(group.metric_scaling_config && { metric_scaling: group.metric_scaling_config }),
      };

      try {
        await api.createGroup(payload);
        importResults.push({ group_id: group.group_id, success: true });
      } catch (e) {
        importResults.push({
          group_id: group.group_id,
          success: false,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResults(importResults);
    setImporting(false);

    if (importResults.every((r) => r.success)) {
      onImported();
    }
  };

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Groups</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a JSON file previously exported from this dashboard. You will need to provide
          a Linode API token that will be used for all imported groups.
        </Typography>

        <Box sx={{ mb: 2 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <Button
            variant="outlined"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {fileName || 'Select JSON file'}
          </Button>
          {fileData && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {fileData.length} group{fileData.length !== 1 ? 's' : ''} found
            </Typography>
          )}
        </Box>

        {parseError && <Alert severity="error" sx={{ mb: 2 }}>{parseError}</Alert>}

        {fileData && (
          <TextField
            fullWidth
            label="Linode API Token"
            type="password"
            value={linodeToken}
            onChange={(e) => setLinodeToken(e.target.value)}
            size="small"
            sx={{ mb: 2 }}
            placeholder="Token to use for all imported groups"
            disabled={importing}
          />
        )}

        {importing && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress
              variant="determinate"
              value={(progress.done / progress.total) * 100}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Importing {progress.done}/{progress.total}...
            </Typography>
          </Box>
        )}

        {results.length > 0 && (
          <Box sx={{ mb: 1 }}>
            {successCount > 0 && (
              <Alert severity="success" sx={{ mb: 1 }}>
                {successCount} group{successCount !== 1 ? 's' : ''} imported successfully
              </Alert>
            )}
            {results.filter((r) => !r.success).map((r) => (
              <Alert severity="error" key={r.group_id} sx={{ mb: 1 }}>
                Failed to import "{r.group_id}": {r.error}
              </Alert>
            ))}
            {failCount > 0 && successCount > 0 && (
              <Typography variant="caption" color="text.secondary">
                Close and reopen to retry failed imports.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {results.length > 0 ? 'Close' : 'Cancel'}
        </Button>
        {!results.length && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!fileData || !linodeToken.trim() || importing}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
