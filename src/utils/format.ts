export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatSeconds(s: number): string {
  if (s <= 0) return 'Ready';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  active: 'success',
  creating: 'info',
  booting: 'info',
  waiting_initial_delay: 'info',
  checking_tcp: 'info',
  checking_http: 'info',
  attaching_to_nodebalancer: 'info',
  ready: 'success',
  draining: 'warning',
  deleting: 'warning',
  deleted: 'default',
  failed: 'error',
  unmanaged_drift: 'error',
  queued: 'info',
  validating: 'info',
  running: 'primary',
  succeeded: 'success',
  cancelled: 'default',
  blocked_by_cooldown: 'warning',
  blocked_by_min_instances: 'warning',
  blocked_by_max_instances: 'warning',
  blocked_by_health: 'error',
  blocked_by_concurrent_operation: 'warning',
};

export const SEVERITY_COLORS: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  critical: 'error',
};
