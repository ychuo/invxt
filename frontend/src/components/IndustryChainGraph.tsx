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

const HIGHLIGHT_COLORS: Record<string, string> = {
  REQUIRES: "#e17055",
  USES_MATERIAL: "#f39c12",
  USES_EQUIPMENT: "#6c5ce7",
  EXPOSED_TO: "#00b894",
};

const LEGEND_ITEMS = [
  { type: "Theme", label: "主题" },
  { type: "Technology", label: "技术方向" },
  { type: "Material", label: "关键材料" },
  { type: "Equipment", label: "关键设备" },
  { type: "Company", label: "相关公司" },
];

function layoutDagre(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 120, marginx: 60, marginy: 60 });

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
    return { ...n, position: { x: pos.x - size.w / 2, y: pos.y - size.h / 2 } };
  });

  return { nodes: laidOut, edges };
}

interface CanvasProps {
  data: GraphData | null;
  showLabels: boolean;
  highlightNode: string | null;
  onNodeClick: (id: string | null) => void;
}

function GraphCanvas({ data, showLabels, highlightNode, onNodeClick }: CanvasProps) {
  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };

    const ns: Node[] = data.nodes.map((n) => {
      const size = NODE_SIZES[n.type] || NODE_SIZES.Company;
      const isHighlighted = !highlightNode || n.id === highlightNode;
      return {
        id: n.id,
        type: "default",
        data: { label: n.id },
        position: { x: 0, y: 0 },
        style: {
          background: NODE_COLORS[n.type] || "#ddd",
          color: "#fff",
          border: n.type === "Theme"
            ? "2px solid #c0392b"
            : n.id === highlightNode
            ? "2px solid #333"
            : "none",
          borderRadius: n.type === "Theme" ? 8 : 5,
          padding: n.type === "Theme" ? "10px 20px" : "6px 14px",
          fontWeight: n.type === "Theme" ? 700 : 600,
          fontSize: size.fs,
          width: size.w,
          textAlign: "center" as const,
          opacity: isHighlighted || !highlightNode ? 1 : 0.3,
          cursor: "pointer",
        },
      };
    });

    return { nodes: ns, edges: [] };
  }, [data, highlightNode]);

  const allEdges: Edge[] = useMemo(() => {
    if (!data) return [];
    return data.edges.map((e, i) => {
      const eType = e.type || "";
      const hlColor = HIGHLIGHT_COLORS[eType] || "#94a3b8";
      const isHighlighted =
        !highlightNode || e.source === highlightNode || e.target === highlightNode;

      return {
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        label: showLabels ? (EDGE_LABELS[eType] || eType) : "",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16, height: 16,
          color: isHighlighted || !highlightNode ? hlColor : "#ddd",
        },
        style: {
          stroke: isHighlighted || !highlightNode ? hlColor : "#eee",
          strokeWidth: isHighlighted && highlightNode ? 2.5 : 1.5,
          opacity: isHighlighted || !highlightNode ? 1 : 0.15,
        },
        labelStyle: { fontSize: 9, fill: hlColor, fontWeight: 400 },
        labelBgStyle: { fill: "rgba(255,255,255,0.85)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      };
    });
  }, [data, showLabels, highlightNode]);

  const layouted = useMemo(() => layoutDagre(rawNodes, allEdges), [rawNodes, allEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    const timer = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 150);
    return () => clearTimeout(timer);
  }, [layouted.nodes, layouted.edges, setNodes, setEdges, fitView]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick(highlightNode === node.id ? null : node.id);
    },
    [highlightNode, onNodeClick]
  );

  const handlePaneClick = useCallback(() => {
    onNodeClick(null);
  }, [onNodeClick]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      minZoom={0.05}
      maxZoom={3}
    >
      <Background color="#f1f5f9" gap={20} />
      <Controls position="bottom-right" />
    </ReactFlow>
  );
}

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

  const handleNodeClick = useCallback((id: string | null) => {
    setHighlightNode(id);
  }, []);

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
          <GraphCanvas
            data={data}
            showLabels={showLabels}
            highlightNode={highlightNode}
            onNodeClick={handleNodeClick}
          />
        </ReactFlowProvider>

        {/* Toolbar — top-left */}
        <div className="absolute top-2 left-2 z-10 flex gap-1.5">
          <button
            onClick={() => setShowLabels((s) => !s)}
            className={`bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors ${
              showLabels
                ? "text-blue-600 border-blue-400 bg-blue-50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {showLabels ? "标签 ON" : "标签"}
          </button>
          {highlightNode && (
            <button
              onClick={() => setHighlightNode(null)}
              className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm"
            >
              清除高亮
            </button>
          )}
          {!fullscreen && (
            <button
              onClick={toggleFullscreen}
              className="bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium text-gray-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-700"
            >
              ⛶ 全屏
            </button>
          )}
        </div>

        {/* Legend — bottom-left, with left padding to avoid Controls */}
        <div className="absolute bottom-2 left-2 z-10 bg-white/90 border rounded-lg px-3 py-2 shadow-sm">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.type} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: NODE_COLORS[item.type] }}
                />
                <span className="text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fullscreen-only UI */}
        {fullscreen && (
          <>
            <button
              onClick={toggleFullscreen}
              className="absolute top-2 right-2 z-10 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50"
            >
              ✕ 退出全屏 (Esc)
            </button>
            <div className="absolute bottom-2 right-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">
              {data.nodes.length} 节点 · {data.edges.length} 连线
              {highlightNode && ` · 已高亮: ${highlightNode}`}
            </div>
          </>
        )}
      </div>
    </>
  );
}
