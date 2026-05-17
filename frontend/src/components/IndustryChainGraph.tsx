"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify } from "d3-sankey";
import type { GraphData } from "@/types";

const NODE_COLORS: Record<string, string> = { Theme: "#e17055", Technology: "#74b9ff", Material: "#fdcb6e", Equipment: "#a29bfe", Product: "#55efc4", Company: "#00b894" };
const LEGEND_ITEMS = [{ type: "Theme", label: "主题" },{ type: "Technology", label: "技术方向 ▸点击展开" },{ type: "Material", label: "关键材料" },{ type: "Equipment", label: "关键设备" },{ type: "Company", label: "相关公司" }];

interface Props { data: GraphData | null; }

function buildAdjacency(data: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of data.edges) { if (!adj.has(e.source)) adj.set(e.source, new Set()); if (!adj.has(e.target)) adj.set(e.target, new Set()); adj.get(e.source)!.add(e.target); adj.get(e.target)!.add(e.source); }
  return adj;
}

function getNeighborhood(nodeId: string, adj: Map<string, Set<string>>, nodeTypes: Map<string, string>): Set<string> {
  const nb = new Set<string>(); nb.add(nodeId);
  const clickedType = nodeTypes.get(nodeId);
  for (const n1 of adj.get(nodeId) || []) {
    nb.add(n1);
    // 2-hop only when clicking Material/Equipment: reach Company + Theme via Technology
    if (clickedType === "Material" || clickedType === "Equipment") {
      if (nodeTypes.get(n1) === "Technology") {
        for (const n2 of adj.get(n1) || []) {
          const t2 = nodeTypes.get(n2);
          if (t2 === "Company" || t2 === "Theme") nb.add(n2);
        }
      }
    }
  }
  return nb;
}

export default function IndustryChainGraph({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedTechs, setExpandedTechs] = useState<Set<string>>(new Set());
  const [showCompanies, setShowCompanies] = useState(true);
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const resetKey = useRef(0);

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

  // Auto-center on fullscreen toggle
  useEffect(() => { autoCenter(); }, [fullscreen]);

  const adjacency = useMemo(() => (data ? buildAdjacency(data) : new Map()), [data]);
  const nodeTypes = useMemo(() => { const m = new Map<string,string>(); if (data) for (const n of data.nodes) m.set(n.id, n.type); return m; }, [data]);
  const highlightSet = useMemo(() => highlightNode ? getNeighborhood(highlightNode, adjacency, nodeTypes) : null, [highlightNode, adjacency, nodeTypes]);

  const visibleIds = useMemo(() => {
    const s = new Set<string>(); if (!data) return s;
    const t = data.nodes.find((n) => n.type === "Theme")?.id; if (t) s.add(t);
    for (const n of data.nodes) { if (n.type === "Technology") s.add(n.id); }
    for (const e of data.edges) { if ((e.type==="USES_MATERIAL"||e.type==="USES_EQUIPMENT") && expandedTechs.has(e.source)) s.add(e.target); }
    if (showCompanies) { for (const e of data.edges) { if (e.type==="EXPOSED_TO") s.add(e.source); } }
    return s;
  }, [data, expandedTechs, showCompanies]);

  const sankeyData = useMemo(() => {
    if (!data) return { nodes: [] as { id: string; type: string; column: number }[], links: [] as { source: string; target: string; value: number; edgeType: string }[] };
    const nodes: { id: string; type: string; column: number }[] = [];
    const nodeCol: Record<string, number> = {};
    for (const n of data.nodes) { if (!visibleIds.has(n.id)) continue; const col = n.type==="Theme"?0:n.type==="Company"?1:n.type==="Technology"?2:3; nodeCol[n.id]=col; nodes.push({id:n.id,type:n.type,column:col}); }
    const links: { source: string; target: string; value: number; edgeType: string }[] = [];
    for (const e of data.edges) {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
      const isCo = e.type==="EXPOSED_TO"; const src = isCo ? e.target : e.source, tgt = isCo ? e.source : e.target;
      if ((nodeCol[src]??-1) >= (nodeCol[tgt]??-1)) continue;
      links.push({source:src,target:tgt,value:1,edgeType:e.type||""});
    }
    nodes.sort((a,b)=>{if(a.column!==b.column)return a.column-b.column;const ta=a.type==="Theme"?0:a.type==="Technology"?1:a.type==="Equipment"?2:a.type==="Material"?3:4;const tb=b.type==="Theme"?0:b.type==="Technology"?1:b.type==="Equipment"?2:b.type==="Material"?3:4;return ta-tb||a.id.localeCompare(b.id);});
    return {nodes,links};
  }, [data, visibleIds]);

  const layout = useMemo(() => {
    const {nodes,links}=sankeyData; if (nodes.length===0) return {nodes:[] as any[],links:[] as any[],width:0,height:0};
    const idxMap=new Map<string,number>(); nodes.forEach((n,i)=>idxMap.set(n.id,i));
    const slinks:{source:number;target:number;value:number}[]=[],linkMeta:{edgeType:string}[]=[];
    for(const l of links){const si=idxMap.get(l.source),ti=idxMap.get(l.target);if(si!==undefined&&ti!==undefined){slinks.push({source:si,target:ti,value:l.value});linkMeta.push({edgeType:l.edgeType});}}
    // Compute height based on max nodes per column to prevent overlap
    const cols = [0,0,0,0];
    for (const n of nodes) cols[n.column] = (cols[n.column]||0) + 1;
    const maxCol = Math.max(...cols);
    const h = Math.max(900, maxCol * 38);
    const w = Math.max(1400, 380 * 4);
    const result=sankey<any,any>().nodeWidth(20).nodePadding(28).extent([[0,0],[w,h]]).nodeAlign(sankeyJustify).iterations(32)({nodes:nodes.map(n=>({...n})),links:slinks});
    const colWidth=w/4.5; for(const node of result.nodes){const col=node.column??0;node.x0=col*colWidth;node.x1=node.x0+20;}
    return {nodes:result.nodes,links:result.links.map((l:any,i:number)=>({...l,edgeType:linkMeta[i]?.edgeType??""})),width:w,height:h};
  }, [sankeyData]);

  const autoCenter = useCallback(() => {
    const el = containerRef.current; if (!el||layout.nodes.length===0) return;
    const cw=el.clientWidth,ch=el.clientHeight;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const n of layout.nodes){minX=Math.min(minX,n.x0-100);minY=Math.min(minY,n.y0-10);maxX=Math.max(maxX,n.x1+140);maxY=Math.max(maxY,n.y1+10);}
    const bw=maxX-minX,bh=maxY-minY; if(bw<=0||bh<=0){setPan({x:0,y:0});setZoom(1);return;}
    const z=Math.min(cw/(bw+120),ch/(bh+120),1.5);
    setZoom(z); setPan({x:(cw-bw*z)/2-minX*z,y:(ch-bh*z)/2-minY*z});
  }, [layout.nodes]);

  useEffect(() => { autoCenter(); }, [data, resetKey.current]);
  useEffect(() => { autoCenter(); }, [layout.nodes.length]);
  const doReset = useCallback(() => { resetKey.current++; autoCenter(); }, [autoCenter]);

  const handleNodeClick = useCallback((nodeId: string) => {
    const n = sankeyData.nodes.find((n) => n.id === nodeId);
    if (n?.type === "Technology") { toggleTech(nodeId); setHighlightNode(null); }
    else { setHighlightNode(highlightNode === nodeId ? null : nodeId); }
  }, [sankeyData, toggleTech, highlightNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag==='DIV'||tag==='svg'||tag==='path'||tag==='rect') { dragging.current=true; dragStart.current={x:e.clientX-pan.x,y:e.clientY-pan.y}; }
  }, [pan]);
  const handleMouseMove = useCallback((e: React.MouseEvent) => { if(!dragging.current)return; setPan({x:e.clientX-dragStart.current.x,y:e.clientY-dragStart.current.y}); }, []);
  const handleMouseUp = useCallback(() => { dragging.current=false; }, []);

  // Wheel zoom + Safari gesture pinch — attach to document to capture all events
  const zoomRef2 = useRef(zoom); zoomRef2.current = zoom;
  useEffect(() => {
    const onWheel=(e:WheelEvent)=>{
      // Only handle if the event target is inside our container
      if (!containerRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      const f=e.ctrlKey?(e.deltaY>0?0.93:1.07):(e.deltaY>0?0.9:1.1);
      setZoom((z)=>Math.min(5,Math.max(0.1,z*f)));
    };
    let gs=1;
    const onGestureStart=(e:any)=>{if(!containerRef.current?.contains(e.target as Node))return;e.preventDefault();gs=zoomRef2.current;};
    const onGestureChange=(e:any)=>{if(!containerRef.current?.contains(e.target as Node))return;e.preventDefault();setZoom(Math.min(5,Math.max(0.1,gs*e.scale)));};
    document.addEventListener("wheel",onWheel,{passive:false});
    document.addEventListener("gesturestart",onGestureStart);
    document.addEventListener("gesturechange",onGestureChange);
    return ()=>{document.removeEventListener("wheel",onWheel);document.removeEventListener("gesturestart",onGestureStart);document.removeEventListener("gesturechange",onGestureChange);};
  }, []);

  // Touch pinch zoom — use ref for current zoom to avoid stale closure
  const pinchRef = useRef({ dist: 0, zoom: 1 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el=containerRef.current; if(!el)return;
    const onTS=(e:TouchEvent)=>{if(e.touches.length===2){pinchRef.current.dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);pinchRef.current.zoom=zoomRef.current;}};
    const onTM=(e:TouchEvent)=>{if(e.touches.length!==2||pinchRef.current.dist===0)return;e.preventDefault();const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);setZoom(Math.min(5,Math.max(0.1,pinchRef.current.zoom*(d/pinchRef.current.dist))));};
    const onTE=()=>{pinchRef.current.dist=0;};
    el.addEventListener("touchstart",onTS,{passive:true});
    el.addEventListener("touchmove",onTM,{passive:false});
    el.addEventListener("touchend",onTE);
    return ()=>{el.removeEventListener("touchstart",onTS);el.removeEventListener("touchmove",onTM);el.removeEventListener("touchend",onTE);};
  }, []);

  if (!data || data.nodes.length === 0) return <div className="h-64 flex items-center justify-center text-gray-400 border rounded-lg">暂无图谱数据</div>;

  const svgH = Math.max(layout.height||600, sankeyData.nodes.length*24), svgW = layout.width||1200;
  const containerClass = fullscreen ? "fixed inset-0 z-50 bg-white flex flex-col" : "relative h-96 border rounded-lg overflow-hidden group";

  return (
    <div className={containerClass}>
      <div className={`flex-1 overflow-hidden ${fullscreen?"":"h-full"}`}>
        <div ref={containerRef} className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <div style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,transformOrigin:"0 0"}}>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{width:svgW,height:svgH,minWidth:svgW}}>
              {layout.links.map((link,i)=>{
                const sid=(link.source as any).id||(link.source as any).name||"",tid=(link.target as any).id||(link.target as any).name||"";
                const on=!highlightSet||(highlightSet.has(sid)&&highlightSet.has(tid));
                const p=sankeyLinkHorizontal()(link as any); if(!p)return null;
                return <path key={i} d={p} fill="none" stroke={NODE_COLORS[(link.target as any).type]||"#94a3b8"} strokeWidth={Math.max(1,link.width??1)} strokeOpacity={!highlightSet||on?0.45:0.04}/>;
              })}
              {layout.nodes.map((node)=>{
                const x=node.x0??0,y=node.y0??0,w=(node.x1??0)-x,h=Math.max(20,(node.y1??0)-y);
                const isExpanded=node.type==="Technology"&&expandedTechs.has(node.id as string);
                const onPath=highlightSet&&highlightSet.has(node.id as string);
                return (
                  <g key={node.id as string} transform={`translate(${x},${y})`} onClick={(e)=>{e.stopPropagation();handleNodeClick(node.id as string);}} style={{cursor:"pointer"}} opacity={!highlightSet||onPath?1:0.12}>
                    <rect width={Math.max(w,10)} height={h} rx={4} fill={NODE_COLORS[node.type]||"#ddd"} stroke={node.id===highlightNode?"#333":"none"} strokeWidth={node.id===highlightNode?2:0}/>
                    <text x={w+4} y={h/2} dy="0.35em" fontSize={h>28?11:9} fill="#333" fontWeight={node.type==="Theme"?700:600} textAnchor="start">{(node.type==="Technology"?(isExpanded?"▾ ":"▸ "):"")+(node.id as string)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap">
        <button onClick={()=>setShowCompanies((s)=>!s)} className={`bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium shadow-sm ${showCompanies?"text-green-600 border-green-400 bg-green-50":"text-gray-500 hover:text-gray-700"}`}>{showCompanies?"公司 ON":"公司"}</button>
        {expandedTechs.size>0&&<button onClick={()=>{setExpandedTechs(new Set());setHighlightNode(null);}} className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm">收起全部</button>}
        {highlightNode&&<button onClick={()=>setHighlightNode(null)} className="bg-white/95 border border-orange-300 rounded px-2.5 py-1.5 text-xs font-medium text-orange-600 shadow-sm">清除高亮</button>}
        {!fullscreen&&<button onClick={toggleFullscreen} className="bg-white/95 border rounded px-2.5 py-1.5 text-xs font-medium text-gray-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-700">⛶ 全屏</button>}
      </div>

      <div className="absolute top-2 right-2 z-10 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">{sankeyData.nodes.length} 节点 · {sankeyData.links.length} 连线</div>
      {fullscreen&&<button onClick={toggleFullscreen} className="absolute top-8 right-2 z-10 bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 shadow-lg hover:bg-gray-50">✕ 退出 (Esc)</button>}

      <div className="absolute bottom-2 left-2 z-10 bg-white/90 border rounded-lg px-3 py-2 shadow-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{LEGEND_ITEMS.map((item)=>(<div key={item.type} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{background:NODE_COLORS[item.type]}}/><span className="text-gray-500">{item.label}</span></div>))}</div>
      </div>

      <div className="absolute bottom-2 right-2 z-10 flex gap-1">
        <button onClick={()=>setZoom((z)=>Math.min(5,z*1.2))} className="bg-white/95 border rounded w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm text-sm font-bold">+</button>
        <button onClick={()=>setZoom((z)=>Math.max(0.1,z/1.2))} className="bg-white/95 border rounded w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm text-sm font-bold">−</button>
        <button onClick={doReset} className="bg-white/95 border rounded px-2 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm text-xs">复位</button>
      </div>
    </div>
  );
}
