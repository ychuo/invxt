"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { submitAnalysis, createAnalysisSocket, getGraph } from "@/lib/api";
import type { AnalysisState } from "@/types";
import type { GraphData } from "@/types";
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
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!topic) return;

    let mounted = true;

    async function run() {
      setLoading(true);
      try {
        const { task_id } = await submitAnalysis(topic, market);

        const ws = createAnalysisSocket(task_id);
        socketRef.current = ws;

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (!mounted) return;

          if (msg.type === "progress") {
            setState(msg.data as AnalysisState);
          } else if (msg.type === "done") {
            setLoading(false);
            ws.close();
          } else if (msg.type === "error") {
            setError(msg.message);
            setLoading(false);
            ws.close();
          }
        };

        ws.onerror = () => {
          if (mounted) setError("WebSocket connection failed");
          setLoading(false);
        };
      } catch (err) {
        if (mounted) setError(String(err));
        setLoading(false);
      }
    }

    run();

    return () => {
      mounted = false;
      socketRef.current?.close();
    };
  }, [topic, market]);

  useEffect(() => {
    if (state?.theme?.theme_name) {
      getGraph(state.theme.theme_name)
        .then(setGraphData)
        .catch(() => {});
    }
  }, [state?.theme?.theme_name]);

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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {state && (
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
