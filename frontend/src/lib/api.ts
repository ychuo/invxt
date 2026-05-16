import type { AnalysisState, GraphData } from "@/types";

const API_BASE = "http://localhost:8000/api";

export async function submitAnalysis(
  topic: string,
  market: string
): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, market }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getAnalysis(taskId: string): Promise<AnalysisState> {
  const res = await fetch(`${API_BASE}/theme/${taskId}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getAnalysisByTopic(
  topic: string,
  market: string
): Promise<AnalysisState | null> {
  const res = await fetch(
    `${API_BASE}/theme/by-name/${encodeURIComponent(topic)}?market=${market}`
  );
  if (!res.ok) return null;
  return res.json();
}

export async function getGraph(themeName: string): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/graph/${encodeURIComponent(themeName)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function searchEntities(
  q: string
): Promise<{ query: string; results: unknown[] }> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
