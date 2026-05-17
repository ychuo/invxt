"use client";

const OPTIONS = [
  { value: "A", label: "A股" },
  { value: "US", label: "美股" },
  { value: "all", label: "全部" },
] as const;

interface MarketToggleProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MarketToggle({ value, onChange }: MarketToggleProps) {
  return (
    <div className="inline-flex gap-1 bg-[#f5f5f5] rounded-lg p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
            value === opt.value
              ? "bg-white text-[#0f766e] shadow-sm"
              : "text-[#999] hover:text-[#666]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
