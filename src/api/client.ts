import type {
  Group,
  GroupCreate,
  GroupUpdate,
  GroupStatus,
  Instance,
  ScaleEvent,
  ScaleRequest,
  CooldownStatus,
  DriftRecord,
  ApiKey,
  ApiKeyCreated,
  RootPasswordResponse,
  MetricScalingConfig,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

let apiKey = localStorage.getItem('autoscaler_api_key') || '';

export function setApiKey(key: string) {
  apiKey = key;
  localStorage.setItem('autoscaler_api_key', key);
}

export function getApiKey(): string {
  return apiKey;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    const detail = err.detail;
    let message: string;
    if (typeof detail === 'string') {
      message = detail;
    } else if (detail && typeof detail === 'object') {
      message = detail.message || JSON.stringify(detail);
    } else {
      message = `HTTP ${resp.status}`;
    }
    throw new Error(message);
  }

  const text = await resp.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export const api = {
  // Groups CRUD
  getGroups: () => request<Group[]>('GET', '/v1/groups'),
  getGroup: (id: string) => request<Group>('GET', `/v1/groups/${id}`),
  createGroup: (data: GroupCreate) => request<Group>('POST', '/v1/groups', data),
  updateGroup: (id: string, data: GroupUpdate) => request<Group>('PATCH', `/v1/groups/${id}`, data),
  deleteGroup: (id: string, force = true) => request<unknown>('DELETE', `/v1/groups/${id}?force=${force}`),

  // Status
  getGroupStatus: (id: string) => request<GroupStatus>('GET', `/v1/groups/${id}/status`),
  getGroupInstances: (id: string) => request<Instance[]>('GET', `/v1/groups/${id}/instances`),
  getGroupEvents: (id: string) => request<ScaleEvent[]>('GET', `/v1/groups/${id}/events`),
  getGroupCooldown: (id: string) => request<CooldownStatus>('GET', `/v1/groups/${id}/cooldown`),
  getGroupDrift: (id: string) => request<DriftRecord[]>('GET', `/v1/groups/${id}/drift`),

  // Scaling
  scaleUp: (id: string, amount: number, reason?: string) =>
    request<ScaleRequest>('POST', `/v1/groups/${id}/scale-up`, { amount, reason }),
  scaleDown: (id: string, amount: number, reason?: string, instance_ids?: number[]) =>
    request<ScaleRequest>('POST', `/v1/groups/${id}/scale-down`, {
      amount,
      reason,
      ...(instance_ids?.length ? { instance_ids } : {}),
    }),
  setDesired: (id: string, desired_count: number, reason?: string, dry_run = false) =>
    request<ScaleRequest>('POST', `/v1/groups/${id}/scale`, { desired_count, reason, dry_run: dry_run ? 'true' : 'false' }),

  // Admin
  forceReconcile: (id: string) => request<unknown>('POST', `/v1/groups/${id}/force-reconcile`),
  clearCooldown: (id: string) => request<unknown>('POST', `/v1/groups/${id}/clear-cooldown`),
  forceDeleteInstance: (groupId: string, instanceId: string) =>
    request<unknown>('POST', `/v1/groups/${groupId}/instances/${instanceId}/force-delete`),
  purgeInstance: (groupId: string, instanceId: string) =>
    request<unknown>('POST', `/v1/groups/${groupId}/instances/${instanceId}/purge`),
  getRootPassword: (groupId: string, instanceId: string) =>
    request<RootPasswordResponse>('GET', `/v1/groups/${groupId}/instances/${instanceId}/root-password`),
  importInstance: (groupId: string, linodeId: number) =>
    request<Instance>('POST', `/v1/groups/${groupId}/instances/${linodeId}/import`),

  // API Keys
  getApiKeys: () => request<ApiKey[]>('GET', '/v1/api-keys'),
  createApiKey: (name: string, role: string) =>
    request<ApiKeyCreated>('POST', '/v1/api-keys', { name, role }),
  deleteApiKey: (id: string) => request<unknown>('DELETE', `/v1/api-keys/${id}`),

  // Metric Testing
  testMetric: (groupId: string, metricScaling: MetricScalingConfig) =>
    request<{ success: boolean; value: number | null; error: string | null; raw_response: string | null }>(
      'POST', `/v1/groups/${groupId}/test-metric`, { metric_scaling: metricScaling }
    ),

  // System
  healthz: () => request<{ status: string; uptime_seconds: number }>('GET', '/healthz'),
};
