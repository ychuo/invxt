"use client";
import { useState, useRef, useCallback } from "react";

export type ThinkingEntry =
  | { type: "meta"; task_id: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "conclusion"; block: string; content: string }
  | { type: "correction"; block: string; reason: string }
  | { type: "done" };

interface AnalysisState {
  thinking: ThinkingEntry[];
  blocks: Record<string, unknown>;
  status: "idle" | "streaming" | "done" | "error";
  error: string | null;
  taskId: string | null;
}

const API_BASE = "http://localhost:8000/api";

export function useAnalysisStream() {
  const [state, setState] = useState<AnalysisState>({
    thinking: [],
    blocks: {},
    status: "idle",
    error: null,
    taskId: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (topic: string, market: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ thinking: [], blocks: {}, status: "streaming", error: null, taskId: null });

    try {
      const response = await fetch(`${API_BASE}/analyze/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, market }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const entry: ThinkingEntry = JSON.parse(line.slice(6));
            setState((prev) => {
              const next = { ...prev, thinking: [...prev.thinking, entry] };
              if (entry.type === "meta") {
                next.taskId = entry.task_id;
              }
              if (entry.type === "conclusion") {
                try {
                  const content = JSON.parse(entry.content);
                  next.blocks = { ...next.blocks, [entry.block]: content };
                } catch {}
              }
              if (entry.type === "done") {
                next.status = "done";
              }
              return next;
            });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof TypeError ? `网络连接中断: ${(err as Error).message}` : String(err);
        setState((prev) => ({ ...prev, status: "error", error: msg }));
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const loadFromCache = useCallback(async (taskId: string) => {
    setState((prev) => ({ ...prev, status: "streaming" }));
    try {
      const res = await fetch(`${API_BASE}/theme/${taskId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === "completed") {
        const blocks: Record<string, unknown> = {};
        if (data.theme) blocks.theme = data.theme;
        if (data.chain?.length) blocks.chain = data.chain;
        if (data.companies?.length) blocks.companies = data.companies;
        if (data.scored?.length) blocks.logic = data.scored;
        setState((prev) => ({
          ...prev,
          blocks,
          status: "done",
          taskId: taskId,
        }));
      }
    } catch (err) {
      setState((prev) => ({ ...prev, status: "error", error: String(err) }));
    }
  }, []);

  return { ...state, start, cancel, loadFromCache };
}
