import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Group, GroupStatus } from '../types';

export function useGroups(pollInterval = 30000) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const data = await api.getGroups();
      setGroups(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
    if (pollInterval > 0) {
      const interval = setInterval(fetchGroups, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchGroups, pollInterval]);

  return { groups, loading, error, refetch: fetchGroups };
}

export function useGroupStatus(groupId: string | null, pollInterval = 10000) {
  const [status, setStatus] = useState<GroupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const data = await api.getGroupStatus(groupId);
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchStatus();
    if (pollInterval > 0 && groupId) {
      const interval = setInterval(fetchStatus, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchStatus, pollInterval, groupId]);

  return { status, loading, error, refetch: fetchStatus };
}
