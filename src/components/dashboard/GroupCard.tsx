import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Group, GroupStatus } from '../../types';

interface Props {
  group: Group;
  status: GroupStatus | null;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function GroupCard({ group, status, onClick, onEdit, onDelete }: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const active = status?.active_instances ?? 0;
  const desired = status?.desired_count ?? group.desired_count;
  const max = group.max_instances;
  const fillPct = max > 0 ? (active / max) * 100 : 0;
  const hasActivity = status?.creating_instances || status?.draining_instances;
  const hasFailed = (status?.failed_instances ?? 0) > 0;

  return (
    <Card
      sx={{
        height: '100%',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': {
          boxShadow: '0 0 0 1px rgba(0,188,212,0.4), 0 4px 20px rgba(0,0,0,0.4)',
          borderColor: 'primary.main',
        },
        borderColor: hasFailed ? 'error.main' : undefined,
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
          sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={!!menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => { setMenuAnchor(null); onEdit(); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setMenuAnchor(null); onDelete(); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, pr: 3 }}>
            <Box>
              <Typography variant="h6" sx={{ mb: 0.5, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {group.group_id}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {group.region} · {group.type}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {!group.enabled ? (
                <Tooltip title="Disabled">
                  <PauseCircleOutlineIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                </Tooltip>
              ) : hasFailed ? (
                <Tooltip title="Failed instances">
                  <ErrorOutlineIcon fontSize="small" color="error" />
                </Tooltip>
              ) : (
                <Tooltip title="Healthy">
                  <CheckCircleOutlineIcon fontSize="small" color="success" />
                </Tooltip>
              )}
            </Box>
          </Box>

          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h4" color="primary.main" sx={{ lineHeight: 1 }}>
                {active}
              </Typography>
              <Typography variant="caption" color="text.secondary">active</Typography>
            </Box>
            <Box sx={{ color: 'divider', display: 'flex', alignItems: 'center' }}>/</Box>
            <Box>
              <Typography variant="h4" color="text.secondary" sx={{ lineHeight: 1 }}>
                {desired}
              </Typography>
              <Typography variant="caption" color="text.secondary">desired</Typography>
            </Box>
            {hasActivity ? (
              <Box sx={{ ml: 'auto !important', display: 'flex', alignItems: 'flex-end', pb: 0.25 }}>
                <Chip
                  label={status?.creating_instances ? `+${status.creating_instances} creating` : `${status?.draining_instances} draining`}
                  size="small"
                  color="info"
                  variant="outlined"
                />
              </Box>
            ) : null}
          </Stack>

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Capacity</Typography>
              <Typography variant="caption" color="text.secondary">{active} / {max}</Typography>
            </Box>
            <LinearProgress
              variant={hasActivity ? 'indeterminate' : 'determinate'}
              value={fillPct}
              color={hasFailed ? 'error' : fillPct > 80 ? 'warning' : 'primary'}
            />
          </Box>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Chip label={`min: ${group.min_instances}`} size="small" variant="outlined" />
            <Chip label={`max: ${group.max_instances}`} size="small" variant="outlined" />
            {group.nodebalancer_id && (
              <Chip label={`nb: ${group.nodebalancer_id}`} size="small" variant="outlined" color="info" />
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
