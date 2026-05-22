import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import SettingsIcon from '@mui/icons-material/Settings';
import MemoryIcon from '@mui/icons-material/Memory';
import DashboardIcon from '@mui/icons-material/Dashboard';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

interface Props {
  apiStatus: 'ok' | 'error' | 'unknown';
  onSettings: () => void;
  currentPage: string;
  onNavigate: (page: 'dashboard' | 'apikeys') => void;
}

export default function Header({ apiStatus, onSettings, currentPage, onNavigate }: Props) {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Toolbar variant="dense">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
          <MemoryIcon sx={{ color: 'primary.main', fontSize: 22 }} />
          <Typography
            variant="h6"
            sx={{
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(90deg, #00bcd4, #26a69a)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Linode Autoscaler
          </Typography>
        </Box>

        <Chip
          label="v1"
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.65rem', height: 18, mr: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 0.5, mr: 'auto' }}>
          <Button
            size="small"
            startIcon={<DashboardIcon />}
            onClick={() => onNavigate('dashboard')}
            sx={{
              color: currentPage === 'dashboard' ? 'primary.main' : 'text.secondary',
              bgcolor: currentPage === 'dashboard' ? 'rgba(0,188,212,0.08)' : 'transparent',
            }}
          >
            Dashboard
          </Button>
          <Button
            size="small"
            startIcon={<VpnKeyIcon />}
            onClick={() => onNavigate('apikeys')}
            sx={{
              color: currentPage === 'apikeys' ? 'primary.main' : 'text.secondary',
              bgcolor: currentPage === 'apikeys' ? 'rgba(0,188,212,0.08)' : 'transparent',
            }}
          >
            API Keys
          </Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={`API: ${apiStatus}`}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: apiStatus === 'ok' ? 'success.main' : apiStatus === 'error' ? 'error.main' : 'text.disabled',
                boxShadow: apiStatus === 'ok' ? '0 0 6px rgba(76,175,80,0.6)' : undefined,
              }}
            />
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            {apiStatus === 'ok' ? 'Connected' : apiStatus === 'error' ? 'Disconnected' : 'Connecting...'}
          </Typography>
          <Tooltip title="Settings">
            <IconButton size="small" onClick={onSettings} sx={{ ml: 1 }}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
