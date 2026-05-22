import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import GroupCard from './GroupCard';
import type { Group, GroupStatus } from '../../types';

interface Props {
  groups: Group[];
  statuses: Record<string, GroupStatus>;
  loading: boolean;
  onGroupClick: (groupId: string) => void;
  onCreateGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (groupId: string) => void;
}

export default function GroupsGrid({ groups, statuses, loading, onGroupClick, onCreateGroup, onEditGroup, onDeleteGroup }: Props) {
  if (loading) {
    return (
      <Grid container spacing={2}>
        {[1, 2, 3, 4].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!groups.length) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" gutterBottom>No groups configured</Typography>
        <Typography variant="body2" sx={{ mb: 3 }}>
          Create your first scaling group to get started
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateGroup}
        >
          Create Group
        </Button>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {groups.map((group) => (
        <Grid key={group.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <GroupCard
            group={group}
            status={statuses[group.group_id] ?? null}
            onClick={() => onGroupClick(group.group_id)}
            onEdit={() => onEditGroup(group)}
            onDelete={() => onDeleteGroup(group.group_id)}
          />
        </Grid>
      ))}
      <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
        <Box
          onClick={onCreateGroup}
          sx={{
            height: '100%',
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            cursor: 'pointer',
            transition: 'border-color 0.2s, background-color 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'rgba(0,188,212,0.04)',
            },
          }}
        >
          <AddIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            New Group
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
}
