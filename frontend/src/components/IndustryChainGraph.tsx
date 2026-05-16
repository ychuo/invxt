"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from "d3-sankey";
import type { GraphData } from "@/types";

const NODE_COLORS: Record<string, string> = {
  Theme: "#e17055",
  Technology: "#74b9ff",
  Material: "#fdcb6e",
  Equipment: "#a29bfe",
  Product: "#55efc4",
  Company: "#00b894",
};

const LEGEND_ITEMS = [
  { type: "Theme", label: "主题" },
  { type: "Technology", label: "技术方向" },
  { type: "Material", label: "关键材料" },
  { type: "Equipment", label: "关键设备" },
  { type: "Company", label: "相关公司" },
];

interface SankeyDataNode {
  id: string;
  type: string;
  column: number;
}

interface SankeyDataLink {
  source: string;
  target: string;
  value: number;
  edgeType: string;
}

interface Props {
  data: GraphData | null;
}

function buildParentMap(data: GraphData): Map<string, string | null> {
  const adj = new Map<string, Set<string>>();
  for (const e of data.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  const parents = new Map<string, string | null>();
  const queue: string[] = [];
  for (const n of data.nodes) {
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

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
  const [showCompanies, setShowCompanies] = useState(false);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);
  const toggleTech = useCallback((techId: string) => {
    setExpandedTechs((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) next.delete(techId);
      else next.add(techId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Build parent map for highlighting
  const parents = useMemo(() => (data ? buildParentMap(data) : new Map()), [data]);
  const highlightPath = useMemo(
    () => highlightNode ? getPathToRoot(highlightNode, parents) : null,
    [highlightNode, parents]
  );

  // Determine which nodes to show
  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    if (!data) return s;
    const themeId = data.nodes.find((n) => n.type === "Theme")?.id;
    if (themeId) s.add(themeId);
    for (const n of data.nodes) {
      if (n.type === "Technology") s.add(n.id);
    }
    for (const e of data.edges) {
      if (e.type === "USES_MATERIAL" || e.type === "USES_EQUIPMENT") {
        if (expandedTechs.has(e.source)) s.add(e.target);
      }
    }
    if (showCompanies) {
      for (const e of data.edges) {
        if (e.type === "EXPOSED_TO") s.add(e.source);
      }
    }
    return s;
  }, [data, expandedTechs, showCompanies]);

  // Build Sankey nodes/links
  const sankeyData = useMemo(() => {
    if (!data) return { nodes: [] as SankeyDataNode[], links: [] as SankeyDataLink[] };

    const nodes: SankeyDataNode[] = [];
    const nodeCol: Record<string, number> = {};
    const nodeIndex: Record<string, number> = {};

    for (const n of data.nodes) {
      if (!visibleIds.has(n.id)) continue;
      let col: number;
      if (n.type === "Theme") col = 0;
      else if (n.type === "Technology") col = 1;
      else if (n.type === "Material" || n.type === "Equipment" || n.type === "Product") col = 2;
      else col = 3; // Company

      nodeIndex[n.id] = nodes.length;
      nodeCol[n.id] = col;
      nodes.push({ id: n.id, type: n.type, column: col });
    }

    const links: SankeyDataLink[] = [];
    for (const e of data.edges) {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
      const srcCol = nodeCol[e.source] ?? -1;
      const tgtCol = nodeCol[e.target] ?? -1;
      // Only include edges going forward (left to right)
      if (srcCol >= tgtCol) continue;
      links.push({
        source: e.source,
        target: e.target,
        value: 1,
        edgeType: e.type || "",
      });
    }

    // Sort nodes within each column by type then name
    nodes.sort((a, b) => {
      if (a.column !== b.column) return a.column - b.column;
      const ta = a.type === "Theme" ? 0 : a.type === "Technology" ? 1 : a.type === "Equipment" ? 2 : a.type === "Material" ? 3 : 4;
      const tb = b.type === "Theme" ? 0 : b.type === "Technology" ? 1 : b.type === "Equipment" ? 2 : b.type === "Material" ? 3 : 4;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

    return { nodes, links };
  }, [data, visibleIds]);

  // Compute Sankey layout
  const layout = useMemo(() => {
    const { nodes, links } = sankeyData;
    if (nodes.length === 0) return { nodes: [], links: [] };

    // Assign columns
    const colCounts = [0, 0, 0, 0];
    const colAssign: Record<string, number> = {};
    for (const n of nodes) {
      const col = n.column;
      n.column = col;
      colAssign[n.id] = col;
      colCounts[col]++;
    }

    // Map links to indices
    const idxMap = new Map<string, number>();
    nodes.forEach((n, i) => idxMap.set(n.id, i));

    const sankeyLinks: { source: number; target: number; value: number }[] = [];
    const linkMeta: { edgeType: string }[] = [];
    for (const l of links) {
      const si = idxMap.get(l.source);
      const ti = idxMap.get(l.target);
      if (si === undefined || ti === undefined) continue;
      sankeyLinks.push({ source: si, target: ti, value: l.value });
      linkMeta.push({ edgeType: l.edgeType });
    }

    const w = Math.max(1200, 300 * 4);
    const h = Math.max(700, nodes.length * 22);
    const nodeW = 20;

    const generator = sankey<{ id: string; type: string; column: number }, { source: number; target: number; value: number }>()
      .nodeWidth(nodeW)
      .nodePadding(10)
      .extent([[0, 0], [w, h]])
      .nodeAlign((node) => colAssign[node.id ?? ""] ?? 0)
      .iterations(32);

    const result = generator({
      nodes: nodes.map((n) => ({ ...n })),
      links: sankeyLinks,
    });

    return {
      nodes: result.nodes as (SankeyNode<{ id: string; type: string; column: number }, { source: number; target: number; value: number }> & { id: string; type: string })[],
      links: result.links.map((l, i) => ({ ...l, edgeType: linkMeta[i]?.edgeType ?? "" })),
      width: result.width || 960,
      height: Math.max(600, nodes.length * 28),
    };
  }, [sankeyData]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const n = sankeyData.nodes.find((n) => n.id === nodeId);
      if (n?.type === "Technology") {
        toggleTech(nodeId);
        setHighlightNode(null);
      } else {
        setHighlightNode(highlightNode === nodeId ? null : nodeId);
      }
    },
    [sankeyData, toggleTech, highlightNode]
  );

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current) setHighlightNode(null);
  }, []);

  if (!data || data.nodes.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 border rounded-lg">
        暂无图谱数据
      </div>
    );
  }

  const svgHeight = Math.max(layout.height || 600, sankeyData.nodes.length * 24);
  const svgWidth = layout.width || 1200;

  const containerClass = fullscreen
    ? "fixed inset-0 z-50 bg-white flex flex-col"
    : "relative h-96 border rounded-lg overflow-hidden group";

  const svgContent = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="w-full h-full"
      onClick={handleSvgClick}
    >
      {/* Grid lines */}
      <defs>
        {[0, 1, 2, 3].map((col) => {
          const colNodes = layout.nodes.filter((n) => n.column === col);
          if (colNodes.length === 0) return null;
          const x = colNodes[0].x0 ?? (col * svgWidth / 4);
          return (
            <pattern key={`bg-${col}`} id={`bg-${col}`} width="1" height="1">
              <rect x={x} y={0} width={colNodes[0].x1 != null ? colNodes[0].x1 - colNodes[0].x0! : 0} height={svgHeight} fill={col === 0 ? "#fff5f0" : col === 1 ? "#f0f4ff" : col === 2 ? "#fffef0" : "#f0fff8"} opacity={0.4} />
            </pattern>
          );
        })}
      </defs>

      {/* Links */}
      {layout.links.map((link, i) => {
        const isHighlighted =
          !highlightPath ||
          (highlightPath.has((link.source as any).id) && highlightPath.has((link.target as any).id));
        const opacity = !highlightPath || isHighlighted ? 0.45 : 0.04;
        const width = Math.max(1, link.width ?? 1);

        const path = sankeyLinkHorizontal()(link as any);
        if (!path) return null;

        return (
          <path
            key={i}
            d={path}
            fill="none"
            stroke={NODE_COLORS[(link.target as any).type] || "#94a3b8"}
            strokeWidth={width}
            strokeOpacity={opacity}
            className="transition-all duration-300"
          />
        );
      })}

      {/* Nodes */}
      {layout.nodes.map((node) => {
        const x = node.x0 ?? 0;
        const y = node.y0 ?? 0;
        const w = (node.x1 ?? 0) - (node.y0 ?? 0) > 0 ? (node.x1 ?? 0) - x : 140;
        const h = Math.max(20, (node.y1 ?? 0) - y);
        const isExpanded = node.type === "Technology" && expandedTechs.has(node.id as string);
        const isClicked = (node.id as string) === highlightNode;
        const onPath = highlightPath && highlightPath.has(node.id as string);
        const isHovered = (node.id as string) === hoveredNode;
        const opacity = !highlightPath || onPath ? 1 : 0.12;

        return (
          <g
            key={node.id as string}
            transform={`translate(${x},${y})`}
            onClick={() => handleNodeClick(node.id as string)}
            onMouseEnter={() => setHoveredNode(node.id as string)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: "pointer", transition: "opacity 0.2s" }}
            opacity={opacity}
          >
            <rect
              width={Math.max(w, 10)}
              height={h}
              rx={4}
              fill={NODE_COLORS[node.type] || "#ddd"}
              stroke={isClicked ? "#333" : isHovered ? "#666" : "none"}
              strokeWidth={isClicked ? 2 : isHovered ? 1.5 : 0}
            />
            <text
              x={w + 4}
              y={h / 2}
              dy="0.35em"
              fontSize={h > 28 ? 11 : 9}
              fill="#333"
              fontWeight={node.type === "Theme" ? 700 : 600}
              textAnchor="start"
            >
              {(node.type === "Technology" ? (isExpanded ? "▾ " : "▸ ") : "") +
                (node.id as string)}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <>
      <div className={containerClass}>
        <div className={`flex-1 overflow-hidden ${fullscreen ? "" : "h-full"}`}>
          {svgContent}
        </div>

        {/* Toolbar */}
        <div className={`absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap ${fullscreen ? "" : ""}`}>
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

        {/* Stats */}
        <div className="absolute top-2 right-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">
          {sankeyData.nodes.length} 节点 · {sankeyData.links.length} 连线
        </div>

        {/* Fullscreen exit */}
        {fullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-16 z-10 bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 shadow-lg hover:bg-gray-50"
          >
            ✕ 退出 (Esc)
          </button>
        )}
      </div>
    </>
  );
}
