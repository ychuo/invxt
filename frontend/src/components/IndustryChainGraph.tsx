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
import dagre from "dagre";
import type { GraphData } from "@/types";

const NODE_COLORS: Record<string, string> = {
  Theme: "#e17055",
  Technology: "#74b9ff",
  Material: "#fdcb6e",
  Equipment: "#a29bfe",
  Product: "#55efc4",
  Company: "#00b894",
};

const NODE_SIZES: Record<string, { w: number; h: number; fs: number }> = {
  Theme: { w: 200, h: 46, fs: 15 },
  Technology: { w: 180, h: 40, fs: 13 },
  Company: { w: 160, h: 36, fs: 12 },
  Product: { w: 150, h: 36, fs: 12 },
  Material: { w: 140, h: 32, fs: 11 },
  Equipment: { w: 140, h: 32, fs: 11 },
};

const EDGE_LABELS: Record<string, string> = {
  REQUIRES: "核心技术",
  USES_MATERIAL: "关键材料",
  USES_EQUIPMENT: "关键设备",
  EXPOSED_TO: "受益公司",
};

const LEGEND_ITEMS = [
  { type: "Theme", label: "主题" },
  { type: "Technology", label: "技术方向" },
  { type: "Material", label: "关键材料" },
  { type: "Equipment", label: "关键设备" },
  { type: "Company", label: "相关公司" },
];

interface Props {
  data: GraphData | null;
}

function layoutDagre(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80, marginx: 40, marginy: 40 });

  for (const n of nodes) {
    const size = NODE_SIZES[n.type || "Company"] || NODE_SIZES.Company;
    g.setNode(n.id, { width: size.w, height: size.h });
  }

  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const laidOut = nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    const size = NODE_SIZES[n.type || "Company"] || NODE_SIZES.Company;
    return {
      ...n,
      position: { x: pos.x - size.w / 2, y: pos.y - size.h / 2 },
    };
  });

  return { nodes: laidOut, edges };
}

function GraphCanvas({ data, showLabels }: { data: GraphData | null; showLabels: boolean }) {
  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };

    const ns: Node[] = data.nodes.map((n) => {
      const size = NODE_SIZES[n.type] || NODE_SIZES.Company;
      return {
        id: n.id,
        type: "default",
        data: { label: n.id },
        position: { x: 0, y: 0 },
        style: {
          background: NODE_COLORS[n.type] || "#ddd",
          color: "#fff",
          border: n.type === "Theme" ? "2px solid #c0392b" : "none",
          borderRadius: n.type === "Theme" ? 8 : 5,
          padding: n.type === "Theme" ? "10px 20px" : "6px 14px",
          fontWeight: n.type === "Theme" ? 700 : 600,
          fontSize: size.fs,
          width: size.w,
          textAlign: "center" as const,
        },
      };
    });

    const es: Edge[] = data.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: showLabels ? (EDGE_LABELS[e.type] || e.type) : "",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      labelStyle: { fontSize: 9, fill: "#94a3b8", fontWeight: 400 },
      labelBgStyle: { fill: "rgba(255,255,255,0.8)" },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    }));

    return { nodes: ns, edges: es };
  }, [data]);

  const layouted = useMemo(() => layoutDagre(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    const timer = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 150);
    return () => clearTimeout(timer);
  }, [layouted.nodes, layouted.edges, setNodes, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      minZoom={0.1}
      maxZoom={3}
    >
      <Background color="#f1f5f9" gap={20} />
      <Controls />
    </ReactFlow>
  );
}

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

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

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 bg-white"
    : "relative h-96 border rounded-lg overflow-hidden group";

  return (
    <>
      <div className={containerClass}>
        <ReactFlowProvider>
          <GraphCanvas data={data} showLabels={showLabels} />
        </ReactFlowProvider>

        {/* Toolbar */}
        <div className="absolute top-2 right-2 z-10 flex gap-1.5">
          <button
            onClick={() => setShowLabels((s) => !s)}
            className={`bg-white/90 border rounded px-2 py-1 text-xs shadow-sm ${showLabels ? "text-blue-600 border-blue-300" : "text-gray-500"}`}
          >
            {showLabels ? "标签 ON" : "标签"}
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-white/90 border rounded px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ⛶ 全屏
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-2 left-2 z-10 bg-white/90 border rounded-lg px-3 py-2 shadow-sm">
          <div className="flex flex-wrap gap-3 text-xs">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.type} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: NODE_COLORS[item.type] }}
                />
                <span className="text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats (fullscreen only) */}
        {fullscreen && (
          <>
            <button
              onClick={toggleFullscreen}
              className="absolute top-3 right-3 z-10 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50"
            >
              ✕ 退出全屏 (Esc)
            </button>
            <div className="absolute bottom-10 left-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-500">
              {data.nodes.length} 节点 · {data.edges.length} 连线
            </div>
          </>
        )}
      </div>
    </>
  );
}
