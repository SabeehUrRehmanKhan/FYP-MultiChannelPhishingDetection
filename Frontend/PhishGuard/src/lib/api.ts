// ─── API Base ────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(token), ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  me: (token: string) => apiRequest<UserProfileResponse>('/auth/me', {}, token),
};

// ─── History ─────────────────────────────────────────────────────────────────
export const historyApi = {
  list: (token: string, page = 1, limit = 20) =>
    apiRequest<HistoryListResponse>(`/history?page=${page}&limit=${limit}`, {}, token),
  detail: (token: string, id: string) =>
    apiRequest<AnalysisDetail>(`/history/${id}`, {}, token),
};

// ─── Sessions ────────────────────────────────────────────────────────────────
export const sessionsApi = {
  list: (token: string) =>
    apiRequest<SessionsResponse>('/sessions', {}, token),
};

// ─── Feedback ────────────────────────────────────────────────────────────────
export const feedbackApi = {
  submit: (token: string, payload: FeedbackPayload) =>
    apiRequest('/feedback', { method: 'POST', body: JSON.stringify(payload) }, token),
  list: (token: string, status = 'pending') =>
    apiRequest<FeedbackListResponse>(`/feedback?status=${status}`, {}, token),
  approve: (token: string, id: string, override_label?: string) =>
    apiRequest(`/feedback/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ override_label }) }, token),
  reject: (token: string, id: string, reason?: string) =>
    apiRequest(`/feedback/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) }, token),
};

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminApi = {
  stats: (token: string) =>
    apiRequest<AdminStats>('/admin/stats', {}, token),
  threatIndicators: (token: string, type?: string, verified?: boolean) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (verified !== undefined) params.set('verified', String(verified));
    return apiRequest<ThreatIndicatorsResponse>(`/admin/threat-indicators?${params}`, {}, token);
  },
  verifyThreat: (token: string, id: string, verified: boolean) =>
    apiRequest(`/admin/threat-indicators/${id}/verify`, { method: 'PATCH', body: JSON.stringify({ verified }) }, token),
  dataset: async (token: string, page = 1, limit = 20) => {
    const res = await apiRequest<any>(`/admin/dataset/?page=${page}&limit=${limit}`, {}, token);
    return { items: res.data || [], total: res.stats?.total || 0 } as DatasetResponse;
  },
  exportDataset: (token: string) => `${API_BASE}/admin/dataset/export?format=csv&token=${token}`,
  updateUserRole: (token: string, userId: string, role: string) =>
    apiRequest(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }, token),
};

// ─── Simulations ─────────────────────────────────────────────────────────────
export const simulationsApi = {
  list: async (token: string, difficulty?: string, type?: string): Promise<SimulationsResponse> => {
    const params = new URLSearchParams();
    if (difficulty) params.set('difficulty', difficulty);
    if (type) params.set('type', type);
    const raw = await apiRequest<Record<string, unknown>>(`/simulations?${params}`, {}, token);
    // Backend returns { simulations: [] }, frontend expects { items: [] }
    const items = (raw.items ?? raw.simulations ?? []) as Simulation[];
    return { items };
  },
  detail: (token: string, id: string) =>
    apiRequest<Simulation>(`/simulations/${id}`, {}, token),
  complete: (token: string, id: string, answer: string, time_taken: number) =>
    apiRequest(`/simulations/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ answer, time_taken_seconds: time_taken }),
    }, token),
  activities: async (token: string, difficulty?: string): Promise<ActivitiesResponse> => {
    const params = new URLSearchParams();
    if (difficulty) params.set('difficulty', difficulty);
    const raw = await apiRequest<Record<string, unknown>>(`/simulations/activities/list?${params}`, {}, token);
    const items = (raw.items ?? raw.activities ?? []) as Activity[];
    return { items };
  },
  submitActivity: (token: string, id: string, answers: unknown) =>
    apiRequest(`/simulations/activities/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }, token),
  progress: (token: string) =>
    apiRequest<{ progress: unknown[] }>('/simulations/progress/me', {}, token),
};

// ─── Types ───────────────────────────────────────────────────────────────────
export interface UserProfileResponse {
  id: string; email: string; display_name: string | null; role: string;
}
export type Verdict = 'phishing' | 'legitimate' | 'suspicious' | 'unknown';

export interface Analysis {
  id: string;
  input_type: string;
  raw_input: string;
  final_verdict: Verdict;
  confidence: number;
  channels_run: string[];
  created_at: string;
}
export interface AnalysisDetail extends Analysis {
  features: ChannelFeature[];
}
export interface ChannelFeature {
  channel: string; score: number; features: Record<string, unknown>; model_ver: string;
}
export interface HistoryListResponse { items: Analysis[]; total: number; page: number; }
export interface SessionsResponse {
  items: { id: string; created_at: string; last_seen: string; analysis_count: number; metadata: Record<string, unknown>; }[];
}
export interface FeedbackPayload { analysis_id: string; verdict: string; notes?: string; }
export interface FeedbackItem {
  id: string; analysis_id: string; user_verdict: string; notes: string;
  status: string; created_at: string; submitted_by: string;
}
export interface FeedbackListResponse { items: FeedbackItem[]; }
export interface AdminStats {
  analyses_today: number; total_analyses: number; phishing_count: number;
  legitimate_count: number; suspicious_count: number; campaign_count: number;
  accuracy: number; analyses_per_day: { date: string; count: number }[];
}
export interface ThreatIndicator {
  id: string; indicator_type: string; value: string; threat_score: number;
  report_count: number; source: string; verified: boolean;
  first_seen: string; last_seen: string;
}
export interface ThreatIndicatorsResponse { items: ThreatIndicator[]; }
export interface DatasetItem {
  id: string; input_type: string; raw_input: string; true_label: string; approved_at: string;
}
export interface DatasetResponse { items: DatasetItem[]; total: number; }
export interface Simulation {
  id: string; title: string; sim_type: string; difficulty: string;
  content: Record<string, unknown>; hints: string[]; active: boolean;
}
export interface SimulationsResponse { items: Simulation[]; }
export interface Activity {
  id: string; title: string; activity_type: string; difficulty: string; questions: unknown[];
}
export interface ActivitiesResponse { items: Activity[]; }
