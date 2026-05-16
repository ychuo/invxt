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

    let mounted = true;

    async function load() {
      try {
        // Check cache first
        const cached = await getAnalysisByTopic(topic, market);
        if (cached && mounted) {
          setState(cached);
          setLoading(false);
          return;
        }

        // Not cached, submit new analysis
        const { task_id } = await submitAnalysis(topic, market);
        if (mounted) setTaskId(task_id);
      } catch (err) {
        if (mounted) {
          setError(String(err));
          setLoading(false);
        }
      }
    }

    load();

    return () => { mounted = false; };
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

      {loading && !state && (
        <div className="flex items-center gap-3 text-gray-500">
          <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          正在分析...
        </div>
      )}

      {loading && state && (
        <ProgressStepper currentStep={state.current_step} />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {state && state.status === "completed" && (
        <div>
          <ProgressStepper currentStep={state.current_step} />

          {state.theme && (
            <section className="mb-8">
              <ThemeSummary theme={state.theme} />
            </section>
          )}

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
        </div>
      )}
    </main>
  );
}
