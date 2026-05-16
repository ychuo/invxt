"use client";

import { useMemo, useEffect, useState, useCallback, useRef } from "react";
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
  REQUIRES: "",
  USES_MATERIAL: "材料",
  USES_EQUIPMENT: "设备",
  EXPOSED_TO: "",
};

const HIGHLIGHT_COLORS: Record<string, string> = {
  REQUIRES: "#e17055",
  USES_MATERIAL: "#f39c12",
  USES_EQUIPMENT: "#6c5ce7",
  EXPOSED_TO: "#00b894",
};

const NEUTRAL_EDGE = "#cbd5e1";

const LEGEND_ITEMS = [
  { type: "Theme", label: "主题" },
  { type: "Technology", label: "技术方向 ▸ 点击展开" },
  { type: "Material", label: "关键材料" },
  { type: "Equipment", label: "关键设备" },
  { type: "Company", label: "相关公司" },
];

// ---- helpers ----

function buildChildMap(data: GraphData): Map<string, { id: string; type: string }[]> {
  const m = new Map<string, { id: string; type: string }[]>();
  // Tech → Material/Equipment (from USES_MATERIAL / USES_EQUIPMENT edges)
  for (const e of data.edges) {
    if (e.type === "USES_MATERIAL" || e.type === "USES_EQUIPMENT") {
      if (!m.has(e.source)) m.set(e.source, []);
      const childType = e.type === "USES_MATERIAL" ? "Material" : "Equipment";
      m.get(e.source)!.push({ id: e.target, type: childType });
    }
  }
  return m;
}

function getThemeId(data: GraphData): string {
  const theme = data.nodes.find((n) => n.type === "Theme");
  return theme?.id || "";
}

// ---- tree layout (dagre, top-down) ----

function layoutTree(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 70, ranksep: 100, marginx: 40, marginy: 40 });

  for (const n of nodes) {
    const size = NODE_SIZES[n.type || "Company"] || NODE_SIZES.Company;
    g.setNode(n.id, { width: size.w, height: size.h });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      if (!pos) return n;
      const size = NODE_SIZES[n.type || "Company"] || NODE_SIZES.Company;
      return { ...n, position: { x: pos.x - size.w / 2, y: pos.y - size.h / 2 } };
    }),
    edges,
  };
}

// ---- canvas ----

// Build parent map for path-to-root (BFS from Theme)
function buildParentMap(graphData: GraphData): Map<string, string | null> {
  const adj = new Map<string, Set<string>>();
  for (const e of graphData.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  const parents = new Map<string, string | null>();
  const queue: string[] = [];
  for (const n of graphData.nodes) {
    if (n.type === "Theme") { parents.set(n.id, null); queue.push(n.id); }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) || []) {
      if (!parents.has(nb)) { parents.set(nb, cur); queue.push(nb); }
    }
  }
  return parents;
}

function getPathToRoot(nodeId: string, parents: Map<string, string | null>): Set<string> {
  const path = new Set<string>();
  let cur: string | null | undefined = nodeId;
  while (cur) {
    path.add(cur);
    cur = parents.get(cur);
    if (cur === null) break;
  }
  return path;
}

interface CanvasProps {
  data: GraphData | null;
  showLabels: boolean;
  expandedTechs: Set<string>;
  showCompanies: boolean;
  highlightNode: string | null;
  onToggleTech: (techId: string) => void;
  onHighlight: (nodeId: string | null) => void;
}

function GraphCanvas({ data, showLabels, expandedTechs, showCompanies, highlightNode, onToggleTech, onHighlight }: CanvasProps) {
  const layoutChanged = useRef(false);
  const { fitView, setCenter } = useReactFlow();
  const childMap = useMemo(() => (data ? buildChildMap(data) : new Map()), [data]);
  const themeId = useMemo(() => (data ? getThemeId(data) : ""), [data]);
  const parents = useMemo(() => (data ? buildParentMap(data) : new Map()), [data]);
  const highlightPath = useMemo(
    () => highlightNode ? getPathToRoot(highlightNode, parents) : null,
    [highlightNode, parents]
  );
  const lastExpandedRef = useRef<string | null>(null);

  // Which company nodes exist (connected via EXPOSED_TO)
  const companyIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      data.edges.filter((e) => e.type === "EXPOSED_TO").map((e) => e.source)
    );
  }, [data]);

  // Compute visible node ids
  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    if (!data) return s;
    s.add(themeId);
    for (const n of data.nodes) {
      if (n.type === "Technology") s.add(n.id);
    }
    for (const techId of expandedTechs) {
      for (const child of childMap.get(techId) || []) {
        s.add(child.id);
      }
    }
    // Show all companies as one block at the bottom if enabled
    if (showCompanies) {
      for (const cid of companyIds) s.add(cid);
    }
    return s;
  }, [data, themeId, expandedTechs, childMap, showCompanies, companyIds]);

  // Compute visible edges
  const visibleEdges = useMemo(() => {
    if (!data) return new Set<number>();
    const s = new Set<number>();
    data.edges.forEach((e, i) => {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return;
      s.add(i);
    });
    return s;
  }, [data, visibleIds]);

  // Build ReactFlow nodes + edges from visible set
  const { rawNodes, rawEdges, edgeIndex } = useMemo(() => {
    if (!data) return { rawNodes: [] as Node[], rawEdges: [] as Edge[], edgeIndex: new Map<number, string>() };

    const ns: Node[] = [];
    const es: Edge[] = [];
    const idx = new Map<number, string>();

    for (const n of data.nodes) {
      if (!visibleIds.has(n.id)) continue;
      const size = NODE_SIZES[n.type] || NODE_SIZES.Company;
      const isExpandedTech = n.type === "Technology" && expandedTechs.has(n.id);
      const onPath = highlightPath && highlightPath.has(n.id);
      const isClicked = n.id === highlightNode;
      ns.push({
        id: n.id,
        type: "default",
        data: {
          label: n.type === "Technology"
            ? (isExpandedTech ? "▾ " : "▸ ") + n.id
            : n.id,
        },
        position: { x: 0, y: 0 },
        style: {
          background: NODE_COLORS[n.type] || "#ddd",
          color: "#fff",
          border: n.type === "Theme" ? "2px solid #c0392b"
                : isClicked ? "2px solid #333"
                : "none",
          borderRadius: n.type === "Theme" ? 8 : 5,
          padding: n.type === "Theme" ? "10px 20px" : "6px 14px",
          fontWeight: n.type === "Theme" ? 700 : 600,
          fontSize: size.fs,
          width: size.w,
          textAlign: "center" as const,
          cursor: n.type === "Technology" ? "pointer" : "pointer",
          opacity: !highlightPath || onPath ? 1 : 0.15,
        },
      });
    }

    data.edges.forEach((e, i) => {
      if (!visibleEdges.has(i)) return;
      const eType = e.type || "";
      const isCompanyEdge = eType === "EXPOSED_TO";
      const src = isCompanyEdge ? e.target : e.source;
      const tgt = isCompanyEdge ? e.source : e.target;
      const onPath = highlightPath && highlightPath.has(e.source) && highlightPath.has(e.target);
      const hlColor = HIGHLIGHT_COLORS[eType] || NEUTRAL_EDGE;

      es.push({
        id: `e-${i}`,
        source: src,
        target: tgt,
        data: { originalType: eType },
        label: showLabels ? (EDGE_LABELS[eType] || "") : "",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: onPath ? hlColor : NEUTRAL_EDGE },
        style: { stroke: onPath ? hlColor : NEUTRAL_EDGE, strokeWidth: onPath ? 2.5 : 1.3 },
        labelStyle: { fontSize: 9, fill: onPath ? hlColor : "#94a3b8" },
        labelBgStyle: { fill: "rgba(255,255,255,0.8)" },
        labelBgPadding: [3, 2] as [number, number],
        labelBgBorderRadius: 3,
      });
      idx.set(i, `e-${i}`);
    });

    return { rawNodes: ns, rawEdges: es, edgeIndex: idx };
  }, [data, visibleIds, visibleEdges, showLabels, expandedTechs, highlightPath, highlightNode]);

  const layouted = useMemo(() => layoutTree(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted.nodes, layouted.edges, setNodes, setEdges]);

  // fitView on layout changes (expand/collapse), center on expanded node
  useEffect(() => {
    if (layouted.nodes.length === 0) return;
    if (!layoutChanged.current) { layoutChanged.current = true; return; }
    const t = setTimeout(() => {
      if (lastExpandedRef.current) {
        setCenter(
          layouted.nodes.find((n) => n.id === lastExpandedRef.current)?.position?.x ?? 0,
          layouted.nodes.find((n) => n.id === lastExpandedRef.current)?.position?.y ?? 0,
          { zoom: 0.8, duration: 300 }
        );
        lastExpandedRef.current = null;
      } else {
        fitView({ padding: 0.25, duration: 300 });
      }
    }, 200);
    return () => clearTimeout(t);
  }, [layouted.nodes.length, fitView, setCenter, layouted.nodes]);

  useEffect(() => { layoutChanged.current = false; }, [data]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nType = data?.nodes.find((n) => n.id === node.id)?.type;
      if (nType === "Technology") {
        const wasExpanded = expandedTechs.has(node.id);
        if (wasExpanded) {
          onToggleTech(node.id); // collapsing → fitView
        } else {
          lastExpandedRef.current = node.id;
          onToggleTech(node.id); // expanding → center on this node
        }
      } else {
        // Non-tech node: toggle highlight path to root
        onHighlight(highlightNode === node.id ? null : node.id);
      }
    },
    [data, onToggleTech, onHighlight, expandedTechs, highlightNode]
  );

  const handlePaneClick = useCallback(() => onHighlight(null), [onHighlight]);

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
      elementsSelectable={false}
      minZoom={0.1}
      maxZoom={3}
    >
      <Background color="#f1f5f9" gap={20} />
      <Controls position="bottom-right" />
    </ReactFlow>
  );
}

// ---- main component ----

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
  const [showCompanies, setShowCompanies] = useState(false);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);

  const toggleTech = useCallback((techId: string) => {
    setExpandedTechs((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) next.delete(techId);
      else next.add(techId);
      return next;
    });
  }, []);

  const handleHighlight = useCallback((nodeId: string | null) => setHighlightNode(nodeId), []);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const nodeCount = useMemo(() => {
    if (!data) return 0;
    let count = 1 + data.nodes.filter((n) => n.type === "Technology").length;
    for (const techId of expandedTechs) {
      count += data.edges.filter(
        (e) => e.source === techId && (e.type === "USES_MATERIAL" || e.type === "USES_EQUIPMENT")
      ).length;
    }
    if (showCompanies) {
      count += data.edges.filter((e) => e.type === "EXPOSED_TO").length;
    }
    return count;
  }, [data, expandedTechs, showCompanies]);

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
            expandedTechs={expandedTechs}
            showCompanies={showCompanies}
            highlightNode={highlightNode}
            onToggleTech={toggleTech}
            onHighlight={handleHighlight}
          />
        </ReactFlowProvider>

        {/* Toolbar */}
        <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setShowLabels((s) => !s)}
            className={`bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors ${
              showLabels ? "text-blue-600 border-blue-400 bg-blue-50" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {showLabels ? "标签 ON" : "标签"}
          </button>
          <button
            onClick={() => setShowCompanies((s) => !s)}
            className={`bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors ${
              showCompanies ? "text-green-600 border-green-400 bg-green-50" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {showCompanies ? "公司 ON" : "公司"}
          </button>
          {expandedTechs.size > 0 && (
            <button
              onClick={() => { setExpandedTechs(new Set()); setHighlightNode(null); }}
              className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm"
            >
              收起全部
            </button>
          )}
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

        {/* Legend */}
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

        {/* Node count */}
        <div className="absolute top-2 right-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">
          {nodeCount} 可见 / {data.nodes.length} 总计
        </div>

        {/* Fullscreen exit */}
        {fullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-10 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50"
          >
            ✕ 退出全屏 (Esc)
          </button>
        )}
      </div>
    </>
  );
}
