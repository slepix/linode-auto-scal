import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Toolbar from '@mui/material/Toolbar';
import Alert from '@mui/material/Alert';
import theme from './theme';
import { api } from './api/client';
import { useGroups } from './hooks/useGroups';
import Header from './components/dashboard/Header';
import SettingsDialog from './components/dashboard/SettingsDialog';
import SystemOverview from './components/dashboard/SystemOverview';
import GroupsGrid from './components/dashboard/GroupsGrid';
import GroupDetail from './components/groups/GroupDetail';
import GroupCreateDialog from './components/groups/GroupCreateDialog';
import GroupEditDialog from './components/groups/GroupEditDialog';
import ApiKeysPage from './components/apikeys/ApiKeysPage';
import type { GroupStatus, Group } from './types';

type Page = 'dashboard' | 'apikeys';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [apiStatus, setApiStatus] = useState<'ok' | 'error' | 'unknown'>('unknown');
  const [statuses, setStatuses] = useState<Record<string, GroupStatus>>({});
  const { groups, loading: groupsLoading, error: groupsError, refetch: refetchGroups } = useGroups(20000);

  useEffect(() => {
    const check = async () => {
      try {
        await api.healthz();
        setApiStatus('ok');
      } catch {
        setApiStatus('error');
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('autoscaler_api_key')?.trim()) {
      setSettingsOpen(true);
    }
  }, []);

  const fetchStatuses = useCallback(async () => {
    if (!groups.length) return;
    const results = await Promise.allSettled(
      groups.map((g) => api.getGroupStatus(g.group_id))
    );
    const newStatuses: Record<string, GroupStatus> = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        newStatuses[groups[i].group_id] = result.value;
      }
    });
    setStatuses(newStatuses);
  }, [groups]);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 12000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const selectedGroupData: Group | null =
    groups.find((g) => g.group_id === selectedGroup) ?? null;

  const handleNavigate = (p: Page) => {
    setPage(p);
    setSelectedGroup(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Header
          apiStatus={apiStatus}
          onSettings={() => setSettingsOpen(true)}
          currentPage={page}
          onNavigate={handleNavigate}
        />
        <Toolbar variant="dense" />

        <Container maxWidth="xl" sx={{ py: 3 }}>
          {groupsError && !selectedGroup && page === 'dashboard' && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Typography
                  variant="caption"
                  sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => setSettingsOpen(true)}
                >
                  Configure API key
                </Typography>
              }
            >
              {groupsError}
            </Alert>
          )}

          {page === 'dashboard' && !selectedGroup && (
            <>
              <SystemOverview groups={groups} statuses={statuses} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h5">Scaling Groups</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {groups.length} group{groups.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Box>
              <GroupsGrid
                groups={groups}
                statuses={statuses}
                loading={groupsLoading}
                onGroupClick={setSelectedGroup}
                onCreateGroup={() => setCreateGroupOpen(true)}
                onEditGroup={(g) => setEditGroup(g)}
                onDeleteGroup={async (id) => {
                  await api.deleteGroup(id);
                  refetchGroups();
                }}
              />
            </>
          )}

          {page === 'dashboard' && selectedGroup && (
            <GroupDetail
              groupId={selectedGroup}
              group={selectedGroupData}
              onBack={() => setSelectedGroup(null)}
            />
          )}

          {page === 'apikeys' && <ApiKeysPage />}
        </Container>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        <GroupCreateDialog
          open={createGroupOpen}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={() => {
            setCreateGroupOpen(false);
            refetchGroups();
          }}
        />

        {editGroup && (
          <GroupEditDialog
            open={!!editGroup}
            group={editGroup}
            onClose={() => setEditGroup(null)}
            onUpdated={() => {
              setEditGroup(null);
              refetchGroups();
            }}
          />
        )}
      </Box>
    </ThemeProvider>
  );
}
