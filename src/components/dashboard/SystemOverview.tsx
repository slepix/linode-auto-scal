import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MetricCard from '../common/MetricCard';
import GroupIcon from '@mui/icons-material/GridView';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import type { Group, GroupStatus } from '../../types';

interface Props {
  groups: Group[];
  statuses: Record<string, GroupStatus>;
}

export default function SystemOverview({ groups, statuses }: Props) {
  const totalActive = Object.values(statuses).reduce((s, st) => s + st.active_instances, 0);
  const totalCreating = Object.values(statuses).reduce((s, st) => s + st.creating_instances, 0);
  const totalFailed = Object.values(statuses).reduce((s, st) => s + st.failed_instances, 0);
  const scalingGroups = Object.values(statuses).filter((s) => s.active_scale_request).length;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
        System Overview
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Groups"
            value={groups.length}
            sub={`${groups.filter((g) => g.enabled).length} enabled`}
            icon={<GroupIcon />}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Active Instances"
            value={totalActive}
            sub={totalCreating > 0 ? `+${totalCreating} creating` : 'across all groups'}
            icon={<CheckCircleIcon />}
            color="success"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Scaling Now"
            value={scalingGroups}
            sub="groups with active requests"
            icon={<WarningIcon />}
            color={scalingGroups > 0 ? 'warning' : 'success'}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <MetricCard
            label="Failed"
            value={totalFailed}
            sub="instances in failed state"
            icon={<ErrorIcon />}
            color={totalFailed > 0 ? 'error' : 'success'}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
