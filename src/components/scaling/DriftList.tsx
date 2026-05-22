import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { api } from '../../api/client';
import { formatDateTime } from '../../utils/format';
import type { DriftRecord } from '../../types';

interface Props {
  groupId: string;
}

export default function DriftList({ groupId }: Props) {
  const [records, setRecords] = useState<DriftRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGroupDrift(groupId)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) {
    return <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />;
  }

  if (!records.length) {
    return (
      <Alert severity="success">
        <AlertTitle>No drift detected</AlertTitle>
        All tracked instances are in sync with the Linode API.
      </Alert>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Alert severity="warning">
        <AlertTitle>Drift detected ({records.length} records)</AlertTitle>
        These Linodes require manual review. Use the import endpoint to bring unmanaged instances into tracking.
      </Alert>
      {records.map((record) => (
        <Alert
          key={record.id}
          severity={record.drift_type === 'unmanaged_drift' ? 'warning' : 'error'}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                <Chip label={record.drift_type.replace(/_/g, ' ')} size="small" variant="outlined" />
                {record.linode_id && (
                  <Chip label={`linode: ${record.linode_id}`} size="small" color="info" variant="outlined" />
                )}
              </Box>
              <Typography variant="body2">{record.message ?? '—'}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {formatDateTime(record.created_at)}
            </Typography>
          </Box>
        </Alert>
      ))}
    </Stack>
  );
}
