"use client";

import { useEffect, useState } from "react";
import { getTrending } from "@/lib/api";

const FALLBACK_TAGS = [
  "HBM", "低空经济", "核聚变", "AI Agent",
  "人形机器人", "GB300", "光模块", "液冷散热",
  "卫星互联网", "铜连接", "先进封装", "第三代半导体",
];

interface QuickTagsProps {
  onSelect: (tag: string) => void;
  market: string;
}

export default function QuickTags({ onSelect, market }: QuickTagsProps) {
  const [tags, setTags] = useState<{ name: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    getTrending(market).then((topics) => {
      if (ignore) return;
      if (topics.length > 0) {
        setTags(topics);
      }
      setLoading(false);
    });
    return () => { ignore = true; };
  }, [market]);

  const displayTags = tags.length > 0
    ? tags
    : FALLBACK_TAGS.map((name) => ({ name, reason: "" }));

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5">
      {displayTags.map((t) => (
        <button
          key={t.name}
          onClick={() => onSelect(t.name)}
          title={t.reason || undefined}
          className="text-[#777] text-sm border-b border-dotted border-[#ddd] pb-0.5 hover:text-[#0d9488] hover:border-[#14b8a6] transition-colors cursor-pointer bg-transparent"
          style={{ fontFamily: "var(--font-serif)", opacity: loading ? 0.4 : 1 }}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
