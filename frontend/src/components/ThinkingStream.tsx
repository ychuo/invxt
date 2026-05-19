"use client";
import { useMemo, useEffect, useRef } from "react";
import type { ThinkingEntry } from "@/hooks/useAnalysisStream";

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍",
  get_fundamentals: "📈",
  get_market_signals: "📊",
  query_knowledge_graph: "🕸️",
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "搜索",
  get_fundamentals: "获取基本面",
  get_market_signals: "获取行情信号",
  query_knowledge_graph: "查询知识图谱",
};

const BLOCK_CONCLUSION_LABELS: Record<string, string> = {
  theme: "主题定义",
  chain: "产业链拆解",
  companies: "公司映射",
  logic: "投资逻辑",
};

type RenderItem =
  | { type: "thinking"; text: string; key: string }
  | { type: "tool"; name: string; args?: Record<string, unknown>; result?: string; key: string }
  | { type: "conclusion"; block: string; key: string }
  | { type: "correction"; block: string; reason: string; key: string }
  | { type: "error"; message: string; key: string };

function pairEntries(entries: ThinkingEntry[]): RenderItem[] {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    if (entry.type === "meta") { i++; continue; }
    if (entry.type === "done") { i++; continue; }

    if (entry.type === "tool_call") {
      const name = entry.name;
      if (name !== "emit_conclusion" && name !== "emit_correction") {
        // Check if next entry is the matching tool_result
        const next = entries[i + 1];
        if (next && next.type === "tool_result" && next.name === name) {
          items.push({ type: "tool", name, args: entry.args, result: next.result, key: `t-${i}` });
          i += 2;
        } else {
          items.push({ type: "tool", name, args: entry.args, key: `t-${i}` });
          i += 1;
        }
      } else {
        i += 1;
      }
    } else if (entry.type === "tool_result") {
      const name = entry.name;
      if (name !== "emit_conclusion" && name !== "emit_correction") {
        items.push({ type: "tool", name, result: entry.result, key: `t-${i}` });
      }
      i += 1;
    } else if (entry.type === "thinking") {
      items.push({ type: "thinking", text: entry.text, key: `th-${i}` });
      i += 1;
    } else if (entry.type === "conclusion") {
      items.push({ type: "conclusion", block: entry.block, key: `c-${i}` });
      i += 1;
    } else if (entry.type === "correction") {
      items.push({ type: "correction", block: entry.block, reason: entry.reason, key: `cr-${i}` });
      i += 1;
    } else if (entry.type === "error") {
      items.push({ type: "error", message: entry.message, key: `e-${i}` });
      i += 1;
    } else {
      i += 1;
    }
  }
  return items;
}

function formatSearchResults(raw: string): Array<{ title: string; url: string; snippet: string }> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.slice(0, 4).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: (r.content || "").slice(0, 150),
    }));
  } catch {
    return null;
  }
}

function formatSimpleResult(raw: string): string {
  // Trim long JSON/knowledge graph outputs
  if (raw.length <= 400) return raw;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "object" && obj !== null) {
      const parts: string[] = [];
      if (obj.name) parts.push(obj.name);
      if (obj.description) parts.push(obj.description.slice(0, 200));
      if (obj.category) parts.push(`分类: ${obj.category}`);
      return parts.join(" · ") || raw.slice(0, 400);
    }
  } catch {}
  return raw.slice(0, 400) + "...";
}

function ToolResultContent({ name, result }: { name: string; result?: string }) {
  if (!result) {
    return (
      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#0d9488", animation: "pulse 1.2s ease-in-out infinite" }} />
        执行中...
      </div>
    );
  }

  if (name === "web_search") {
    const results = formatSearchResults(result);
    if (results) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {results.map((r, j) => (
            <a key={j} href={r.url} target="_blank" rel="noopener noreferrer"
               style={{ display: "block", border: "1px solid #f0f0f0", borderRadius: 6, padding: "8px 10px", textDecoration: "none", cursor: "pointer" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0f766e", marginBottom: 2, lineHeight: 1.4 }}>{r.title}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{r.snippet}</div>
            </a>
          ))}
        </div>
      );
    }
  }

  return (
    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {formatSimpleResult(result)}
    </div>
  );
}

export default function ThinkingStream({ entries }: { entries: ThinkingEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => pairEntries(entries), [entries]);
  const isStreaming = entries.length > 0 && entries[entries.length - 1].type !== "done";
  const lastThinkingIdx = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].type === "thinking") return i;
    }
    return -1;
  }, [items]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  return (
    <div style={{
      fontFamily: "var(--font-serif)",
      fontSize: 13,
      lineHeight: 1.85,
      color: "#475569",
      padding: "20px 20px",
      height: "100%",
      overflowY: "auto",
    }}>
      {items.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 12 }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#0d9488", animation: "pulse 1.2s ease-in-out infinite" }} />
          开始分析...
        </div>
      )}

      {items.map((item, i) => {
        // --- Thinking ---
        if (item.type === "thinking") {
          const isLast = i === lastThinkingIdx && isStreaming;
          return (
            <div key={item.key} style={{
              marginBottom: 16,
              paddingLeft: 16,
              borderLeft: "2px solid #e5e7eb",
            }}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {item.text}
                {isLast && (
                  <span style={{
                    display: "inline-block",
                    width: 2, height: 15,
                    background: "#0d9488",
                    marginLeft: 2,
                    verticalAlign: "text-bottom",
                    animation: "blink 0.8s step-end infinite",
                  }} />
                )}
              </p>
            </div>
          );
        }

        // --- Tool card ---
        if (item.type === "tool") {
          const done = !!item.result;
          const label = item.name === "web_search"
            ? `${TOOL_LABELS[item.name] || item.name} "${(item.args as any)?.query || ""}"`
            : TOOL_LABELS[item.name] || item.name;

          return (
            <div key={item.key} style={{
              background: done ? "#fff" : "#fafdfc",
              border: done ? "1px solid #e5e7eb" : "1px solid #ccfbf1",
              borderRadius: 10,
              marginBottom: 16,
              overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px",
                borderBottom: done ? "1px solid #f0f0f0" : "none",
              }}>
                <span style={{ fontSize: 15 }}>{TOOL_ICONS[item.name] || "🔧"}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 100, fontWeight: 600,
                  background: done ? "#dcfce7" : "#fef3c7",
                  color: done ? "#166534" : "#92400e",
                  flexShrink: 0,
                }}>
                  {done ? "完成" : "执行中"}
                </span>
              </div>
              {/* Body */}
              <div style={{ padding: done ? "10px 14px 14px" : "8px 14px" }}>
                <ToolResultContent name={item.name} result={item.result} />
              </div>
            </div>
          );
        }

        // --- Conclusion ---
        if (item.type === "conclusion") {
          return (
            <div key={item.key} style={{
              background: "#f0fdfa",
              border: "1px solid #ccfbf1",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e", marginBottom: 2 }}>
                {"✦"} {BLOCK_CONCLUSION_LABELS[item.block] || item.block}
              </div>
              <div style={{ fontSize: 11, color: "#5eead4" }}>已同步到分析报告</div>
            </div>
          );
        }

        // --- Correction ---
        if (item.type === "correction") {
          return (
            <div key={item.key} style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d97706", fontWeight: 700, marginBottom: 4 }}>
                {"⚠"} 修正 · {BLOCK_CONCLUSION_LABELS[item.block] || item.block}
              </div>
              <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.7 }}>
                {item.reason}
              </div>
            </div>
          );
        }

        // --- Error ---
        if (item.type === "error") {
          return (
            <div key={item.key} style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              fontSize: 12,
              color: "#b91c1c",
            }}>
              {item.message}
            </div>
          );
        }

        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
