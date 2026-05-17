"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { submitAnalysis, getAnalysis, getAnalysisByTopic, getGraph } from "@/lib/api";
import type { AnalysisState, GraphData } from "@/types";
import ThemeSummary from "@/components/ThemeSummary";
import IndustryChainGraph from "@/components/IndustryChainGraph";
import CompanyTable from "@/components/CompanyTable";
import LogicCards from "@/components/LogicCards";
import ProgressStepper from "@/components/ProgressStepper";

export default function AnalysisPage() {
  const params = useSearchParams();
  const topic = params.get("q") || "";
  const market = params.get("market") || "A";

  const [state, setState] = useState<AnalysisState | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);

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
        const result = await getAnalysis(taskId);
        if (!mounted) return;

        setState(result);

        if (result.status === "completed" || result.status === "failed") {
          setLoading(false);
          if (result.status === "failed") {
            setError(result.error || "Analysis failed");
          }
          clearInterval(timer);
        }
      } catch (err) {
        if (mounted) {
          setError(String(err));
          setLoading(false);
          clearInterval(timer);
        }
      }
    }

    // Poll immediately, then every 2 seconds
    poll();
    timer = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [taskId]);

  // Step 3: Fetch graph data when theme is ready (use original topic)
  useEffect(() => {
    if (state?.topic) {
      getGraph(state.topic)
        .then(setGraphData)
        .catch(() => {});
    }
  }, [state?.topic]);

  if (!topic) {
    return (
      <div className="p-8 text-center text-gray-500">请输入主题</div>
    );
  }

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Invxt</h1>
      <p className="text-gray-500 mb-6">
        主题 &ldquo;{topic}&rdquo; ·{" "}
        {market === "A" ? "A股" : market === "US" ? "美股" : "全部"}
      </p>

      {state && <ProgressStepper currentStep={state.current_step} />}

      {loading && !state && !error && (
        <div className="flex items-center gap-3 text-gray-500">
          <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          正在分析...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {/* Show results progressively as each step completes */}
      {state && (
        <div>
          {/* Step 1 done: Theme summary */}
          {state.theme && (
            <section className="mb-8">
              <ThemeSummary theme={state.theme} />
            </section>
          )}

          {/* Step 1→2: Chain reasoning spinner */}
          {state.theme && state.chain.length === 0 && !state.current_step.startsWith("company") && !state.current_step.startsWith("scoring") && state.status === "running" && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">产业链推理</h3>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                大模型正在拆解产业链结构...
              </div>
            </section>
          )}

          {/* Step 2 done: Industry chain graph */}
          {state.chain.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">产业链图谱</h3>
              <IndustryChainGraph data={graphData} />
            </section>
          )}

          {/* Step 2→3: Company mapping spinner */}
          {state.chain.length > 0 && state.companies.length === 0 && state.status === "running" && !state.current_step.startsWith("scoring") && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">公司映射</h3>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                大模型正在映射产业链核心公司...
              </div>
            </section>
          )}

          {/* Step 3 done: Company table (scores fill in at step 4) */}
          {state.companies.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">
                核心公司映射 ({state.scored.length || state.companies.length})
                {state.scored.length === 0 && state.status === "running" && (
                  <span className="ml-2 text-xs font-normal text-gray-400 inline-flex items-center gap-1">
                    <span className="animate-spin w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full" />
                    评分中...
                  </span>
                )}
              </h3>
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

          {/* Step 4 done: Logic cards */}
          {state.scored.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">投资逻辑卡片</h3>
              <LogicCards companies={state.scored} />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
