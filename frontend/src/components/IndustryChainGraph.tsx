"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import ReactFlow, { Node, Edge, Background, Controls, MarkerType, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import { sankey, sankeyJustify } from "d3-sankey";
import type { GraphData } from "@/types";

const NODE_COLORS: Record<string, string> = { Theme: "#e17055", Technology: "#74b9ff", Material: "#fdcb6e", Equipment: "#a29bfe", Company: "#00b894" };
const NODE_SIZES: Record<string, { w: number; h: number; fs: number }> = { Theme: { w: 200, h: 36, fs: 14 }, Technology: { w: 180, h: 32, fs: 12 }, Company: { w: 150, h: 28, fs: 11 }, Material: { w: 130, h: 24, fs: 10 }, Equipment: { w: 130, h: 24, fs: 10 } };
const LEGEND_ITEMS = [{ type: "Theme", label: "主题" },{ type: "Technology", label: "技术方向" },{ type: "Material", label: "关键材料" },{ type: "Equipment", label: "关键设备" },{ type: "Company", label: "相关公司" }];

interface Props { data: GraphData | null; }

function buildAdjacency(data: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of data.edges) { if (!adj.has(e.source)) adj.set(e.source, new Set()); if (!adj.has(e.target)) adj.set(e.target, new Set()); adj.get(e.source)!.add(e.target); adj.get(e.target)!.add(e.source); }
  return adj;
}

function getNeighborhood(nodeId: string, adj: Map<string, Set<string>>, nodeTypes: Map<string, string>): Set<string> {
  const nb = new Set<string>(); nb.add(nodeId);
  for (const n1 of adj.get(nodeId) || []) { nb.add(n1); if (nodeTypes.get(n1) === "Technology") for (const n2 of adj.get(n1) || []) nb.add(n2); }
  return nb;
}

function buildSankeyLayout(data: GraphData, visibleIds: Set<string>, expandedTechs: Set<string>) {
  const nodes: { id: string; type: string; column: number }[] = [];
  const nodeCol: Record<string, number> = {};
  for (const n of data.nodes) {
    if (!visibleIds.has(n.id)) continue;
    const col = n.type === "Theme" ? 0 : n.type === "Company" ? 1 : n.type === "Technology" ? 2 : 3;
    nodeCol[n.id] = col;
    nodes.push({ id: n.id, type: n.type, column: col });
  }
  const links: { source: string; target: string; value: number; edgeType: string }[] = [];
  for (const e of data.edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
    const isCompanyEdge = e.type === "EXPOSED_TO";
    const src = isCompanyEdge ? e.target : e.source, tgt = isCompanyEdge ? e.source : e.target;
    if ((nodeCol[src] ?? -1) >= (nodeCol[tgt] ?? -1)) continue;
    links.push({ source: src, target: tgt, value: 1, edgeType: e.type || "" });
  }
  nodes.sort((a, b) => { if (a.column !== b.column) return a.column - b.column; const ta = a.type==="Theme"?0:a.type==="Technology"?1:a.type==="Equipment"?2:a.type==="Material"?3:4; const tb = b.type==="Theme"?0:b.type==="Technology"?1:b.type==="Equipment"?2:b.type==="Material"?3:4; if (ta!==tb) return ta-tb; return a.id.localeCompare(b.id); });
  const idxMap = new Map<string, number>(); nodes.forEach((n, i) => idxMap.set(n.id, i));
  const slinks: { source: number; target: number; value: number }[] = [], linkMeta: { edgeType: string }[] = [];
  for (const l of links) { const si = idxMap.get(l.source), ti = idxMap.get(l.target); if (si !== undefined && ti !== undefined) { slinks.push({ source: si, target: ti, value: l.value }); linkMeta.push({ edgeType: l.edgeType }); } }
  const w = Math.max(1200, 300 * 4), h = Math.max(700, nodes.length * 22);
  const result = sankey<any, any>().nodeWidth(20).nodePadding(10).extent([[0,0],[w,h]]).nodeAlign(sankeyJustify).iterations(32)({ nodes: nodes.map(n=>({...n})), links: slinks });
  const colWidth = w / 4;
  for (const node of result.nodes) { const col = node.column ?? 0; node.x0 = col * colWidth; node.x1 = node.x0 + 20; }
  return { sankeyNodes: result.nodes as any[], sankeyLinks: result.links.map((l:any,i:number)=>({...l, edgeType: linkMeta[i]?.edgeType??""})), width: w, height: h };
}

function SankeyCanvas({ data, expandedTechs, showCompanies, highlightNode, onToggleTech, onHighlight }: {
  data: GraphData; expandedTechs: Set<string>; showCompanies: boolean; highlightNode: string | null; onToggleTech: (id: string) => void; onHighlight: (id: string | null) => void;
}) {
  const { fitView } = useReactFlow();
  const didFit = useRef(false);

  const adjacency = useMemo(() => buildAdjacency(data), [data]);
  const nodeTypes = useMemo(() => { const m = new Map<string,string>(); for (const n of data.nodes) m.set(n.id, n.type); return m; }, [data]);
  const highlightSet = useMemo(() => highlightNode ? getNeighborhood(highlightNode, adjacency, nodeTypes) : null, [highlightNode, adjacency, nodeTypes]);

  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    const themeId = data.nodes.find((n) => n.type === "Theme")?.id; if (themeId) s.add(themeId);
    for (const n of data.nodes) { if (n.type === "Technology") s.add(n.id); }
    for (const e of data.edges) { if ((e.type === "USES_MATERIAL" || e.type === "USES_EQUIPMENT") && expandedTechs.has(e.source)) s.add(e.target); }
    if (showCompanies) { for (const e of data.edges) { if (e.type === "EXPOSED_TO") s.add(e.source); } }
    return s;
  }, [data, expandedTechs, showCompanies]);

  const layout = useMemo(() => buildSankeyLayout(data, visibleIds, expandedTechs), [data, visibleIds]);

  const { rfNodes, rfEdges } = useMemo(() => {
    const ns: Node[] = [], es: Edge[] = [];
    for (const sn of layout.sankeyNodes) {
      const size = NODE_SIZES[sn.type] || NODE_SIZES.Company;
      const isExpanded = sn.type === "Technology" && expandedTechs.has(sn.id);
      const onPath = highlightSet && highlightSet.has(sn.id);
      ns.push({
        id: sn.id, type: "default",
        position: { x: sn.x0 ?? 0, y: sn.y0 ?? 0 },
        data: { label: (sn.type === "Technology" ? (isExpanded ? "▾ " : "▸ ") : "") + sn.id },
        style: { background: NODE_COLORS[sn.type] || "#ddd", color: "#fff", border: sn.id === highlightNode ? "2px solid #333" : "none", borderRadius: 4, padding: "4px 10px", fontWeight: sn.type === "Theme" ? 700 : 600, fontSize: size.fs, width: size.w, opacity: !highlightSet || onPath ? 1 : 0.12 },
      });
    }
    for (const sl of layout.sankeyLinks) {
      const sid = sl.source.id || sl.source, tid = sl.target.id || sl.target;
      const onPath = !highlightSet || (highlightSet.has(sid) && highlightSet.has(tid));
      // Create a smoothstep path: source (right edge) → target (left edge)
      const srcNode = layout.sankeyNodes.find((n: any) => n.id === sid);
      const tgtNode = layout.sankeyNodes.find((n: any) => n.id === tid);
      const sx = (srcNode?.x1 ?? 0), sy = ((srcNode?.y0 ?? 0) + (srcNode?.y1 ?? 0)) / 2;
      const tx = (tgtNode?.x0 ?? 0), ty = ((tgtNode?.y0 ?? 0) + (tgtNode?.y1 ?? 0)) / 2;
      es.push({
        id: `e-${sid}-${tid}-${Math.random().toString(36).slice(2,6)}`,
        source: sid, target: tid,
        type: "smoothstep",
        sourcePosition: "right" as any, targetPosition: "left" as any,
        style: { stroke: NODE_COLORS[(sl.target as any).type] || "#94a3b8", strokeWidth: Math.max(1, (sl.width ?? 1) * 1.5), opacity: !highlightSet || onPath ? 0.4 : 0.03 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: NODE_COLORS[(sl.target as any).type] || "#94a3b8" },
        data: { sx, sy, tx, ty },
      });
    }
    return { rfNodes: ns, rfEdges: es };
  }, [layout, expandedTechs, highlightSet, highlightNode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => { setNodes(rfNodes); setEdges(rfEdges); }, [rfNodes, rfEdges, setNodes, setEdges]);

  useEffect(() => {
    if (!didFit.current && rfNodes.length > 0) { didFit.current = true; setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 200); }
  }, [rfNodes.length, fitView]);

  useEffect(() => { didFit.current = false; }, [data]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    const n = data.nodes.find((x) => x.id === node.id);
    if (n?.type === "Technology") { onToggleTech(node.id); onHighlight(null); }
    else { onHighlight(highlightNode === node.id ? null : node.id); }
  }, [data, onToggleTech, onHighlight, highlightNode]);

  return (
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} onPaneClick={() => onHighlight(null)} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.05} maxZoom={5}>
      <Background color="#f1f5f9" gap={20} />
      <Controls position="bottom-right" />
    </ReactFlow>
  );
}

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
  const [showCompanies, setShowCompanies] = useState(false);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);

  const toggleTech = useCallback((techId: string) => { setExpandedTechs((prev) => { const next = new Set(prev); if (next.has(techId)) next.delete(techId); else next.add(techId); return next; }); }, []);

  useEffect(() => { if (!fullscreen) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [fullscreen]);

  if (!data || data.nodes.length === 0) return <div className="h-64 flex items-center justify-center text-gray-400 border rounded-lg">暂无图谱数据</div>;

  const containerClass = fullscreen ? "fixed inset-0 z-50 bg-white flex flex-col" : "relative h-96 border rounded-lg overflow-hidden group";
  const nodeCount = data.nodes.filter((n) => n.type === "Technology").length + 1;

  return (
    <>
      <div className={containerClass}>
        <div className={`flex-1 ${fullscreen ? "" : "h-full"}`}>
          <ReactFlowProvider>
            <SankeyCanvas data={data} expandedTechs={expandedTechs} showCompanies={showCompanies} highlightNode={highlightNode} onToggleTech={toggleTech} onHighlight={setHighlightNode} />
          </ReactFlowProvider>
        </div>

        <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap">
          <button onClick={() => setShowCompanies((s) => !s)} className={`bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium shadow-sm ${showCompanies ? "text-green-600 border-green-400 bg-green-50" : "text-gray-500 hover:text-gray-700"}`}>{showCompanies ? "公司 ON" : "公司"}</button>
          {expandedTechs.size > 0 && <button onClick={() => { setExpandedTechs(new Set()); setHighlightNode(null); }} className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm">收起全部</button>}
          {highlightNode && <button onClick={() => setHighlightNode(null)} className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm">清除高亮</button>}
          {!fullscreen && <button onClick={() => setFullscreen(true)} className="bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium text-gray-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-700">⛶ 全屏</button>}
        </div>

        <div className="absolute top-2 right-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">{nodeCount}+ 节点</div>
        {fullscreen && <button onClick={() => setFullscreen(false)} className="absolute top-9 right-2 z-10 bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 shadow-lg hover:bg-gray-50">✕ 退出 (Esc)</button>}

        <div className="absolute bottom-2 left-2 z-10 bg-white/90 border rounded-lg px-3 py-2 shadow-sm">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {LEGEND_ITEMS.map((item) => (<div key={item.type} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: NODE_COLORS[item.type] }} /><span className="text-gray-500">{item.label}</span></div>))}
          </div>
        </div>
      </div>
    </>
  );
}
