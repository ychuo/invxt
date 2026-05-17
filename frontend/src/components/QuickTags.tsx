"use client";

const TAGS = [
  "HBM", "低空经济", "核聚变", "AI Agent",
  "人形机器人", "GB300", "光模块", "液冷散热",
  "卫星互联网", "铜连接", "先进封装", "第三代半导体",
];

interface QuickTagsProps {
  onSelect: (tag: string) => void;
}

export default function QuickTags({ onSelect }: QuickTagsProps) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5">
      {TAGS.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(tag)}
          className="text-[#777] text-sm border-b border-dotted border-[#ddd] pb-0.5 hover:text-[#0d9488] hover:border-[#14b8a6] transition-colors cursor-pointer bg-transparent"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
