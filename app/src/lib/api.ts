const base = "/api";

async function request<T>(path: string, init?: RequestInit & { timeout?: number }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeout || 12000);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { accept: "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export interface Health {
  ok: boolean;
  app: string;
  dataVersion: string;
  generatedAt: string | null;
  counts: Record<string, number>;
  lastCheck: null | { checkedAt: string; changed: number; failed: number; checked: number };
  ai: boolean;
  kv: boolean;
  d1: boolean;
  now: string;
}

export interface StatusResponse {
  ok: boolean;
  dataVersion: string | null;
  generatedAt: string | null;
  counts: Record<string, number>;
  lastCheck: null | { checkedAt: string; checked: number; changed: number; failed: number; dispatch?: unknown };
  sources: { source: string; last_changed_at: string | null; last_checked_at: string | null; last_ok: number; last_error: string | null }[];
  builds: { started_at: string; source: string; dispatched: number; status: string; detail: string }[];
  d1: boolean;
}

export interface CommunityNotice {
  id: number;
  title: string;
  body: string;
  url: string;
  branch: string;
  semester: string;
  contributor: string;
  status: "pending" | "approved" | "rejected" | "expired";
  created_at: string;
  reviewed_at: string | null;
}

export const api = {
  health: () => request<Health>("/health", { timeout: 6000 }),
  status: () => request<StatusResponse>("/status", { timeout: 8000 }),
  community: () => request<{ ok: boolean; items: CommunityNotice[] }>("/community", { timeout: 8000 }),
  submit: (body: { title: string; body: string; url?: string; branch?: string; semester?: string; contributor?: string }) =>
    request<{ ok: boolean; id?: number; error?: string }>("/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeout: 12000,
    }),
  ai: (body: { question: string; context: string }) =>
    request<{ answer: string; provider: string; grounded: boolean }>("/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeout: 30000,
    }),
  refreshSources: (token: string) =>
    request<{ ok: boolean; checked: number; changed: number; failed: number }>("/refresh", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      timeout: 45000,
    }),
  adminOverview: (token: string) =>
    request<{
      ok: boolean;
      counts: Record<string, number>;
      dataVersion: string;
      sources: StatusResponse["sources"];
      builds: StatusResponse["builds"];
      submissions: CommunityNotice[];
      audit: { id: number; actor: string; action: string; target: string; detail: string; created_at: string }[];
      config: Record<string, string>;
      health: Health;
    }>("/admin/overview", { headers: { authorization: `Bearer ${token}` }, timeout: 12000 }),
  adminReview: (token: string, id: number, status: "approved" | "rejected" | "expired") =>
    request<{ ok: boolean }>(`/admin/submissions/${id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status }),
      timeout: 12000,
    }),
  adminConfig: (token: string, config: Record<string, string>) =>
    request<{ ok: boolean }>("/admin/config", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ config }),
      timeout: 12000,
    }),
  adminTestAi: (token: string, question: string, context: string) =>
    request<{ answer: string }>("/admin/ai-test", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ question, context }),
      timeout: 30000,
    }),
};
