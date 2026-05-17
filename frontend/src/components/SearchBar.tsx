"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (topic: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex gap-2 border border-[#e5e7eb] rounded-xl p-1.5 shadow-sm focus-within:border-[#14b8a6] focus-within:ring-2 focus-within:ring-[#ccfbf1] transition-all">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入主题，例如：HBM、低空经济..."
          className="flex-1 px-4 py-3 text-base outline-none rounded-lg placeholder-[#bbb] italic"
          style={{ fontFamily: "var(--font-serif)" }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="text-white px-6 py-3 rounded-lg font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{
            background: "linear-gradient(135deg, #0d9488, #14b8a6)",
            fontFamily: "var(--font-serif)",
          }}
        >
          {loading ? "分析中..." : "开始分析 →"}
        </button>
      </div>
    </form>
  );
}
