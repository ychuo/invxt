"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify } from "d3-sankey";
import type { GraphData } from "@/types";

const NODE_COLORS: Record<string, string> = {
  Theme: "#e17055", Technology: "#74b9ff", Material: "#fdcb6e",
  Equipment: "#a29bfe", Product: "#55efc4", Company: "#00b894",
};
const LEGEND_ITEMS = [
  { type: "Theme", label: "主题" }, { type: "Technology", label: "技术方向" },
  { type: "Material", label: "关键材料" }, { type: "Equipment", label: "关键设备" },
  { type: "Company", label: "相关公司" },
];

interface SankeyDataNode { id: string; type: string; column: number; }
interface SankeyDataLink { source: string; target: string; value: number; edgeType: string; }
interface Props { data: GraphData | null; }

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
  for (const n of data.nodes) { if (n.type === "Theme") { parents.set(n.id, null); queue.push(n.id); } }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) || []) { if (!parents.has(nb)) { parents.set(nb, cur); queue.push(nb); } }
  }
  return parents;
}

// Build adjacency map for neighborhood highlight
function buildAdjacency(data: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of data.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  return adj;
}

// Smart highlight: 1-hop + expand through tech nodes only (not Theme, which connects everything)
function getNeighborhood(nodeId: string, adj: Map<string, Set<string>>, nodeTypes: Map<string, string>): Set<string> {
  const nb = new Set<string>();
  nb.add(nodeId);
  for (const n1 of adj.get(nodeId) || []) {
    nb.add(n1);
    // Only traverse deeper if n1 is a Technology node (not Theme which connects to all companies)
    if (nodeTypes.get(n1) === "Technology") {
      for (const n2 of adj.get(n1) || []) nb.add(n2);
    }
  }
  return nb;
}

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
  const [showCompanies, setShowCompanies] = useState(false);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const resetKey = useRef(0);
  const lastPinchDist = useRef<number>(0);
  const lastPinchZoom = useRef(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);
  const toggleTech = useCallback((techId: string) => {
    setExpandedTechs((prev) => { const next = new Set(prev); if (next.has(techId)) next.delete(techId); else next.add(techId); return next; });
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const adjacency = useMemo(() => (data ? buildAdjacency(data) : new Map()), [data]);
  const nodeTypes = useMemo(() => { const m = new Map<string, string>(); if (data) for (const n of data.nodes) m.set(n.id, n.type); return m; }, [data]);
  const highlightSet = useMemo(() => highlightNode ? getNeighborhood(highlightNode, adjacency, nodeTypes) : null, [highlightNode, adjacency, nodeTypes]);

  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    if (!data) return s;
    const themeId = data.nodes.find((n) => n.type === "Theme")?.id;
    if (themeId) s.add(themeId);
    for (const n of data.nodes) { if (n.type === "Technology") s.add(n.id); }
    for (const e of data.edges) { if ((e.type === "USES_MATERIAL" || e.type === "USES_EQUIPMENT") && expandedTechs.has(e.source)) s.add(e.target); }
    if (showCompanies) { for (const e of data.edges) { if (e.type === "EXPOSED_TO") s.add(e.source); } }
    return s;
  }, [data, expandedTechs, showCompanies]);

  const sankeyData = useMemo(() => {
    if (!data) return { nodes: [] as SankeyDataNode[], links: [] as SankeyDataLink[] };
    const nodes: SankeyDataNode[] = [];
    const nodeCol: Record<string, number> = {};
    for (const n of data.nodes) {
      if (!visibleIds.has(n.id)) continue;
      let col = n.type === "Theme" ? 0 : n.type === "Company" ? 1 : n.type === "Technology" ? 2 : 3;
      nodeCol[n.id] = col;
      nodes.push({ id: n.id, type: n.type, column: col });
    }
    const links: SankeyDataLink[] = [];
    for (const e of data.edges) {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
      const isCompanyEdge = e.type === "EXPOSED_TO";
      const src = isCompanyEdge ? e.target : e.source;
      const tgt = isCompanyEdge ? e.source : e.target;
      if ((nodeCol[src] ?? -1) >= (nodeCol[tgt] ?? -1)) continue;
      links.push({ source: src, target: tgt, value: 1, edgeType: e.type || "" });
    }
    nodes.sort((a, b) => { if (a.column !== b.column) return a.column - b.column; const ta = a.type === "Theme"?0:a.type==="Technology"?1:a.type==="Equipment"?2:a.type==="Material"?3:4; const tb = b.type === "Theme"?0:b.type==="Technology"?1:b.type==="Equipment"?2:b.type==="Material"?3:4; if (ta!==tb) return ta-tb; return a.id.localeCompare(b.id); });
    return { nodes, links };
  }, [data, visibleIds]);

  const layout = useMemo(() => {
    const { nodes, links } = sankeyData;
    if (nodes.length === 0) return { nodes: [] as any[], links: [] as any[], width: 0, height: 0 };
    const idxMap = new Map<string, number>();
    nodes.forEach((n, i) => idxMap.set(n.id, i));
    const slinks: { source: number; target: number; value: number }[] = [];
    const linkMeta: { edgeType: string }[] = [];
    for (const l of links) {
      const si = idxMap.get(l.source), ti = idxMap.get(l.target);
      if (si === undefined || ti === undefined) continue;
      slinks.push({ source: si, target: ti, value: l.value });
      linkMeta.push({ edgeType: l.edgeType });
    }
    const w = Math.max(1200, 300 * 4), h = Math.max(700, nodes.length * 22), nodeW = 20;
    const result = sankey<any, any>().nodeWidth(nodeW).nodePadding(10).extent([[0,0],[w,h]]).nodeAlign(sankeyJustify).iterations(32)({ nodes: nodes.map(n=>({...n})), links: slinks });
    const colWidth = w / 4;
    for (const node of result.nodes) { const col = node.column ?? 0; node.x0 = col * colWidth; node.x1 = node.x0 + nodeW; }
    return { nodes: result.nodes, links: result.links.map((l:any,i:number)=>({...l, edgeType: linkMeta[i]?.edgeType??""})), width: w, height: h };
  }, [sankeyData]);

  // Auto-center on first load / after reset
  const autoCenter = useCallback(() => {
    const el = containerRef.current;
    if (!el || layout.nodes.length === 0) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    // Compute bounding box of all nodes in SVG coords
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of layout.nodes) {
      minX = Math.min(minX, n.x0 - 100); // include text label space
      minY = Math.min(minY, n.y0 - 10);
      maxX = Math.max(maxX, n.x1 + 140);
      maxY = Math.max(maxY, n.y1 + 10);
    }
    const bw = maxX - minX, bh = maxY - minY;
    if (bw <= 0 || bh <= 0) { setPan({ x: 0, y: 0 }); setZoom(1); return; }
    const pad = 60;
    const z = Math.min(cw / (bw + pad * 2), ch / (bh + pad * 2), 1.5);
    const px = (cw - bw * z) / 2 - minX * z;
    const py = (ch - bh * z) / 2 - minY * z;
    setZoom(z);
    setPan({ x: px, y: py });
  }, [layout.nodes]);

  // Auto-center on data change
  useEffect(() => { autoCenter(); }, [data, resetKey.current]);
  // Auto-center when layout changes (expand/collapse)
  useEffect(() => { autoCenter(); }, [layout.nodes.length]);

  const doReset = useCallback(() => { resetKey.current++; autoCenter(); }, [autoCenter]);

  const handleNodeClick = useCallback((nodeId: string) => {
    const n = sankeyData.nodes.find((n) => n.id === nodeId);
    if (n?.type === "Technology") { toggleTech(nodeId); setHighlightNode(null); }
    else { setHighlightNode(highlightNode === nodeId ? null : nodeId); }
  }, [sankeyData, toggleTech, highlightNode]);

  // Mouse drag pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).tagName === 'DIV') {
      dragging.current = true;
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);
  const handleMouseMove = useCallback((e: React.MouseEvent) => { if (!dragging.current) return; setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }, []);
  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const factor = e.ctrlKey ? Math.exp(-e.deltaY / 100) : (e.deltaY > 0 ? 0.9 : 1.1); setZoom((z) => Math.min(5, Math.max(0.15, z * factor))); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Touch pinch zoom
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) { lastPinchDist.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); lastPinchZoom.current = zoomRef.current; } };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastPinchDist.current === 0) return;
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setZoom(Math.min(5, Math.max(0.15, lastPinchZoom.current * (dist / lastPinchDist.current))));
    };
    const onTouchEnd = () => { lastPinchDist.current = 0; };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => { el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); el.removeEventListener("touchend", onTouchEnd); };
  }, []);

  if (!data || data.nodes.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400 border rounded-lg">暂无图谱数据</div>;
  }

  const svgHeight = Math.max(layout.height || 600, sankeyData.nodes.length * 24);
  const svgWidth = layout.width || 1200;
  const containerClass = fullscreen ? "fixed inset-0 z-50 bg-white flex flex-col" : "relative h-96 border rounded-lg overflow-hidden group";

  return (
    <>
      <div className={containerClass}>
        <div className={`flex-1 overflow-hidden ${fullscreen ? "" : "h-full"}`}>
          <div
            ref={containerRef}
            className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: "none" }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          >
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: svgWidth, height: svgHeight, minWidth: svgWidth }} onClick={() => setHighlightNode(null)}>
                {/* Links */}
                {layout.links.map((link, i) => {
                  const sid = (link.source as any).id || (link.source as any).name || "";
                  const tid = (link.target as any).id || (link.target as any).name || "";
                  const onPath = !highlightSet || (highlightSet.has(sid) && highlightSet.has(tid));
                  const w = Math.max(1, link.width ?? 1);
                  const p = sankeyLinkHorizontal()(link as any);
                  if (!p) return null;
                  return <path key={i} d={p} fill="none" stroke={NODE_COLORS[(link.target as any).type] || "#94a3b8"} strokeWidth={w} strokeOpacity={!highlightSet || onPath ? 0.45 : 0.04} />;
                })}
                {/* Nodes */}
                {layout.nodes.map((node) => {
                  const x = node.x0 ?? 0, y = node.y0 ?? 0, w = (node.x1 ?? 0) - x, h = Math.max(20, (node.y1 ?? 0) - y);
                  const isExpanded = node.type === "Technology" && expandedTechs.has(node.id as string);
                  const onPath = highlightSet && highlightSet.has(node.id as string);
                  return (
                    <g key={node.id as string} transform={`translate(${x},${y})`} onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id as string); }}
                       onMouseEnter={() => {}} onMouseLeave={() => {}} style={{ cursor: "pointer" }} opacity={!highlightSet || onPath ? 1 : 0.12}>
                      <rect width={Math.max(w, 10)} height={h} rx={4} fill={NODE_COLORS[node.type] || "#ddd"} stroke={node.id === highlightNode ? "#333" : "none"} strokeWidth={node.id === highlightNode ? 2 : 0} />
                      <text x={w + 4} y={h / 2} dy="0.35em" fontSize={h > 28 ? 11 : 9} fill="#333" fontWeight={node.type === "Theme" ? 700 : 600} textAnchor="start">
                        {(node.type === "Technology" ? (isExpanded ? "▾ " : "▸ ") : "") + (node.id as string)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Toolbar top-left */}
        <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap">
          <button onClick={() => setShowCompanies((s) => !s)} className={`bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium shadow-sm ${showCompanies ? "text-green-600 border-green-400 bg-green-50" : "text-gray-500 hover:text-gray-700"}`}>{showCompanies ? "公司 ON" : "公司"}</button>
          {expandedTechs.size > 0 && <button onClick={() => { setExpandedTechs(new Set()); setHighlightNode(null); }} className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm">收起全部</button>}
          {highlightNode && <button onClick={() => setHighlightNode(null)} className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm">清除高亮</button>}
          {!fullscreen && <button onClick={toggleFullscreen} className="bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium text-gray-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-700">⛶ 全屏</button>}
        </div>

        {/* Stats top-right */}
        <div className="absolute top-2 right-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">{sankeyData.nodes.length} 节点 · {sankeyData.links.length} 连线</div>

        {/* Fullscreen exit top-right, BELOW stats */}
        {fullscreen && <button onClick={toggleFullscreen} className="absolute top-8 right-2 z-10 bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 shadow-lg hover:bg-gray-50">✕ 退出 (Esc)</button>}

        {/* Legend bottom-left */}
        <div className="absolute bottom-2 left-2 z-10 bg-white/90 border rounded-lg px-3 py-2 shadow-sm">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {LEGEND_ITEMS.map((item) => (<div key={item.type} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: NODE_COLORS[item.type] }} /><span className="text-gray-500">{item.label}</span></div>))}
          </div>
        </div>

        {/* Zoom controls bottom-right */}
        <div className="absolute bottom-2 right-2 z-10 flex gap-1">
          <button onClick={() => setZoom((z) => Math.min(5, z * 1.2))} className="bg-white/95 border rounded w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm text-sm font-bold">+</button>
          <button onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))} className="bg-white/95 border rounded w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm text-sm font-bold">−</button>
          <button onClick={doReset} className="bg-white/95 border rounded px-2 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm text-xs">复位</button>
        </div>
      </div>
    </>
  );
}
