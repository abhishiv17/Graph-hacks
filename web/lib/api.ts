import type { Api } from "./data/types";
export type { Ran } from "./data/types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, public detail: string, public path: string) {
    super(`${status} on ${path}: ${detail}`);
  }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store", ...init, signal: ctl.signal });
    if (!r.ok) {
      let detail = await r.text();
      try { detail = JSON.parse(detail).detail ?? detail; } catch { /* plain text */ }
      throw new ApiError(r.status, String(detail), path);
    }
    return r.json();
  } finally {
    clearTimeout(t);
  }
}

export const get = <T = any>(path: string) => call<T>(path);
export const post = <T = any>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }, 120000);

export async function apiReachable(timeoutMs = 2500): Promise<boolean> {
  try { await call("/api/health", undefined, timeoutMs); return true; } catch { return false; }
}

export function createLiveApi(): Api {
  return {
    pool: () => get("/api/pool"),
    loop: (id) => get(`/api/loops/${encodeURIComponent(id)}`),
    committee: () => get("/api/committee"),
    family: (pid, lang) => get(`/api/family/${encodeURIComponent(pid)}?lang=${lang}`),
    events: (since = 0) => get(`/api/events?since=${since}`),
    queries: () => get("/api/queries"),
    sim: () => get("/api/sim"),
    concurrency: () => get("/api/concurrency"),
    explore: (pair, hops) => get(`/api/families/${encodeURIComponent(pair)}/explore?hops=${hops}`),
    graphOverview: () => get("/api/graph/overview"),
    hospital: (code) => get(`/api/hospital/${encodeURIComponent(code)}`),
    reset: () => post("/api/demo/reset"),
    addChennai: () => post("/api/demo/add-chennai"),
    runPlan: () => post("/api/plan/run"),
    runLab: (id) => post(`/api/loops/${encodeURIComponent(id)}/lab`),
    chase: (id) => post(`/api/loops/${encodeURIComponent(id)}/chase`),
    approve: (task, choice) => post(`/api/tasks/${encodeURIComponent(task)}/approve`, { choice }),
    decline: (task, reason) => post(`/api/tasks/${encodeURIComponent(task)}/decline`, { reason }),
    agents: () => get("/api/agents"),
    sweep: () => post("/api/agents/sweep"),
    me: () => get("/api/me"),
    programs: () => get("/api/programs"),
    pairs: (organ) => get(`/api/pairs${organ ? `?organ=${organ}` : ""}`),
    integrity: (organ) => get(`/api/integrity${organ ? `?organ=${organ}` : ""}`),
    simulations: () => get("/api/simulations"),
    audit: (organ) => get(`/api/audit${organ ? `?organ=${organ}` : ""}`),
    askStatus: () => get("/api/ask/status"),
    askHistory: () => get("/api/ask/history"),
    ask: (question, history) => post("/api/ask", { question, history }),
    personas: () => get("/api/personas"),
    persona: (id) => get(`/api/personas/${encodeURIComponent(id)}`),
    personaSession: (id) => post(`/api/personas/${encodeURIComponent(id)}/session`),
    personaAdvance: (id) => post(`/api/personas/${encodeURIComponent(id)}/advance`),
    personaReset: (id) => post(`/api/personas/${encodeURIComponent(id)}/reset`),
    personaChat: (id, message) => post(`/api/personas/${encodeURIComponent(id)}/chat`, { message }),
  };
}
