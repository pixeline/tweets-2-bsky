import axios from 'axios';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Clock3,
  Download,
  History,
  Loader2,
  LogOut,
  Moon,
  Play,
  Plus,
  Save,
  Settings2,
  Sun,
  SunMoon,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { cn } from './lib/utils';

type ThemeMode = 'system' | 'light' | 'dark';
type AuthView = 'login' | 'register';

type AppState = 'idle' | 'checking' | 'backfilling' | 'pacing' | 'processing';

interface AccountMapping {
  id: string;
  twitterUsernames: string[];
  bskyIdentifier: string;
  bskyPassword: string;
  bskyServiceUrl?: string;
  enabled: boolean;
  owner?: string;
}

interface TwitterConfig {
  authToken: string;
  ct0: string;
  backupAuthToken?: string;
  backupCt0?: string;
}

interface AIConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface ActivityLog {
  twitter_id: string;
  twitter_username: string;
  bsky_identifier: string;
  tweet_text?: string;
  bsky_uri?: string;
  status: 'migrated' | 'skipped' | 'failed';
  created_at?: string;
}

interface PendingBackfill {
  id: string;
  limit?: number;
  queuedAt: number;
  sequence: number;
  requestId: string;
  position: number;
}

interface StatusState {
  state: AppState;
  currentAccount?: string;
  processedCount?: number;
  totalCount?: number;
  message?: string;
  backfillMappingId?: string;
  backfillRequestId?: string;
  lastUpdate: number;
}

interface StatusResponse {
  lastCheckTime: number;
  nextCheckTime: number;
  nextCheckMinutes: number;
  checkIntervalMinutes: number;
  pendingBackfills: PendingBackfill[];
  currentStatus: StatusState;
}

interface AuthUser {
  email: string;
  isAdmin: boolean;
}

interface Notice {
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface MappingFormState {
  owner: string;
  twitterUsernames: string;
  bskyIdentifier: string;
  bskyPassword: string;
  bskyServiceUrl: string;
}

const defaultMappingForm = (): MappingFormState => ({
  owner: '',
  twitterUsernames: '',
  bskyIdentifier: '',
  bskyPassword: '',
  bskyServiceUrl: 'https://bsky.social',
});

const selectClassName =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const serverMessage = error.response?.data?.error;
    if (typeof serverMessage === 'string' && serverMessage.length > 0) {
      return serverMessage;
    }
    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message;
    }
  }
  return fallback;
}

function formatState(state: AppState): string {
  switch (state) {
    case 'checking':
      return 'Checking';
    case 'backfilling':
      return 'Backfilling';
    case 'pacing':
      return 'Pacing';
    case 'processing':
      return 'Processing';
    default:
      return 'Idle';
  }
}

function getBskyPostUrl(activity: ActivityLog): string | null {
  if (!activity.bsky_uri || !activity.bsky_identifier) {
    return null;
  }

  const postId = activity.bsky_uri.split('/').filter(Boolean).pop();
  if (!postId) {
    return null;
  }

  return `https://bsky.app/profile/${activity.bsky_identifier}/post/${postId}`;
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [authView, setAuthView] = useState<AuthView>('login');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const [mappings, setMappings] = useState<AccountMapping[]>([]);
  const [twitterConfig, setTwitterConfig] = useState<TwitterConfig>({ authToken: '', ct0: '' });
  const [aiConfig, setAiConfig] = useState<AIConfig>({ provider: 'gemini', apiKey: '', model: '', baseUrl: '' });
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [countdown, setCountdown] = useState('--');

  const [me, setMe] = useState<AuthUser | null>(null);
  const [editingMapping, setEditingMapping] = useState<AccountMapping | null>(null);
  const [newMapping, setNewMapping] = useState<MappingFormState>(defaultMappingForm);
  const [editForm, setEditForm] = useState<MappingFormState>(defaultMappingForm);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const noticeTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = me?.isAdmin ?? false;
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);

  const showNotice = useCallback((tone: Notice['tone'], message: string) => {
    setNotice({ tone, message });
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
    }, 4200);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setMe(null);
    setMappings([]);
    setStatus(null);
    setRecentActivity([]);
    setEditingMapping(null);
    setAuthView('login');
  }, []);

  const handleAuthFailure = useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        handleLogout();
        return;
      }
      showNotice('error', getApiErrorMessage(error, fallbackMessage));
    },
    [handleLogout, showNotice],
  );

  const fetchStatus = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await axios.get<StatusResponse>('/api/status', { headers: authHeaders });
      setStatus(response.data);
    } catch (error) {
      handleAuthFailure(error, 'Failed to fetch status.');
    }
  }, [authHeaders, handleAuthFailure]);

  const fetchRecentActivity = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await axios.get<ActivityLog[]>('/api/recent-activity?limit=20', { headers: authHeaders });
      setRecentActivity(response.data);
    } catch (error) {
      handleAuthFailure(error, 'Failed to fetch activity.');
    }
  }, [authHeaders, handleAuthFailure]);

  const fetchData = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const [meResponse, mappingsResponse] = await Promise.all([
        axios.get<AuthUser>('/api/me', { headers: authHeaders }),
        axios.get<AccountMapping[]>('/api/mappings', { headers: authHeaders }),
      ]);

      const profile = meResponse.data;
      setMe(profile);
      setMappings(mappingsResponse.data);

      if (profile.isAdmin) {
        const [twitterResponse, aiResponse] = await Promise.all([
          axios.get<TwitterConfig>('/api/twitter-config', { headers: authHeaders }),
          axios.get<AIConfig>('/api/ai-config', { headers: authHeaders }),
        ]);

        setTwitterConfig({
          authToken: twitterResponse.data.authToken || '',
          ct0: twitterResponse.data.ct0 || '',
          backupAuthToken: twitterResponse.data.backupAuthToken || '',
          backupCt0: twitterResponse.data.backupCt0 || '',
        });

        setAiConfig({
          provider: aiResponse.data.provider || 'gemini',
          apiKey: aiResponse.data.apiKey || '',
          model: aiResponse.data.model || '',
          baseUrl: aiResponse.data.baseUrl || '',
        });
      }

      await Promise.all([fetchStatus(), fetchRecentActivity()]);
    } catch (error) {
      handleAuthFailure(error, 'Failed to load dashboard data.');
    }
  }, [authHeaders, fetchRecentActivity, fetchStatus, handleAuthFailure]);

  useEffect(() => {
    localStorage.setItem('theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const next = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      setResolvedTheme(next);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(next);
    };

    applyTheme();
    media.addEventListener('change', applyTheme);

    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [themeMode]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void fetchData();
  }, [token, fetchData]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const statusInterval = window.setInterval(() => {
      void fetchStatus();
    }, 2000);

    const activityInterval = window.setInterval(() => {
      void fetchRecentActivity();
    }, 7000);

    return () => {
      window.clearInterval(statusInterval);
      window.clearInterval(activityInterval);
    };
  }, [token, fetchRecentActivity, fetchStatus]);

  useEffect(() => {
    if (!status?.nextCheckTime) {
      setCountdown('--');
      return;
    }

    const updateCountdown = () => {
      const ms = status.nextCheckTime - Date.now();
      if (ms <= 0) {
        setCountdown('Checking...');
        return;
      }

      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      setCountdown(`${minutes}m ${String(seconds).padStart(2, '0')}s`);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [status?.nextCheckTime]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const pendingBackfills = status?.pendingBackfills ?? [];
  const currentStatus = status?.currentStatus;
  const postedActivity = useMemo(
    () =>
      recentActivity
        .filter((activity) => activity.status === 'migrated' && Boolean(getBskyPostUrl(activity)))
        .slice(0, 12),
    [recentActivity],
  );

  const isBackfillQueued = useCallback(
    (mappingId: string) => pendingBackfills.some((entry) => entry.id === mappingId),
    [pendingBackfills],
  );

  const getBackfillEntry = useCallback(
    (mappingId: string) => pendingBackfills.find((entry) => entry.id === mappingId),
    [pendingBackfills],
  );

  const isBackfillActive = useCallback(
    (mappingId: string) => currentStatus?.state === 'backfilling' && currentStatus.backfillMappingId === mappingId,
    [currentStatus],
  );

  const progressPercent = useMemo(() => {
    if (!currentStatus?.totalCount || currentStatus.totalCount <= 0) {
      return 0;
    }
    const processed = currentStatus.processedCount || 0;
    return Math.max(0, Math.min(100, Math.round((processed / currentStatus.totalCount) * 100)));
  }, [currentStatus]);

  const cycleThemeMode = () => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  const themeIcon =
    themeMode === 'system' ? <SunMoon className="h-4 w-4" /> : themeMode === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />;

  const themeLabel =
    themeMode === 'system' ? `Theme: system (${resolvedTheme})` : `Theme: ${themeMode}`;

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setIsBusy(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');

    try {
      const response = await axios.post<{ token: string }>('/api/login', { email, password });
      localStorage.setItem('token', response.data.token);
      setToken(response.data.token);
      showNotice('success', 'Logged in.');
    } catch (error) {
      setAuthError(getApiErrorMessage(error, 'Invalid credentials.'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setIsBusy(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');

    try {
      await axios.post('/api/register', { email, password });
      setAuthView('login');
      showNotice('success', 'Registration successful. Please log in.');
    } catch (error) {
      setAuthError(getApiErrorMessage(error, 'Registration failed.'));
    } finally {
      setIsBusy(false);
    }
  };

  const runNow = async () => {
    if (!authHeaders) {
      return;
    }

    try {
      await axios.post('/api/run-now', {}, { headers: authHeaders });
      showNotice('info', 'Check triggered.');
      await fetchStatus();
    } catch (error) {
      handleAuthFailure(error, 'Failed to trigger a check.');
    }
  };

  const clearAllBackfills = async () => {
    if (!authHeaders) {
      return;
    }

    const confirmed = window.confirm('Stop all pending and active backfills?');
    if (!confirmed) {
      return;
    }

    try {
      await axios.post('/api/backfill/clear-all', {}, { headers: authHeaders });
      showNotice('success', 'Backfill queue cleared.');
      await fetchStatus();
    } catch (error) {
      handleAuthFailure(error, 'Failed to clear backfill queue.');
    }
  };

  const requestBackfill = async (mappingId: string, mode: 'normal' | 'reset') => {
    if (!authHeaders) {
      return;
    }

    const busy = pendingBackfills.length > 0 || currentStatus?.state === 'backfilling';
    if (busy) {
      const proceed = window.confirm(
        'Backfill is already queued or active. This request will replace the existing queue item for this account. Continue?',
      );
      if (!proceed) {
        return;
      }
    }

    const limitInput = window.prompt(`How many tweets should be backfilled for this account?`, '15');
    if (limitInput === null) {
      return;
    }

    const limit = Number.parseInt(limitInput, 10);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 15;

    try {
      if (mode === 'reset') {
        await axios.delete(`/api/mappings/${mappingId}/cache`, { headers: authHeaders });
      }

      await axios.post(`/api/backfill/${mappingId}`, { limit: safeLimit }, { headers: authHeaders });
      showNotice('success', mode === 'reset' ? 'Cache reset and backfill queued.' : 'Backfill queued.');
      await fetchStatus();
    } catch (error) {
      handleAuthFailure(error, 'Failed to queue backfill.');
    }
  };

  const handleDeleteAllPosts = async (mappingId: string) => {
    if (!authHeaders) {
      return;
    }

    const firstConfirm = window.confirm(
      'Danger: this deletes all posts on the mapped Bluesky account and clears local cache. Continue?',
    );

    if (!firstConfirm) {
      return;
    }

    const finalConfirm = window.prompt('Type DELETE to confirm:');
    if (finalConfirm !== 'DELETE') {
      return;
    }

    try {
      const response = await axios.post<{ message: string }>(
        `/api/mappings/${mappingId}/delete-all-posts`,
        {},
        { headers: authHeaders },
      );
      showNotice('success', response.data.message);
    } catch (error) {
      handleAuthFailure(error, 'Failed to delete posts.');
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!authHeaders) {
      return;
    }

    const confirmed = window.confirm('Delete this mapping?');
    if (!confirmed) {
      return;
    }

    try {
      await axios.delete(`/api/mappings/${mappingId}`, { headers: authHeaders });
      setMappings((prev) => prev.filter((mapping) => mapping.id !== mappingId));
      showNotice('success', 'Mapping deleted.');
      await fetchData();
    } catch (error) {
      handleAuthFailure(error, 'Failed to delete mapping.');
    }
  };

  const handleAddMapping = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaders) {
      return;
    }

    setIsBusy(true);

    try {
      await axios.post(
        '/api/mappings',
        {
          owner: newMapping.owner.trim(),
          twitterUsernames: newMapping.twitterUsernames,
          bskyIdentifier: newMapping.bskyIdentifier.trim(),
          bskyPassword: newMapping.bskyPassword,
          bskyServiceUrl: newMapping.bskyServiceUrl.trim(),
        },
        { headers: authHeaders },
      );

      setNewMapping(defaultMappingForm());
      showNotice('success', 'Account mapping added.');
      await fetchData();
    } catch (error) {
      handleAuthFailure(error, 'Failed to add account mapping.');
    } finally {
      setIsBusy(false);
    }
  };

  const startEditMapping = (mapping: AccountMapping) => {
    setEditingMapping(mapping);
    setEditForm({
      owner: mapping.owner || '',
      twitterUsernames: mapping.twitterUsernames.join(', '),
      bskyIdentifier: mapping.bskyIdentifier,
      bskyPassword: '',
      bskyServiceUrl: mapping.bskyServiceUrl || 'https://bsky.social',
    });
  };

  const handleUpdateMapping = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaders || !editingMapping) {
      return;
    }

    setIsBusy(true);

    try {
      await axios.put(
        `/api/mappings/${editingMapping.id}`,
        {
          owner: editForm.owner.trim(),
          twitterUsernames: editForm.twitterUsernames,
          bskyIdentifier: editForm.bskyIdentifier.trim(),
          bskyPassword: editForm.bskyPassword,
          bskyServiceUrl: editForm.bskyServiceUrl.trim(),
        },
        { headers: authHeaders },
      );

      setEditingMapping(null);
      setEditForm(defaultMappingForm());
      showNotice('success', 'Mapping updated.');
      await fetchData();
    } catch (error) {
      handleAuthFailure(error, 'Failed to update mapping.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveTwitterConfig = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaders) {
      return;
    }

    setIsBusy(true);

    try {
      await axios.post(
        '/api/twitter-config',
        {
          authToken: twitterConfig.authToken,
          ct0: twitterConfig.ct0,
          backupAuthToken: twitterConfig.backupAuthToken,
          backupCt0: twitterConfig.backupCt0,
        },
        { headers: authHeaders },
      );
      showNotice('success', 'Twitter credentials saved.');
      await fetchData();
    } catch (error) {
      handleAuthFailure(error, 'Failed to save Twitter credentials.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveAiConfig = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaders) {
      return;
    }

    setIsBusy(true);

    try {
      await axios.post(
        '/api/ai-config',
        {
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
        },
        { headers: authHeaders },
      );
      showNotice('success', 'AI settings saved.');
      await fetchData();
    } catch (error) {
      handleAuthFailure(error, 'Failed to save AI settings.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportConfig = async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await axios.get<Blob>('/api/config/export', {
        headers: authHeaders,
        responseType: 'blob',
      });

      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `tweets-2-bsky-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      showNotice('success', 'Configuration exported.');
    } catch (error) {
      handleAuthFailure(error, 'Failed to export configuration.');
    }
  };

  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!authHeaders) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      'This will overwrite accounts/settings (except user logins). Continue with import?',
    );

    if (!confirmed) {
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      await axios.post('/api/config/import', json, { headers: authHeaders });
      showNotice('success', 'Configuration imported.');
      await fetchData();
    } catch (error) {
      handleAuthFailure(error, 'Failed to import configuration.');
    } finally {
      event.target.value = '';
    }
  };

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md animate-slide-up border-border/80 bg-card/95">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Tweets-2-Bsky</CardTitle>
            <CardDescription>
              {authView === 'login'
                ? 'Sign in to manage mappings, status, and account settings.'
                : 'Create your first dashboard account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authError ? (
              <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500 dark:text-red-300">
                {authError}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={authView === 'login' ? handleLogin : handleRegister}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>

              <Button className="w-full" type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {authView === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <Button
              className="mt-4 w-full"
              variant="ghost"
              onClick={() => {
                setAuthError('');
                setAuthView(authView === 'login' ? 'register' : 'login');
              }}
              type="button"
            >
              {authView === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 animate-slide-up">
        <Card className="border-border/80 bg-card/90">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Dashboard</p>
              <h1 className="text-xl font-semibold sm:text-2xl">Tweets-2-Bsky Control Panel</h1>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                Next run in <span className="font-mono text-foreground">{countdown}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={cycleThemeMode} title={themeLabel}>
                {themeIcon}
                <span className="ml-2 hidden sm:inline">{themeLabel}</span>
              </Button>
              <Button size="sm" onClick={runNow}>
                <Play className="mr-2 h-4 w-4" />
                Run now
              </Button>
              {isAdmin && pendingBackfills.length > 0 ? (
                <Button size="sm" variant="destructive" onClick={clearAllBackfills}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear queue
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {notice ? (
        <div
          className={cn(
            'mb-5 animate-fade-in rounded-md border px-4 py-2 text-sm',
            notice.tone === 'success' &&
              'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300',
            notice.tone === 'error' &&
              'border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/30 dark:text-red-300',
            notice.tone === 'info' &&
              'border-border bg-muted text-muted-foreground',
          )}
        >
          {notice.message}
        </div>
      ) : null}

      {currentStatus && currentStatus.state !== 'idle' ? (
        <Card className="mb-6 animate-fade-in border-border/80">
          <div className="h-1 overflow-hidden rounded-t-xl bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-300',
                currentStatus.state === 'backfilling' ? 'bg-amber-500' : 'bg-emerald-500',
              )}
              style={{ width: `${progressPercent || 100}%` }}
            />
          </div>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{formatState(currentStatus.state)} in progress</p>
              <p className="text-sm text-muted-foreground">
                {currentStatus.currentAccount ? `@${currentStatus.currentAccount} • ` : ''}
                {currentStatus.message || 'Working through account queue.'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{progressPercent || 0}%</p>
              <p className="text-xs text-muted-foreground">
                {(currentStatus.processedCount || 0).toLocaleString()} / {(currentStatus.totalCount || 0).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="panel-grid">
        <section className="space-y-6">
          <Card className="animate-slide-up">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Active Accounts</CardTitle>
                  <CardDescription>Manage source-to-target mappings and run account actions.</CardDescription>
                </div>
                <Badge variant="outline">{mappings.length} configured</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {mappings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  No mappings yet. Add one from the settings panel.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-3">Owner</th>
                        <th className="px-2 py-3">Twitter Sources</th>
                        <th className="px-2 py-3">Bluesky Target</th>
                        <th className="px-2 py-3">Status</th>
                        <th className="px-2 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((mapping) => {
                        const queued = isBackfillQueued(mapping.id);
                        const active = isBackfillActive(mapping.id);
                        const queuePosition = getBackfillEntry(mapping.id)?.position;

                        return (
                          <tr key={mapping.id} className="border-b border-border/60 last:border-0">
                            <td className="px-2 py-3 align-top">
                              <div className="flex items-center gap-2 font-medium">
                                <UserRound className="h-4 w-4 text-muted-foreground" />
                                {mapping.owner || 'System'}
                              </div>
                            </td>
                            <td className="px-2 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                {mapping.twitterUsernames.map((username) => (
                                  <Badge key={username} variant="secondary">
                                    @{username}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-3 align-top">
                              <span className="font-mono text-xs sm:text-sm">{mapping.bskyIdentifier}</span>
                            </td>
                            <td className="px-2 py-3 align-top">
                              {active ? (
                                <Badge variant="warning">Backfilling</Badge>
                              ) : queued ? (
                                <Badge variant="warning">Queued {queuePosition ? `#${queuePosition}` : ''}</Badge>
                              ) : (
                                <Badge variant="success">Active</Badge>
                              )}
                            </td>
                            <td className="px-2 py-3 align-top">
                              <div className="flex flex-wrap justify-end gap-1">
                                {isAdmin ? (
                                  <>
                                    <Button variant="outline" size="sm" onClick={() => startEditMapping(mapping)}>
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        void requestBackfill(mapping.id, 'normal');
                                      }}
                                    >
                                      Backfill
                                    </Button>
                                    <Button
                                      variant="subtle"
                                      size="sm"
                                      onClick={() => {
                                        void requestBackfill(mapping.id, 'reset');
                                      }}
                                    >
                                      Reset + Backfill
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        void handleDeleteAllPosts(mapping.id);
                                      }}
                                    >
                                      Delete Posts
                                    </Button>
                                  </>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    void handleDeleteMapping(mapping.id);
                                  }}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="animate-slide-up">
            <CardHeader className="pb-3">
              <CardTitle>Already Posted</CardTitle>
              <CardDescription>Native-styled feed of successfully posted Bluesky entries.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {postedActivity.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  No posted entries yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {postedActivity.map((activity, index) => {
                    const postUrl = getBskyPostUrl(activity);
                    return (
                      <article
                        key={`${activity.twitter_id}-${activity.created_at || index}-posted`}
                        className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">@{activity.bsky_identifier}</p>
                            <p className="text-xs text-muted-foreground">from @{activity.twitter_username}</p>
                          </div>
                          <Badge variant="success">Posted</Badge>
                        </div>
                        <p className="mb-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                          {activity.tweet_text || `(No cached text) Tweet ID ${activity.twitter_id}`}
                        </p>
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{activity.created_at ? new Date(activity.created_at).toLocaleString() : 'Unknown time'}</span>
                          {postUrl ? (
                            <a
                              className="inline-flex items-center text-foreground underline-offset-4 hover:underline"
                              href={postUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                              <ArrowUpRight className="ml-1 h-3 w-3" />
                            </a>
                          ) : (
                            <span>Missing URI</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="animate-slide-up">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest migration outcomes from the processing database.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-3">Time</th>
                      <th className="px-2 py-3">Twitter User</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Details</th>
                      <th className="px-2 py-3 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((activity, index) => {
                      const href = getBskyPostUrl(activity);

                      return (
                        <tr
                          key={`${activity.twitter_id}-${activity.created_at || index}`}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="px-2 py-3 align-top text-xs text-muted-foreground">
                            {activity.created_at ? new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </td>
                          <td className="px-2 py-3 align-top font-medium">@{activity.twitter_username}</td>
                          <td className="px-2 py-3 align-top">
                            {activity.status === 'migrated' ? (
                              <Badge variant="success">Migrated</Badge>
                            ) : activity.status === 'skipped' ? (
                              <Badge variant="outline">Skipped</Badge>
                            ) : (
                              <Badge variant="danger">Failed</Badge>
                            )}
                          </td>
                          <td className="px-2 py-3 align-top text-xs text-muted-foreground">
                            <div className="max-w-[340px] truncate">{activity.tweet_text || `Tweet ID: ${activity.twitter_id}`}</div>
                          </td>
                          <td className="px-2 py-3 align-top text-right">
                            {href ? (
                              <a className="inline-flex items-center text-xs text-foreground underline-offset-4 hover:underline" href={href} target="_blank" rel="noreferrer">
                                Open
                                <ArrowUpRight className="ml-1 h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {recentActivity.length === 0 ? (
                      <tr>
                        <td className="px-2 py-6 text-center text-sm text-muted-foreground" colSpan={5}>
                          No activity yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {isAdmin ? (
          <aside className="space-y-6">
            <Card className="animate-slide-up">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Admin Settings
                </CardTitle>
                <CardDescription>Credentials, provider setup, and account onboarding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <form className="space-y-3" onSubmit={handleSaveTwitterConfig}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Twitter Credentials</h3>
                    <Badge variant={twitterConfig.authToken && twitterConfig.ct0 ? 'success' : 'outline'}>
                      {twitterConfig.authToken && twitterConfig.ct0 ? 'Configured' : 'Missing'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authToken">Primary Auth Token</Label>
                    <Input
                      id="authToken"
                      value={twitterConfig.authToken}
                      onChange={(event) => {
                        setTwitterConfig((prev) => ({ ...prev, authToken: event.target.value }));
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ct0">Primary CT0</Label>
                    <Input
                      id="ct0"
                      value={twitterConfig.ct0}
                      onChange={(event) => {
                        setTwitterConfig((prev) => ({ ...prev, ct0: event.target.value }));
                      }}
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="backupAuthToken">Backup Auth Token</Label>
                      <Input
                        id="backupAuthToken"
                        value={twitterConfig.backupAuthToken || ''}
                        onChange={(event) => {
                          setTwitterConfig((prev) => ({ ...prev, backupAuthToken: event.target.value }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="backupCt0">Backup CT0</Label>
                      <Input
                        id="backupCt0"
                        value={twitterConfig.backupCt0 || ''}
                        onChange={(event) => {
                          setTwitterConfig((prev) => ({ ...prev, backupCt0: event.target.value }));
                        }}
                      />
                    </div>
                  </div>

                  <Button className="w-full" size="sm" type="submit" disabled={isBusy}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Twitter Credentials
                  </Button>
                </form>

                <form className="space-y-3 border-t border-border pt-6" onSubmit={handleSaveAiConfig}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">AI Settings</h3>
                    <Badge variant={aiConfig.apiKey ? 'success' : 'outline'}>{aiConfig.apiKey ? 'Configured' : 'Optional'}</Badge>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <select
                      className={selectClassName}
                      id="provider"
                      value={aiConfig.provider}
                      onChange={(event) => {
                        setAiConfig((prev) => ({ ...prev, provider: event.target.value as AIConfig['provider'] }));
                      }}
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI / OpenRouter</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={aiConfig.apiKey || ''}
                      onChange={(event) => {
                        setAiConfig((prev) => ({ ...prev, apiKey: event.target.value }));
                      }}
                    />
                  </div>
                  {aiConfig.provider !== 'gemini' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="model">Model ID</Label>
                        <Input
                          id="model"
                          value={aiConfig.model || ''}
                          onChange={(event) => {
                            setAiConfig((prev) => ({ ...prev, model: event.target.value }));
                          }}
                          placeholder="gpt-4o"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="baseUrl">Base URL</Label>
                        <Input
                          id="baseUrl"
                          value={aiConfig.baseUrl || ''}
                          onChange={(event) => {
                            setAiConfig((prev) => ({ ...prev, baseUrl: event.target.value }));
                          }}
                          placeholder="https://api.example.com/v1"
                        />
                      </div>
                    </>
                  ) : null}

                  <Button className="w-full" size="sm" type="submit" disabled={isBusy}>
                    <Bot className="mr-2 h-4 w-4" />
                    Save AI Settings
                  </Button>
                </form>

                <form className="space-y-3 border-t border-border pt-6" onSubmit={handleAddMapping}>
                  <h3 className="text-sm font-semibold">Add Account Mapping</h3>
                  <div className="space-y-2">
                    <Label htmlFor="owner">Owner</Label>
                    <Input
                      id="owner"
                      value={newMapping.owner}
                      onChange={(event) => {
                        setNewMapping((prev) => ({ ...prev, owner: event.target.value }));
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitterUsernames">Twitter Usernames (comma separated)</Label>
                    <Input
                      id="twitterUsernames"
                      value={newMapping.twitterUsernames}
                      onChange={(event) => {
                        setNewMapping((prev) => ({ ...prev, twitterUsernames: event.target.value }));
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bskyIdentifier">Bluesky Identifier</Label>
                    <Input
                      id="bskyIdentifier"
                      value={newMapping.bskyIdentifier}
                      onChange={(event) => {
                        setNewMapping((prev) => ({ ...prev, bskyIdentifier: event.target.value }));
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bskyPassword">Bluesky App Password</Label>
                    <Input
                      id="bskyPassword"
                      type="password"
                      value={newMapping.bskyPassword}
                      onChange={(event) => {
                        setNewMapping((prev) => ({ ...prev, bskyPassword: event.target.value }));
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bskyServiceUrl">Bluesky Service URL</Label>
                    <Input
                      id="bskyServiceUrl"
                      value={newMapping.bskyServiceUrl}
                      onChange={(event) => {
                        setNewMapping((prev) => ({ ...prev, bskyServiceUrl: event.target.value }));
                      }}
                      placeholder="https://bsky.social"
                    />
                  </div>

                  <Button className="w-full" size="sm" type="submit" disabled={isBusy}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Mapping
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="animate-slide-up">
              <CardHeader>
                <CardTitle>Data Management</CardTitle>
                <CardDescription>Export/import account and provider config without login credentials.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" variant="outline" onClick={handleExportConfig}>
                  <Download className="mr-2 h-4 w-4" />
                  Export configuration
                </Button>
                <input
                  ref={importInputRef}
                  className="hidden"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    void handleImportConfig(event);
                  }}
                />
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    importInputRef.current?.click();
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import configuration
                </Button>
                <p className="text-xs text-muted-foreground">
                  Imports preserve dashboard users and passwords while replacing mappings, provider keys, and scheduler settings.
                </p>
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>

      {editingMapping ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl animate-slide-up border-border/90 bg-card">
            <CardHeader>
              <CardTitle>Edit Mapping</CardTitle>
              <CardDescription>Update ownership, handles, and target credentials.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleUpdateMapping}>
                <div className="space-y-2">
                  <Label htmlFor="edit-owner">Owner</Label>
                  <Input
                    id="edit-owner"
                    value={editForm.owner}
                    onChange={(event) => {
                      setEditForm((prev) => ({ ...prev, owner: event.target.value }));
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-twitterUsernames">Twitter Usernames</Label>
                  <Input
                    id="edit-twitterUsernames"
                    value={editForm.twitterUsernames}
                    onChange={(event) => {
                      setEditForm((prev) => ({ ...prev, twitterUsernames: event.target.value }));
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-bskyIdentifier">Bluesky Identifier</Label>
                  <Input
                    id="edit-bskyIdentifier"
                    value={editForm.bskyIdentifier}
                    onChange={(event) => {
                      setEditForm((prev) => ({ ...prev, bskyIdentifier: event.target.value }));
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-bskyPassword">New App Password (optional)</Label>
                  <Input
                    id="edit-bskyPassword"
                    type="password"
                    value={editForm.bskyPassword}
                    onChange={(event) => {
                      setEditForm((prev) => ({ ...prev, bskyPassword: event.target.value }));
                    }}
                    placeholder="Leave blank to keep existing"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-bskyServiceUrl">Service URL</Label>
                  <Input
                    id="edit-bskyServiceUrl"
                    value={editForm.bskyServiceUrl}
                    onChange={(event) => {
                      setEditForm((prev) => ({ ...prev, bskyServiceUrl: event.target.value }));
                    }}
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setEditingMapping(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isBusy}>
                    {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!isAdmin ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <p className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Admin-only settings are hidden for this account.
          </p>
        </div>
      ) : null}
    </main>
  );
}

export default App;
