import type { AnalysisState, GraphData } from "@/types";

const API_BASE = "http://localhost:8000/api";

// In-flight request dedup: concurrent calls to same URL reuse the same promise
const _inflight = new Map<string, Promise<any>>();

function dedupedFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const key = `${init?.method || "GET"}:${url}`;
  const existing = _inflight.get(key);
  if (existing) return existing;
  const p = fetch(url, init).then(async (res) => {
    _inflight.delete(key);
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as T;
  });
  _inflight.set(key, p);
  return p;
}

export async function submitAnalysis(topic: string, market: string): Promise<{ task_id: string }> {
  return dedupedFetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, market }),
  });
}

export async function getAnalysis(taskId: string): Promise<AnalysisState> {
  return dedupedFetch(`${API_BASE}/theme/${taskId}`);
}

export async function getAnalysisByTopic(topic: string, market: string): Promise<AnalysisState | null> {
  try {
    return await dedupedFetch(`${API_BASE}/theme/by-name/${encodeURIComponent(topic)}?market=${market}`);
  } catch {
    return null;
  }
}

export async function getGraph(themeName: string): Promise<GraphData> {
  return dedupedFetch(`${API_BASE}/graph/${encodeURIComponent(themeName)}`);
}

export async function searchEntities(q: string): Promise<{ query: string; results: unknown[] }> {
  return dedupedFetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
}
