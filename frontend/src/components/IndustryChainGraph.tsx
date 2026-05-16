"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphData } from "@/types";

const NODE_COLORS: Record<string, string> = {
  Theme: "#e17055",
  Technology: "#74b9ff",
  Material: "#fdcb6e",
  Equipment: "#a29bfe",
  Product: "#55efc4",
  Company: "#00b894",
};

interface Props {
  data: GraphData | null;
}

function GraphCanvas({ data }: Props) {
  const initialNodes: Node[] = useMemo(() => {
    if (!data) return [];
    return data.nodes.map((n, i) => ({
      id: n.id,
      data: { label: n.id },
      position: { x: (i % 3) * 250, y: Math.floor(i / 3) * 120 },
      style: {
        background: NODE_COLORS[n.type] || "#ddd",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "8px 16px",
        fontWeight: 600,
        fontSize: 13,
      },
    }));
  }, [data]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!data) return [];
    return data.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.type,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#94a3b8" },
      labelStyle: { fontSize: 10, fill: "#94a3b8" },
    }));
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Auto-fit after nodes sync
  useEffect(() => {
    if (initialNodes.length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.2 }), 100);
      return () => clearTimeout(timer);
    }
  }, [initialNodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((f) => !f);
  }, []);

  // Escape key to exit fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (!data || data.nodes.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 border rounded-lg">
        暂无图谱数据
      </div>
    );
  }

  return (
    <>
      {/* Normal mode */}
      <div className={`${fullscreen ? "hidden" : ""} relative h-80 border rounded-lg overflow-hidden group`}>
        <ReactFlowProvider>
          <GraphCanvas data={data} />
        </ReactFlowProvider>
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white border rounded px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title="全屏"
        >
          ⛶ 全屏
        </button>
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-white">
          <ReactFlowProvider>
            <GraphCanvas data={data} />
          </ReactFlowProvider>
          <button
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-10 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50"
          >
            ✕ 退出全屏 (Esc)
          </button>
          <div className="absolute bottom-3 left-3 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-500">
            {data.nodes.length} 节点 · {data.edges.length} 连线
          </div>
        </div>
      )}
    </>
  );
}

