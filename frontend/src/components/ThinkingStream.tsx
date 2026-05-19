"use client";
import { useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Search, PieChart, TrendingUp, Network } from "lucide-react";
import type { ThinkingEntry } from "@/hooks/useAnalysisStream";

const TOOL_META: Record<string, { icon: typeof Search; label: string }> = {
  web_search: { icon: Search, label: "搜索" },
  get_fundamentals: { icon: PieChart, label: "获取基本面" },
  get_market_signals: { icon: TrendingUp, label: "获取行情信号" },
  query_knowledge_graph: { icon: Network, label: "查询知识图谱" },
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
      items.push({ type: "tool", name, query: (e.args as any)?.query, result, key: `t-${i}` });
      i += result ? 2 : 1;
    } else if (e.type === "tool_result") {
      if (e.name === "emit_conclusion" || e.name === "emit_correction") { i++; continue; }
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

// ── Shared styles matching the report design system ──

const badgeGreen: React.CSSProperties = {
  background: "#dcfce7", color: "#166534",
  fontSize: 10, padding: "2px 8px", borderRadius: 100, fontWeight: 600,
};
const badgeAmber: React.CSSProperties = {
  background: "#fef3c7", color: "#92400e",
  fontSize: 10, padding: "2px 8px", borderRadius: 100, fontWeight: 600,
};
const blockLabel: React.CSSProperties = {
  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em",
  color: "#94a3b8", fontWeight: 600,
};

// ── Sub-components ──

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
    return <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>{raw.slice(0, 300)}</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {results.map((r, j) => (
        <a key={j} href={r.url} target="_blank" rel="noopener noreferrer"
           style={{ display: "block", border: "1px solid #f0f0f0", borderRadius: 8,
                    padding: "10px 12px", textDecoration: "none", cursor: "pointer" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontWeight: 600,
                        color: "#0f766e", marginBottom: 3, lineHeight: 1.4 }}>
            {r.title}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{r.snippet}</div>
          <div style={{ fontSize: 9, color: "#cbd5e1", marginTop: 4, fontFamily: "monospace" }}>
            {(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}
          </div>
        </a>
      ))}
    </div>
  );
}

function OtherResult({ raw }: { raw: string }) {
  let display = raw;
  if (raw.length > 500) {
    try {
      const obj = JSON.parse(raw);
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        const parts: string[] = [];
        if (obj.name) parts.push(obj.name);
        if (obj.description) parts.push(obj.description.slice(0, 250));
        if (obj.category) parts.push(`分类: ${obj.category}`);
        if (parts.length > 0) display = parts.join("\n");
        else display = raw.slice(0, 400);
      }
    } catch {}
  }
  return <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{display}</div>;
}

function ToolResultBody({ name, result }: { name: string; result?: string }) {
  if (!result) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0" }}>
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#0d9488", animation: "pulse 1.2s ease-in-out infinite" }} />
        <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>执行中...</span>
      </div>
    );
  }

  if (name === "web_search") {
    return <SearchResults raw={result} />;
  }

  return <OtherResult raw={result} />;
}

// ── Main component ──

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
      padding: "16px 18px 32px",
      height: "100%",
      overflowY: "auto",
    }}>
      {items.length === 0 && (
        <div className="flex items-center gap-3 text-[#94a3b8]" style={{ fontFamily: "var(--font-serif)" }}>
          <div className="animate-spin w-5 h-5 border-2 border-[#0d9488] border-t-transparent rounded-full" />
          正在分析...
        </div>
      )}

      {items.map((item, i) => {
        // ── Thinking (markdown) ──
        if (item.type === "thinking") {
          const isLast = i === lastThinkingIdx && isStreaming;
          return (
            <div key={item.key} style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.9, color: "#334155" }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ margin: "0 0 8px" }}>{children}</p>,
                  strong: ({ children }) => <strong style={{ color: "#0f172a" }}>{children}</strong>,
                  ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: 18 }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                  em: ({ children }) => <em style={{ color: "#64748b" }}>{children}</em>,
                  code: ({ children }) => <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>{children}</code>,
                  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "12px 0 4px" }}>{children}</h3>,
                  blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid #e5e7eb", paddingLeft: 12, margin: "8px 0", color: "#64748b" }}>{children}</blockquote>,
                  table: ({ children }) => <table style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>{children}</table>,
                  thead: ({ children }) => <thead style={{ background: "#f8fafc" }}>{children}</thead>,
                  th: ({ children }) => <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e5e7eb" }}>{children}</th>,
                  td: ({ children }) => <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{children}</td>,
                }}
              >
                {item.text}
              </ReactMarkdown>
              {isLast && (
                <span style={{
                  display: "inline-block", width: 2, height: 14,
                  background: "#0d9488", marginLeft: 2,
                  verticalAlign: "text-bottom",
                  animation: "blink 0.8s step-end infinite",
                }} />
              )}
            </div>
          );
        }

        // ── Tool call ──
        if (item.type === "tool") {
          const meta = TOOL_META[item.name] || { icon: Search, label: item.name };
          const Icon = meta.icon;
          const title = item.query ? `${meta.label}: ${item.query}` : meta.label;
          const done = !!item.result;

          return (
            <div key={item.key} style={{ marginBottom: 20 }}>
              {/* Header — same pattern as report BlockHeader */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "12px 0", borderBottom: "1px solid #f0f0f0", marginBottom: 12,
              }}>
                <Icon size={13} color="#94a3b8" strokeWidth={1.5} />
                <span style={blockLabel}>{title}</span>
                <span style={done ? badgeGreen : badgeAmber}>
                  {done ? "完成" : "执行中"}
                </span>
              </div>
              <ToolResultBody name={item.name} result={item.result} />
            </div>
          );
        }

        // ── Conclusion ──
        if (item.type === "conclusion") {
          return (
            <div key={item.key} style={{
              background: "#f0fdfa",
              border: "1px solid #ccfbf1",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", marginBottom: 2 }}>
                {"✦"} {BLOCK_CONCLUSION_LABELS[item.block] || item.block}
              </div>
              <div style={{ fontSize: 10, color: "#99f6e4" }}>已同步到分析报告</div>
            </div>
          );
        }

        // ── Correction ──
        if (item.type === "correction") {
          return (
            <div key={item.key} style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "12px 16px",
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
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "12px 16px",
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
