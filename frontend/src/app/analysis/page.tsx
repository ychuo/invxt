"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getAnalysisByTopic, getGraph } from "@/lib/api";
import type { GraphData, ScoredCompany, ThemeResult } from "@/types";
import { useAnalysisStream } from "@/hooks/useAnalysisStream";
import ThinkingStream from "@/components/ThinkingStream";
import ThemeSummary from "@/components/ThemeSummary";
import IndustryChainGraph from "@/components/IndustryChainGraph";
import CompanyTable from "@/components/CompanyTable";
import LogicCards from "@/components/LogicCards";
import ProgressStepper from "@/components/ProgressStepper";
import ExecutiveSummary from "@/components/ExecutiveSummary";
import type { ExecutiveSummary as ExecSummaryType } from "@/types";

function GraphIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" className="flex-shrink-0">
      <circle cx="6" cy="6" r="2" fill="#5eead4" opacity="0.5"/>
      <circle cx="16" cy="6" r="2" fill="#0d9488" opacity="0.5"/>
      <circle cx="11" cy="16" r="2.5" fill="#14b8a6" opacity="0.4"/>
      <line x1="7.5" y1="7" x2="10" y2="14.5" stroke="#99f6e4" strokeWidth="1"/>
      <line x1="14.5" y1="7" x2="12" y2="14.5" stroke="#99f6e4" strokeWidth="1"/>
    </svg>
  );
}

function BlockHeader({ label, badge, meta }: { label: string; badge?: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-3 border-b border-[#f0f0f0] mb-3">
      <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">{label}</span>
      {badge && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
          badge === "完成" ? "bg-[#dcfce7] text-[#166534]" :
          badge.startsWith("评分") || badge.startsWith("进行") || badge.startsWith("映射") || badge.startsWith("推理") ? "bg-[#fef3c7] text-[#92400e]" :
          "bg-[#f1f5f9] text-[#64748b]"
        }`}>{badge}</span>
      )}
      {meta && <span className="text-[10px] text-[#cbd5e1]">{meta}</span>}
    </div>
  );
}

const NAV_ITEMS = [
  { key: "summary", label: "摘要" },
  { key: "graph", label: "图谱" },
  { key: "table", label: "公司" },
  { key: "cards", label: "逻辑" },
];

export default function AnalysisPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen text-[#94a3b8]" style={{ fontFamily: "var(--font-serif)" }}>
        <div className="animate-spin w-5 h-5 border-2 border-[#0d9488] border-t-transparent rounded-full mr-3" />
        加载中...
      </div>
    }>
      <AnalysisContent />
    </Suspense>
  );
}

function AnalysisContent() {
  const params = useSearchParams();
  const topic = params.get("q") || "";
  const market = params.get("market") || "A";

  const { thinking, blocks, status, error, taskId, start, cancel, restore } = useAnalysisStream();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [activeNav, setActiveNav] = useState("graph");

  const handleRestart = useCallback(() => {
    cancel();
    start(topic, market);
  }, [topic, market, start, cancel]);

  // On mount: check Redis cache first, otherwise start new stream
  useEffect(() => {
    if (!topic) return;
    let ignore = false;
    (async () => {
      try {
        const cached = await getAnalysisByTopic(topic, market);
        if (ignore) return;
        if (cached && (cached.status === "completed" || cached.status === "running")) {
          restore(cached);
          return;
        }
      } catch {}
      if (!ignore) start(topic, market);
    })();
    return () => { ignore = true; cancel(); };
  }, [topic, market, start, cancel, restore]);

  // Fetch graph data when chain blocks arrive
  useEffect(() => {
    if (blocks.chain && topic) {
      getGraph(topic).then(setGraphData).catch(() => {});
    }
  }, [blocks.chain, topic]);

  // IntersectionObserver for sticky nav
  useEffect(() => {
    const sectionIds = ["summary", "theme", "graph", "table", "cards"];
    const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [blocks.theme, blocks.chain, blocks.companies, blocks.logic]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Derive current step for ProgressStepper from blocks state
  const currentStep = status === "idle" || status === "error"
    ? ""
    : (blocks.theme as any)?.executive_summary != null
      ? "executive_summary"
      : blocks.logic != null
        ? "scoring"
        : blocks.companies != null
          ? "company_mapping"
          : blocks.chain != null
            ? "chain_reasoning"
            : blocks.theme != null
              ? "theme_understanding"
              : "";

  if (!topic) {
    return (
      <div className="p-8 text-center text-[#94a3b8]" style={{ fontFamily: "var(--font-serif)" }}>
        请输入主题
      </div>
    );
  }

  const marketLabel = market === "A" ? "A股" : market === "US" ? "美股" : "全部";

  return (
    <main className="h-screen flex overflow-hidden" style={{ fontFamily: "var(--font-serif)" }}>
      {/* ===== Left: Thinking Stream ===== */}
      <div style={{ flex: 1, borderRight: "1px solid #e5e7eb", background: "#fafbfc", height: "100vh", display: "flex", flexDirection: "column", minWidth: 400 }}>
        <div style={{ borderBottom: "1px solid #f0f0f0", background: "#fff", height: 44, display: "flex", alignItems: "center" }}>
          <div className="max-w-3xl mx-auto flex items-center justify-between px-6 w-full">
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 700, color: "#111", lineHeight: "44px" }}>
              Inv<span style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>X</span>t
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {status !== "idle" && (
                <button
                  onClick={handleRestart}
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 11, color: "#94a3b8",
                    background: "none", border: "1px solid #e5e7eb",
                    borderRadius: 6, cursor: "pointer",
                    padding: "3px 10px",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#0d9488";
                    e.currentTarget.style.borderColor = "#0d9488";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#94a3b8";
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                >
                  重新调研
                </button>
              )}
              {(status === "streaming" || status === "error") && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: status === "error" ? "#dc2626" : "#14b8a6",
                  animation: status === "streaming" ? "pulse 1.5s ease-in-out infinite" : "none",
                }} />
              )}
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-6 w-full" style={{ flex: 1, overflow: "hidden" }}>
          <ThinkingStream entries={thinking} />
        </div>
      </div>

      {/* ===== Right: Analysis Report ===== */}
      <div style={{ flex: "0 0 52%", overflowY: "auto", background: "#fff", height: "100vh", minWidth: 560 }}>
        {/* ===== Sticky Nav ===== */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#f0f0f0]" style={{ height: 44, display: "flex", alignItems: "center" }}>
          <div className="max-w-4xl mx-auto flex items-center gap-0 px-6 w-full">
            <div className="flex gap-5 overflow-x-auto">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => scrollTo(item.key)}
                  className={`text-[11px] whitespace-nowrap border-b-2 transition-colors h-[44px] ${
                    activeNav === item.key
                      ? "text-[#0d9488] font-bold border-[#0d9488]"
                      : "text-[#94a3b8] border-transparent hover:text-[#64748b]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* ===== Page Header ===== */}
          <div className="mb-0">
            <h1 className="text-[26px] font-bold text-[#0f172a] mb-1">{topic}</h1>
            <div className="flex items-center gap-2.5 pb-5 text-[13px] text-[#94a3b8]">
              <span>{marketLabel}市场</span>
              <GraphIcon />
              <span>{status === "done" ? "分析完成" : status === "error" ? "分析失败" : "分析中..."}</span>
            </div>
          </div>

          {/* ===== Progress ===== */}
          {(status === "streaming" || status === "done" || status === "error") && currentStep && (
            <div className="mb-6">
              <ProgressStepper currentStep={currentStep} />
            </div>
          )}

          {/* ===== Block: Executive Summary ===== */}
          {blocks.theme != null && (blocks.theme as any).executive_summary != null && (
            <section id="summary" className="mb-6">
              <ExecutiveSummary data={(blocks.theme as any).executive_summary as ExecSummaryType} />
            </section>
          )}

          {/* ===== Block: Theme Summary ===== */}
          {blocks.theme != null && (
            <section id="theme" className="mb-6">
              <BlockHeader label="主题理解" badge="完成" />
              <ThemeSummary theme={blocks.theme as ThemeResult} />
            </section>
          )}

          {/* ===== Block: Chain Graph ===== */}
          {blocks.chain != null && (
            <section id="graph" className="mb-6">
              <div className="flex items-center justify-between py-3 border-b border-[#f0f0f0] mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">产业链图谱</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#dcfce7] text-[#166534]">完成</span>
                  {graphData && <span className="text-[10px] text-[#cbd5e1]">{graphData.nodes.length} 节点 · {graphData.edges.length} 连线</span>}
                </div>
              </div>
              <IndustryChainGraph data={graphData} />
            </section>
          )}

          {/* ===== Block: Company Table ===== */}
          {blocks.companies != null && (
            <section id="table" className="mb-6">
              <BlockHeader
                label="核心公司映射"
                badge={blocks.logic != null ? `${(blocks.logic as any[]).length} 家` : "评分中..."}
              />
              <CompanyTable companies={
                blocks.logic != null
                  ? (blocks.logic as ScoredCompany[])
                  : (blocks.companies as any[]).map(c => ({
                      company_name: c.company_name,
                      ticker: c.ticker,
                      market: (c.market === "a" || c.market === "A" || String(c.market).toUpperCase() === "A") ? "A" as const : "US" as const,
                      exposure_score: 0,
                      revenue_tier: "concept" as const,
                      market_awareness: "priced_in" as const,
                      dimensions: { industry_purity: 0, earnings_elasticity: 0, expectation_gap: 0, competitive_moat: 0, market_awareness: 0 },
                      investment_logic: c.reasoning || "",
                      key_variables: [],
                      risks: [],
                    }))
              } />
            </section>
          )}

          {/* ===== Block: Logic Cards ===== */}
          {blocks.logic != null && (
            <section id="cards" className="mb-8">
              <BlockHeader
                label="投资逻辑卡片"
                badge={`${Math.min(3, (blocks.logic as any[]).length)} 家`}
                meta="仅展示前三"
              />
              <LogicCards companies={blocks.logic as ScoredCompany[]} />
            </section>
          )}

          {/* ===== Loading state: streaming with no blocks yet ===== */}
          {status === "streaming" && Object.keys(blocks).length === 0 && (
            <div className="flex items-center gap-3 text-[#94a3b8]">
              <div className="animate-spin w-5 h-5 border-2 border-[#0d9488] border-t-transparent rounded-full" />
              正在分析...
            </div>
          )}

          {/* ===== Error state ===== */}
          {status === "error" && error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">{error}</div>
          )}
        </div>
      </div>
    </main>
  );
}
