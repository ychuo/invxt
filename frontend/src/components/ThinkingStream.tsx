"use client";
import { useMemo, useEffect, useRef } from "react";
import type { ThinkingEntry } from "@/hooks/useAnalysisStream";

const TOOL_META: Record<string, { icon: string; label: string }> = {
  web_search: { icon: "🔍", label: "搜索" },
  get_fundamentals: { icon: "📈", label: "获取基本面" },
  get_market_signals: { icon: "📊", label: "获取行情信号" },
  query_knowledge_graph: { icon: "🕸️", label: "查询知识图谱" },
};

const BLOCK_CONCLUSION_LABELS: Record<string, string> = {
  theme: "主题定义",
  chain: "产业链拆解",
  companies: "公司映射",
  logic: "投资逻辑",
};

type RenderItem =
  | { type: "thinking"; text: string; key: string }
  | { type: "tool"; name: string; query?: string; result?: string; key: string }
  | { type: "conclusion"; block: string; key: string }
  | { type: "correction"; block: string; reason: string; key: string }
  | { type: "error"; message: string; key: string };

function pairEntries(entries: ThinkingEntry[]): RenderItem[] {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (e.type === "meta" || e.type === "done") { i++; continue; }

    if (e.type === "tool_call") {
      const name = e.name;
      if (name === "emit_conclusion" || name === "emit_correction") { i++; continue; }
      const next = entries[i + 1];
      const result = (next && next.type === "tool_result" && next.name === name) ? next.result : undefined;
      items.push({
        type: "tool",
        name,
        query: (e.args as any)?.query,
        result,
        key: `t-${i}`,
      });
      i += result ? 2 : 1;
    } else if (e.type === "tool_result") {
      if (e.name === "emit_conclusion" || e.name === "emit_correction") { i++; continue; }
      // Orphan result (shouldn't normally happen after pairing)
      items.push({ type: "tool", name: e.name, result: e.result, key: `t-${i}` });
      i++;
    } else if (e.type === "thinking") {
      items.push({ type: "thinking", text: e.text, key: `th-${i}` });
      i++;
    } else if (e.type === "conclusion") {
      items.push({ type: "conclusion", block: e.block, key: `c-${i}` });
      i++;
    } else if (e.type === "correction") {
      items.push({ type: "correction", block: e.block, reason: e.reason, key: `cr-${i}` });
      i++;
    } else if (e.type === "error") {
      items.push({ type: "error", message: e.message, key: `e-${i}` });
      i++;
    } else {
      i++;
    }
  }
  return items;
}

function SearchResults({ raw }: { raw: string }) {
  let results: Array<{ title: string; url: string; snippet: string }> = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      results = parsed.slice(0, 4).map((r: any) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: (r.content || "").slice(0, 150),
      }));
    }
  } catch {}

  if (results.length === 0) {
    return <div style={resultTextStyle}>{raw.slice(0, 300)}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {results.map((r, j) => (
        <a key={j} href={r.url} target="_blank" rel="noopener noreferrer"
           style={{ display: "block", textDecoration: "none", color: "inherit",
                    padding: "6px 0 6px 10px", borderLeft: "2px solid #e5e7eb",
                    transition: "border-color 0.15s" }}>
          <div style={{ fontSize: 12, color: "#0f766e", lineHeight: 1.4, marginBottom: 1 }}>{r.title}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{r.snippet}</div>
        </a>
      ))}
    </div>
  );
}

const resultTextStyle: React.CSSProperties = {
  fontSize: 11, color: "#94a3b8", lineHeight: 1.7,
  whiteSpace: "pre-wrap", wordBreak: "break-word",
};

function ToolResult({ name, result }: { name: string; result?: string }) {
  if (!result) {
    return (
      <div style={{ fontSize: 11, color: "#cbd5e1", fontStyle: "italic" }}>执行中...</div>
    );
  }

  if (name === "web_search") {
    return <SearchResults raw={result} />;
  }

  // For other tools: show compact summary
  let display = result;
  if (result.length > 500) {
    try {
      const obj = JSON.parse(result);
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        const parts: string[] = [];
        if (obj.name) parts.push(obj.name);
        if (obj.description) parts.push(obj.description.slice(0, 250));
        if (obj.category) parts.push(`分类: ${obj.category}`);
        if (parts.length > 0) display = parts.join("\n");
        else display = result.slice(0, 400);
      }
    } catch {}
  }

  return <div style={resultTextStyle}>{display}</div>;
}

export default function ThinkingStream({ entries }: { entries: ThinkingEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => pairEntries(entries), [entries]);
  const isStreaming = entries.length > 0 && entries[entries.length - 1].type !== "done";

  // Find last thinking item for cursor
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
      padding: "20px 20px 32px",
      height: "100%",
      overflowY: "auto",
    }}>
      {items.length === 0 && (
        <div style={{ color: "#94a3b8", fontSize: 12 }}>
          开始分析...
        </div>
      )}

      {items.map((item, i) => {
        // ── Thinking ──
        if (item.type === "thinking") {
          const isLast = i === lastThinkingIdx && isStreaming;
          return (
            <div key={item.key} style={{ marginBottom: 20 }}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {item.text}
                {isLast && (
                  <span style={{
                    display: "inline-block", width: 2, height: 14,
                    background: "#0d9488", marginLeft: 2,
                    verticalAlign: "text-bottom",
                    animation: "blink 0.8s step-end infinite",
                  }} />
                )}
              </p>
            </div>
          );
        }

        // ── Tool call ──
        if (item.type === "tool") {
          const meta = TOOL_META[item.name] || { icon: "🔧", label: item.name };
          const label = item.query ? `${meta.label} "${item.query}"` : meta.label;
          const done = !!item.result;

          return (
            <div key={item.key} style={{ marginBottom: 20 }}>
              {/* Compact header line */}
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                marginBottom: 8,
                fontSize: 11,
                color: "#94a3b8",
              }}>
                <span style={{ fontSize: 13 }}>{meta.icon}</span>
                <span style={{
                  fontWeight: 600, color: "#64748b",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 10,
                  color: done ? "#0d9488" : "#d97706",
                  flexShrink: 0,
                }}>
                  {done ? "完成" : "执行中..."}
                </span>
              </div>
              {/* Result body */}
              <div style={{ paddingLeft: 20 }}>
                <ToolResult name={item.name} result={item.result} />
              </div>
            </div>
          );
        }

        // ── Conclusion ──
        if (item.type === "conclusion") {
          return (
            <div key={item.key} style={{
              background: "#f0fdfa",
              borderLeft: "3px solid #0d9488",
              padding: "10px 14px",
              borderRadius: "0 6px 6px 0",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e" }}>
                {"✦"} {BLOCK_CONCLUSION_LABELS[item.block] || item.block}
              </div>
              <div style={{ fontSize: 10, color: "#99f6e4", marginTop: 2 }}>已同步到报告</div>
            </div>
          );
        }

        // ── Correction ──
        if (item.type === "correction") {
          return (
            <div key={item.key} style={{
              background: "#fffbeb",
              borderLeft: "3px solid #f59e0b",
              padding: "10px 14px",
              borderRadius: "0 6px 6px 0",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d97706", fontWeight: 700, marginBottom: 4 }}>
                {"⚠"} 修正 · {BLOCK_CONCLUSION_LABELS[item.block] || item.block}
              </div>
              <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.7 }}>{item.reason}</div>
            </div>
          );
        }

        // ── Error ──
        if (item.type === "error") {
          return (
            <div key={item.key} style={{
              borderLeft: "3px solid #dc2626",
              padding: "8px 14px",
              marginBottom: 20,
              fontSize: 12, color: "#b91c1c",
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
