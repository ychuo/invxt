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
          {state.theme && (
            <section className="mb-8">
              <ThemeSummary theme={state.theme} />
            </section>
          )}

          {state.current_step.startsWith("chain_reasoning") && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">产业链推理</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {state.chain.map((c, i) => (
                  <div key={i} className="border rounded-lg p-3 text-sm">
                    <h4 className="font-semibold text-blue-700 mb-1">{c.direction}</h4>
                    {c.upstream.length > 0 && <p className="text-gray-500 text-xs">上游: {c.upstream.slice(0,3).join("、")}</p>}
                    {c.downstream.length > 0 && <p className="text-gray-500 text-xs">下游: {c.downstream.slice(0,3).join("、")}</p>}
                    {c.key_materials.length > 0 && <p className="text-gray-500 text-xs">关键材料: {c.key_materials.slice(0,3).join("、")}</p>}
                  </div>
                ))}
              </div>
              {state.chain.length === 0 && state.current_step.startsWith("chain_reasoning") && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                  DeepSeek 正在推理产业链...
                </div>
              )}
            </section>
          )}

          {state.current_step.startsWith("company_mapping") && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">公司映射</h3>
              {state.companies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {state.companies.map((c, i) => (
                    <span key={i} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm">
                      {c.company_name} <span className="text-gray-400 text-xs">{c.ticker}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                  DeepSeek 正在映射公司...
                </div>
              )}
            </section>
          )}

          {state.current_step.startsWith("scoring") && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">暴露度评分</h3>
              {state.scored.length > 0 ? (
                <CompanyTable companies={state.scored} />
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                  DeepSeek 正在评估暴露度...
                </div>
              )}
            </section>
          )}

          {state.status === "completed" && (
            <>
              <section className="mb-8">
                <h3 className="text-lg font-semibold mb-3">产业链图谱</h3>
                <IndustryChainGraph data={graphData} />
              </section>

              {state.scored.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">
                    核心公司映射 ({state.scored.length})
                  </h3>
                  <CompanyTable companies={state.scored} />
                </section>
              )}

              {state.scored.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">投资逻辑卡片</h3>
                  <LogicCards companies={state.scored} />
                </section>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
