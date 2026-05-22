import Chip from '@mui/material/Chip';
import { STATUS_COLORS } from '../../utils/format';

interface Props {
  status: string;
  size?: 'small' | 'medium';
}

export default function StatusChip({ status, size = 'small' }: Props) {
  const color = STATUS_COLORS[status] ?? 'default';
  return (
    <Chip
      label={status.replace(/_/g, ' ')}
      color={color}
      size={size}
      variant={color === 'default' ? 'outlined' : 'filled'}
    />
  );
}
