"use client";

import { useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
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

export default function IndustryChainGraph({ data }: Props) {
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

  const [nodes, _, onNodesChange] = useNodesState(initialNodes);
  const [edges, __, onEdgesChange] = useEdgesState(initialEdges);

  if (!data || data.nodes.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 border rounded-lg">
        暂无图谱数据
      </div>
    );
  }

  return (
    <div className="h-80 border rounded-lg overflow-hidden">
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
    </div>
  );
}
