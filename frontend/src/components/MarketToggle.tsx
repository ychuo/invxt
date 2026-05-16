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
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
