import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import { setApiKey, getApiKey } from '../../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDialog({ open, onClose }: Props) {
  const [key, setKey] = useState(getApiKey());
  const [apiUrl, setApiUrl] = useState(
    localStorage.getItem('autoscaler_api_url') || import.meta.env.VITE_API_URL || 'http://localhost:8000'
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setApiKey(key);
    localStorage.setItem('autoscaler_api_url', apiUrl);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
      window.location.reload();
    }, 1000);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Alert severity="info">
            Enter your autoscaler API key. The key is stored in localStorage only.
          </Alert>
          <TextField
            label="API Base URL"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            size="small"
            fullWidth
            placeholder="http://localhost:8000"
          />
          <TextField
            label="API Key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            size="small"
            fullWidth
            type="password"
            placeholder="sk-..."
            helperText="Authorization: Bearer <key>"
          />
          <Typography variant="caption" color="text.secondary">
            Roles: admin, operator, webhook, readonly — dashboard requires at least readonly
          </Typography>
          {saved && <Alert severity="success">Settings saved — reloading...</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disableElevation>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
