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
      <div className="flex gap-2 border-2 border-blue-600 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-blue-200">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="输入主题，例如：HBM、低空经济、人形机器人..."
          className="flex-1 px-4 py-3 text-lg outline-none rounded-lg"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "分析中..." : "开始分析"}
        </button>
      </div>
    </form>
  );
}
