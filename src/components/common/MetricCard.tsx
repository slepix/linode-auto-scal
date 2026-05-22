import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

interface Props {
  label: string;
  value: number | string;
  sub?: string;
  progress?: number;
  color?: 'primary' | 'secondary' | 'error' | 'success' | 'warning' | 'info';
  icon?: React.ReactNode;
}

export default function MetricCard({ label, value, sub, progress, color = 'primary', icon }: Props) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
            {label}
          </Typography>
          {icon && (
            <Box sx={{ color: `${color}.main`, opacity: 0.7, display: 'flex' }}>
              {icon}
            </Box>
          )}
        </Box>
        <Typography variant="h4" color={`${color}.main`} sx={{ mb: 0.5, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
        {progress !== undefined && (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, progress)}
              color={color}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
