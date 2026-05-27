import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { api } from '../../api/client';
import { formatDateTime, SEVERITY_COLORS } from '../../utils/format';
import type { ScaleEvent } from '../../types';

interface Props {
  groupId: string;
}

const METADATA_LABELS: Record<string, string> = {
  error: 'Error',
  phase: 'Phase',
  instance_num: 'Instance #',
  total_batch: 'Batch Size',
  request_id: 'Request ID',
  region: 'Region',
  instance_type: 'Instance Type',
  image: 'Image',
  linode_id: 'Linode ID',
  linode_label: 'Linode Label',
  target_ip: 'Target IP',
  retry_count: 'Retry Count',
  tcp_port: 'TCP Port',
  http_url: 'HTTP URL',
  expected_status: 'Expected Status',
  timeout_seconds: 'Timeout',
  nodebalancer_id: 'NodeBalancer ID',
  config_id: 'Config ID',
  node_id: 'Node ID',
  address: 'Address',
  instance_id: 'Instance ID',
  source_type: 'Source Type',
  endpoint: 'Endpoint',
  query: 'Query',
};

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function EventDetail({ evt }: { evt: ScaleEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasMetadata = evt.metadata && Object.keys(evt.metadata).length > 0;
  const isFailure = evt.severity === 'error' || evt.severity === 'critical';

  return (
    <Box>
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
                  color={isFailure ? 'error' : 'default'}
                  sx={{ fontSize: '0.65rem', flexShrink: 0 }}
                />
                <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {evt.message ?? '—'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(evt.created_at)}
                </Typography>
                {isFailure && hasMetadata && (
                  <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ p: 0.25 }}>
                    {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                )}
              </Box>
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
            {isFailure && hasMetadata && (
              <Collapse in={expanded}>
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    bgcolor: 'background.default',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.75, display: 'block' }}>
                    Error Details
                  </Typography>
                  <Box
                    component="table"
                    sx={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      '& td': { py: 0.25, px: 0.5, verticalAlign: 'top' },
                      '& td:first-of-type': { whiteSpace: 'nowrap', color: 'text.secondary', fontWeight: 500, width: '120px' },
                    }}
                  >
                    <tbody>
                      {Object.entries(evt.metadata!).map(([key, value]) => (
                        <Box component="tr" key={key}>
                          <Box component="td">
                            <Typography variant="caption">
                              {METADATA_LABELS[key] || key.replace(/_/g, ' ')}
                            </Typography>
                          </Box>
                          <Box component="td">
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: key === 'error' ? 'monospace' : 'inherit',
                                wordBreak: 'break-all',
                                color: key === 'error' ? 'error.main' : 'text.primary',
                              }}
                            >
                              {formatMetaValue(value)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </tbody>
                  </Box>
                </Box>
              </Collapse>
            )}
          </Box>
        </Alert>
      </Box>
    </Box>
  );
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
          <EventDetail evt={evt} />
          {i < events.length - 1 && <Divider />}
        </Box>
      ))}
    </Box>
  );
}
