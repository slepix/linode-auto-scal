import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import { api } from '../../api/client';
import { formatSeconds } from '../../utils/format';
import type { CooldownStatus as CooldownStatusType } from '../../types';

interface Props {
  groupId: string;
}

export default function CooldownStatus({ groupId }: Props) {
  const [cooldown, setCooldown] = useState<CooldownStatusType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGroupCooldown(groupId)
      .then(setCooldown)
      .catch(() => {})
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      api.getGroupCooldown(groupId).then(setCooldown).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [groupId]);

  if (loading) {
    return <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />;
  }

  if (!cooldown) return null;

  const upPct = cooldown.scale_up_cooldown_seconds > 0
    ? (cooldown.scale_up_remaining_seconds / cooldown.scale_up_cooldown_seconds) * 100
    : 0;
  const downPct = cooldown.scale_down_cooldown_seconds > 0
    ? (cooldown.scale_down_remaining_seconds / cooldown.scale_down_cooldown_seconds) * 100
    : 0;
  const stabPct = cooldown.stabilization_seconds > 0
    ? (cooldown.stabilization_remaining_seconds / cooldown.stabilization_seconds) * 100
    : 0;

  return (
    <Grid container spacing={2}>
      {cooldown.stabilization_seconds > 0 && (
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="overline" color="text.secondary">Stabilization Window</Typography>
                <Chip
                  label={cooldown.stabilization_active ? 'Active' : 'Ready'}
                  size="small"
                  color={cooldown.stabilization_active ? 'error' : 'success'}
                  variant="outlined"
                />
              </Box>
              <Typography variant="h5" color={cooldown.stabilization_active ? 'error.main' : 'success.main'}>
                {formatSeconds(cooldown.stabilization_remaining_seconds)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.5 }}>
                Blocks all scaling for {cooldown.stabilization_seconds}s after any scale event
              </Typography>
              <LinearProgress
                variant="determinate"
                value={stabPct}
                color={cooldown.stabilization_active ? 'error' : 'success'}
              />
            </CardContent>
          </Card>
        </Grid>
      )}
      <Grid size={{ xs: 12, sm: 6 }}>
        <Card variant="outlined">
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="overline" color="text.secondary">Scale Up Cooldown</Typography>
              <Chip
                label={cooldown.scale_up_in_cooldown ? 'Active' : 'Ready'}
                size="small"
                color={cooldown.scale_up_in_cooldown ? 'warning' : 'success'}
                variant="outlined"
              />
            </Box>
            <Typography variant="h5" color={cooldown.scale_up_in_cooldown ? 'warning.main' : 'success.main'}>
              {formatSeconds(cooldown.scale_up_remaining_seconds)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.5 }}>
              Total cooldown: {cooldown.scale_up_cooldown_seconds}s
            </Typography>
            <LinearProgress
              variant="determinate"
              value={upPct}
              color={cooldown.scale_up_in_cooldown ? 'warning' : 'success'}
            />
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Card variant="outlined">
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="overline" color="text.secondary">Scale Down Cooldown</Typography>
              <Chip
                label={cooldown.scale_down_in_cooldown ? 'Active' : 'Ready'}
                size="small"
                color={cooldown.scale_down_in_cooldown ? 'warning' : 'success'}
                variant="outlined"
              />
            </Box>
            <Typography variant="h5" color={cooldown.scale_down_in_cooldown ? 'warning.main' : 'success.main'}>
              {formatSeconds(cooldown.scale_down_remaining_seconds)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.5 }}>
              Total cooldown: {cooldown.scale_down_cooldown_seconds}s
            </Typography>
            <LinearProgress
              variant="determinate"
              value={downPct}
              color={cooldown.scale_down_in_cooldown ? 'warning' : 'success'}
            />
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
