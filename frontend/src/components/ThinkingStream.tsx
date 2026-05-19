"use client";
import { useEffect, useRef } from "react";
import type { ThinkingEntry } from "@/hooks/useAnalysisStream";

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍",
  get_fundamentals: "📈",
  get_market_signals: "📊",
  query_knowledge_graph: "🕸️",
  emit_conclusion: "✦",
  emit_correction: "⚠",
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "搜索",
  get_fundamentals: "获取基本面",
  get_market_signals: "获取行情信号",
  query_knowledge_graph: "查询知识图谱",
};

const BLOCK_LABELS: Record<string, string> = {
  theme: "主题",
  chain: "图谱",
  companies: "公司",
  logic: "逻辑",
};

const BLOCK_CONCLUSION_LABELS: Record<string, string> = {
  theme: "主题定义",
  chain: "产业链拆解",
  companies: "公司映射",
  logic: "投资逻辑",
};

export default function ThinkingStream({
  entries,
  onBlockClick,
  highlightedEntry,
}: {
  entries: ThinkingEntry[];
  onBlockClick?: (block: string) => void;
  highlightedEntry?: number | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div style={{
      fontFamily: "var(--font-serif)",
      fontSize: 13,
      lineHeight: 1.8,
      color: "#475569",
      padding: "16px 18px",
      height: "100%",
      overflowY: "auto",
    }}>
      {entries.map((entry, i) => {
        // --- Thinking text ---
        if (entry.type === "thinking") {
          const isHighlighted = highlightedEntry === i;
          return (
            <div key={i} style={{
              marginBottom: 12,
              background: isHighlighted ? "#fffbeb" : "transparent",
              border: isHighlighted ? "1px solid #fde68a" : "none",
              borderRadius: 8,
              padding: isHighlighted ? "10px 14px" : 0,
              transition: "all 0.3s",
            }}>
              {isHighlighted && (
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "#d97706", fontWeight: 700, marginBottom: 4 }}>
                  {"📍"} 跳转到此处
                </div>
              )}
              <p style={{ margin: 0 }}>{entry.text}</p>
            </div>
          );
        }

        // --- Tool call ---
        if (entry.type === "tool_call") {
          return (
            <div key={i} style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{TOOL_ICONS[entry.name] || "🔧"}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                  {entry.name === "web_search"
                    ? `搜索 "${(entry.args as {query?: string}).query || ""}"`
                    : TOOL_LABELS[entry.name] || entry.name}
                </span>
                <span style={{ marginLeft: "auto" }}>
                  <span style={{
                    background: "#fef3c7", color: "#92400e",
                    fontSize: 10, padding: "2px 8px", borderRadius: 100, fontWeight: 600,
                  }}>执行中</span>
                </span>
              </div>
            </div>
          );
        }

        // --- Tool result ---
        if (entry.type === "tool_result") {
          return (
            <div key={i} style={{
              background: "#fafbfc",
              border: "1px solid #f0f0f0",
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              padding: "8px 14px",
              marginTop: -12,
              marginBottom: 12,
              fontSize: 11,
              color: "#94a3b8",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {entry.result.length > 600 ? entry.result.slice(0, 600) + "..." : entry.result}
            </div>
          );
        }

        // --- Conclusion anchor ---
        if (entry.type === "conclusion") {
          return (
            <div key={i} style={{
              background: "#f0fdfa",
              borderLeft: "3px solid #0d9488",
              padding: "10px 14px",
              borderRadius: "0 8px 8px 0",
              marginBottom: 12,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}>
              <div style={{ flex: 1, fontSize: 12, color: "#0f766e", lineHeight: 1.6 }}>
                <strong>{"✦"} {BLOCK_CONCLUSION_LABELS[entry.block] || entry.block}</strong>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, cursor: "pointer" }}
                onClick={() => onBlockClick?.(entry.block)}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0d9488" }} />
                <span style={{ fontSize: 7, color: "#0d9488", fontWeight: 600 }}>
                  {BLOCK_LABELS[entry.block]}
                </span>
              </div>
            </div>
          );
        }

        // --- Correction ---
        if (entry.type === "correction") {
          return (
            <div key={i} style={{
              background: "#fffbeb",
              borderLeft: "3px solid #f59e0b",
              padding: "10px 14px",
              borderRadius: "0 8px 8px 0",
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d97706", fontWeight: 700, marginBottom: 2 }}>
                {"⚠"} 修正 · {BLOCK_LABELS[entry.block] || entry.block}
              </div>
              <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                {entry.reason}
              </div>
            </div>
          );
        }

        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
