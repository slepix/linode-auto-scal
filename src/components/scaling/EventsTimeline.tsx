import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import { api } from '../../api/client';
import { formatDateTime, SEVERITY_COLORS } from '../../utils/format';
import type { ScaleEvent } from '../../types';

interface Props {
  groupId: string;
}

export default function EventsTimeline({ groupId }: Props) {
  const [events, setEvents] = useState<ScaleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGroupEvents(groupId)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      api.getGroupEvents(groupId).then(setEvents).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [groupId]);

  if (loading) {
    return <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />;
  }

  if (!events.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <Typography>No events yet</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {events.map((evt, i) => (
        <Box key={evt.id}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1 }}>
            <Alert
              severity={SEVERITY_COLORS[evt.severity] ?? 'info'}
              icon={false}
              sx={{
                flex: 1,
                py: 0.75,
                px: 1.5,
                '& .MuiAlert-message': { width: '100%' },
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                    <Chip
                      label={evt.event_type.replace(/_/g, ' ')}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.65rem', flexShrink: 0 }}
                    />
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {evt.message ?? '—'}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatDateTime(evt.created_at)}
                  </Typography>
                </Box>
                {evt.reason && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Reason: {evt.reason}
                    </Typography>
                    {evt.source && (
                      <Chip
                        label={evt.source}
                        size="small"
                        variant="filled"
                        color="default"
                        sx={{ fontSize: '0.6rem', height: 18 }}
                      />
                    )}
                  </Box>
                )}
              </Box>
            </Alert>
          </Box>
          {i < events.length - 1 && <Divider />}
        </Box>
      ))}
    </Box>
  );
}
