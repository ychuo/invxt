"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { submitAnalysis, getAnalysis, getAnalysisByTopic, getGraph } from "@/lib/api";
import type { AnalysisState, GraphData } from "@/types";
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
  { key: "search", label: "搜索" },
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

  const [state, setState] = useState<AnalysisState | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("search");

  // Step 1: Check cache or submit new analysis
  useEffect(() => {
    if (!topic) return;
    let ignore = false;
    (async () => {
      try {
        const cached = await getAnalysisByTopic(topic, market);
        if (ignore) return;
        if (cached) {
          setState(cached);
          setLoading(false);
          return;
        }
        const { task_id } = await submitAnalysis(topic, market);
        if (!ignore) setTaskId(task_id);
      } catch (err) {
        if (!ignore) {
          setError(String(err));
          setLoading(false);
        }
      }
    })();
    return () => { ignore = true; };
  }, [topic, market]);

  // Step 2: Poll for results
  useEffect(() => {
    if (!taskId) return;
    let mounted = true;
    let timer: ReturnType<typeof setInterval>;
    async function poll() {
      try {
        if (!taskId) return;
        const result = await getAnalysis(taskId);
        if (!mounted) return;
        setState(result);
        if (result.status === "completed" || result.status === "failed") {
          setLoading(false);
          if (result.status === "failed") setError(result.error || "Analysis failed");
          clearInterval(timer);
        }
      } catch (err) {
        if (mounted) { setError(String(err)); setLoading(false); clearInterval(timer); }
      }
    }
    poll();
    timer = setInterval(poll, 2000);
    return () => { mounted = false; clearInterval(timer); };
  }, [taskId]);

  // Step 3: Fetch graph data
  useEffect(() => {
    if (state?.topic && state.chain.length > 0) {
      getGraph(state.topic).then(setGraphData).catch(() => {});
    }
  }, [state?.topic, state?.chain?.length, state?.scored?.length]);

  // Update active nav based on scroll position
  useEffect(() => {
    const sectionIds = ["search", "graph", "table", "cards"];
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
  }, [state?.chain?.length, state?.companies?.length, state?.scored?.length]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!topic) {
    return (
      <div className="p-8 text-center text-[#94a3b8]" style={{ fontFamily: "var(--font-serif)" }}>
        请输入主题
      </div>
    );
  }

  const marketLabel = market === "A" ? "A股" : market === "US" ? "美股" : "全部";

  return (
    <main className="min-h-screen" style={{ fontFamily: "var(--font-serif)" }}>
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
            <span>{state?.status === "completed" ? "分析完成" : "分析中..."}</span>
          </div>
        </div>

        {/* ===== Progress ===== */}
        {state && (
          <div className="mb-6">
            <ProgressStepper currentStep={state.current_step} />
          </div>
        )}

        {/* Loading */}
        {loading && !state && !error && (
          <div className="flex items-center gap-3 text-[#94a3b8]">
            <div className="animate-spin w-5 h-5 border-2 border-[#0d9488] border-t-transparent rounded-full" />
            正在分析...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">{error}</div>
        )}

        {state && (
          <>
            {/* ===== Block: Search Results ===== */}
            {state.search && state.search.length > 0 && (
              <section id="search" className="mb-6">
                <BlockHeader label="实时搜索" badge="完成" meta={`${state.search.length} 条`} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {state.search.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                       className="block border border-[#f0f0f0] rounded-lg p-3.5 no-underline hover:border-[#d4d4d8] transition-colors">
                      <h4 className="text-[13px] font-bold text-[#0f766e] mb-1 leading-snug line-clamp-2">{r.title}</h4>
                      <p className="text-[11px] text-[#94a3b8] leading-relaxed line-clamp-3">{r.content}</p>
                      <span className="text-[9px] text-[#cbd5e1] mt-1.5 block font-mono">{(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* ===== Block: Theme Summary ===== */}
            {state.theme && (
              <section id="theme" className="mb-6">
                <BlockHeader label="主题理解" badge="完成" />
                <ThemeSummary theme={state.theme} />
              </section>
            )}

            {/* ===== Block: Chain Graph — loading spinner ===== */}
            {state.theme && state.chain.length === 0 && !state.current_step.startsWith("company") && !state.current_step.startsWith("scoring") && state.status === "running" && (
              <section id="graph" className="mb-6">
                <BlockHeader label="产业链图谱" badge="推理中..." />
                <div className="flex items-center gap-2 text-sm text-[#94a3b8] py-4">
                  <div className="animate-spin w-4 h-4 border-2 border-[#0d9488] border-t-transparent rounded-full" />
                  大模型正在拆解产业链结构...
                </div>
              </section>
            )}

            {/* ===== Block: Chain Graph ===== */}
            {state.chain.length > 0 && (
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

            {/* ===== Block: Company Mapping — loading skeleton ===== */}
            {state.chain.length > 0 && state.companies.length === 0 && state.status === "running" && !state.current_step.startsWith("scoring") && (
              <section id="table" className="mb-6">
                <BlockHeader label="核心公司映射" badge="映射中..." />
                <div className="border border-[#f0f0f0] rounded-[10px] overflow-hidden">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-6 px-4 py-3 border-b border-[#f5f5f5] last:border-0">
                      <div className="w-4 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                      <div className="w-20 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                      <div className="w-12 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                      <div className="w-32 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ===== Block: Company Table ===== */}
            {state.companies.length > 0 && (
              <section id="table" className="mb-6">
                <BlockHeader
                  label="核心公司映射"
                  badge={state.scored.length > 0 ? `${state.scored.length} 家` : "评分中..."}
                />
                <CompanyTable companies={
                  state.scored.length > 0
                    ? state.scored
                    : state.companies.map(c => ({
                        company_name: c.company_name,
                        ticker: c.ticker,
                        market: c.market as "A" | "US",
                        exposure_score: 0,
                        dimensions: { product_relevance: 0, revenue_elasticity: 0, chain_criticality: 0, competitive_moat: 0, market_awareness: 0 },
                        investment_logic: c.reasoning || "",
                        key_variables: [],
                        risks: [],
                      }))
                } />
              </section>
            )}

            {/* ===== Block: Logic Cards ===== */}
            {state.scored.length > 0 && (
              <section id="cards" className="mb-8">
                <BlockHeader label="投资逻辑卡片" badge={`${Math.min(3, state.scored.length)} 家`} meta="仅展示前三" />
                <LogicCards companies={state.scored} />
              </section>
            )}

            {/* Waiting for cards */}
            {state.companies.length > 0 && state.scored.length === 0 && state.status === "running" && (
              <section id="cards" className="mb-8">
                <BlockHeader label="投资逻辑卡片" badge="等待评分" />
                <div className="border border-dashed border-[#e5e7eb] rounded-[10px] py-10 text-center text-[#bbb] text-[13px]">
                  评分完成后自动生成
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
