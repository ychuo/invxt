"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getGraph } from "@/lib/api";
import type { GraphData, ScoredCompany, ThemeResult } from "@/types";
import { useAnalysisStream } from "@/hooks/useAnalysisStream";
import ThinkingStream from "@/components/ThinkingStream";
import ThemeSummary from "@/components/ThemeSummary";
import IndustryChainGraph from "@/components/IndustryChainGraph";
import CompanyTable from "@/components/CompanyTable";
import LogicCards from "@/components/LogicCards";
import ProgressStepper from "@/components/ProgressStepper";

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

function BlockHeader({ label, badge, meta, link }: { label: string; badge?: string; meta?: string; link?: { onClick: () => void } }) {
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
      <div className="flex-1" />
      {link && (
        <button onClick={link.onClick} className="text-[10px] text-[#0d9488] hover:text-[#0f766e] font-bold flex items-center gap-1 transition-colors whitespace-nowrap">
          推理过程 <span>→</span>
        </button>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { key: "graph", label: "图谱" },
  { key: "table", label: "公司" },
  { key: "cards", label: "逻辑" },
];

// Polyfill for findLastIndex (target is es5)
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

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

  const { thinking, blocks, status, error, start, cancel } = useAnalysisStream();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [activeNav, setActiveNav] = useState("graph");
  const [flashBlock, setFlashBlock] = useState<string | null>(null);
  const [highlightedEntry, setHighlightedEntry] = useState<number | null>(null);

  // Start analysis on mount
  useEffect(() => {
    if (!topic) return;
    start(topic, market);
    return () => cancel();
  }, [topic, market, start, cancel]);

  // Fetch graph data when chain blocks arrive
  useEffect(() => {
    if (blocks.chain && topic) {
      getGraph(topic).then(setGraphData).catch(() => {});
    }
  }, [blocks.chain, topic]);

  // Flash block when conclusion arrives
  useEffect(() => {
    const lastEntry = thinking[thinking.length - 1];
    if (lastEntry?.type === "conclusion") {
      setFlashBlock(lastEntry.block);
      const timer = setTimeout(() => setFlashBlock(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [thinking]);

  // Handle block click -> highlight thinking entry
  const handleBlockClick = useCallback((block: string) => {
    const idx = findLastIndex(
      thinking,
      (e) => e.type === "conclusion" && e.block === block
    );
    if (idx >= 0) {
      setHighlightedEntry(idx);
      setTimeout(() => setHighlightedEntry(null), 2000);
    }
  }, [thinking]);

  // IntersectionObserver for sticky nav
  useEffect(() => {
    const sectionIds = ["theme", "graph", "table", "cards"];
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
    : blocks.logic != null
      ? "done"
      : blocks.companies != null
        ? "scoring"
        : blocks.chain != null
          ? "company_mapping"
          : blocks.theme != null
            ? "chain_reasoning"
            : status === "streaming"
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
      <div style={{ flex: "0 0 50%", borderRight: "1px solid #e5e7eb", background: "#fafbfc", height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0f0f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8", fontWeight: 700 }}>
            {"💭"} 思考过程
          </span>
          {status === "streaming" && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#14b8a6" }} />
          )}
        </div>
        <ThinkingStream
          entries={thinking}
          onBlockClick={handleBlockClick}
          highlightedEntry={highlightedEntry}
        />
      </div>

      {/* ===== Right: Analysis Report ===== */}
      <div style={{ flex: 1, overflowY: "auto", background: "#fff", height: "100vh" }}>
        {/* ===== Sticky Nav ===== */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#f0f0f0]">
          <div className="max-w-4xl mx-auto flex items-center gap-0 px-6">
            <span className="text-[15px] font-bold text-[#111] py-2.5 whitespace-nowrap">
              Inv<span style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>X</span>t
            </span>
            <span className="text-[#e5e7eb] mx-3.5">|</span>
            <div className="flex gap-0 overflow-x-auto flex-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => scrollTo(item.key)}
                  className={`px-3 py-2.5 text-[11px] whitespace-nowrap border-b-2 transition-colors ${
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

          {/* ===== Block: Theme Summary ===== */}
          {blocks.theme != null && (
            <section id="theme" className="mb-6" style={flashBlock === "theme" ? { boxShadow: "0 0 0 2px #14b8a6", borderRadius: 10, transition: "box-shadow 0.3s" } : {}}>
              <BlockHeader label="主题理解" badge="完成" link={{ onClick: () => handleBlockClick("theme") }} />
              <ThemeSummary theme={blocks.theme as ThemeResult} />
            </section>
          )}

          {/* ===== Block: Chain Graph ===== */}
          {blocks.chain != null && (
            <section id="graph" className="mb-6" style={flashBlock === "chain" ? { boxShadow: "0 0 0 2px #14b8a6", borderRadius: 10, transition: "box-shadow 0.3s" } : {}}>
              <div className="flex items-center justify-between py-3 border-b border-[#f0f0f0] mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">产业链图谱</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#dcfce7] text-[#166534]">完成</span>
                  {graphData && <span className="text-[10px] text-[#cbd5e1]">{graphData.nodes.length} 节点 · {graphData.edges.length} 连线</span>}
                </div>
                <button onClick={() => handleBlockClick("chain")} className="text-[10px] text-[#0d9488] hover:text-[#0f766e] font-bold flex items-center gap-1 transition-colors whitespace-nowrap">
                  推理过程 <span>→</span>
                </button>
              </div>
              <IndustryChainGraph data={graphData} />
            </section>
          )}

          {/* ===== Block: Company Table ===== */}
          {blocks.companies != null && (
            <section id="table" className="mb-6" style={flashBlock === "companies" ? { boxShadow: "0 0 0 2px #14b8a6", borderRadius: 10, transition: "box-shadow 0.3s" } : {}}>
              <BlockHeader
                label="核心公司映射"
                badge={blocks.logic != null ? `${(blocks.logic as any[]).length} 家` : "评分中..."}
                link={{ onClick: () => handleBlockClick("companies") }}
              />
              <CompanyTable companies={
                blocks.logic != null
                  ? (blocks.logic as ScoredCompany[])
                  : (blocks.companies as any[]).map(c => ({
                      company_name: c.company_name,
                      ticker: c.ticker,
                      market: c.market as "A" | "US",
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
            <section id="cards" className="mb-8" style={flashBlock === "logic" ? { boxShadow: "0 0 0 2px #14b8a6", borderRadius: 10, transition: "box-shadow 0.3s" } : {}}>
              <BlockHeader
                label="投资逻辑卡片"
                badge={`${Math.min(3, (blocks.logic as any[]).length)} 家`}
                meta="仅展示前三"
                link={{ onClick: () => handleBlockClick("logic") }}
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
