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
    <div className="flex flex-wrap gap-2 mt-4">
      {TAGS.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(tag)}
          className="px-4 py-2 rounded-full bg-gray-100 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer border border-transparent hover:border-blue-200"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
