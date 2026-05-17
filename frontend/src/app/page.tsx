"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import QuickTags from "@/components/QuickTags";
import MarketToggle from "@/components/MarketToggle";

function GraphSeparator() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" className="flex-shrink-0 mx-3">
      <circle cx="6" cy="6" r="2" fill="#5eead4" opacity="0.5"/>
      <circle cx="16" cy="6" r="2" fill="#0d9488" opacity="0.5"/>
      <circle cx="11" cy="16" r="2.5" fill="#14b8a6" opacity="0.4"/>
      <line x1="7.5" y1="7" x2="10" y2="14.5" stroke="#99f6e4" strokeWidth="1"/>
      <line x1="14.5" y1="7" x2="12" y2="14.5" stroke="#99f6e4" strokeWidth="1"/>
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [market, setMarket] = useState("A");
  const [loading, setLoading] = useState(false);

  const handleSearch = (topic: string) => {
    setLoading(true);
    router.push(`/analysis?q=${encodeURIComponent(topic)}&market=${market}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <MarketToggle value={market} onChange={setMarket} />
        </div>

        <div className="mb-3">
          <span style={{ fontFamily: "var(--font-serif)" }} className="text-[44px] font-bold text-[#111] tracking-tight">Inv</span>
          <span style={{ fontFamily: "var(--font-serif)", background: "linear-gradient(135deg, #0d9488, #14b8a6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }} className="text-[44px] font-bold">X</span>
          <span style={{ fontFamily: "var(--font-serif)" }} className="text-[44px] font-bold text-[#111]">t</span>
        </div>

        <div className="flex items-center mb-8">
          <span style={{ fontFamily: "var(--font-serif)" }} className="text-[15px] text-[#888]">产业链智能分析引擎</span>
          <GraphSeparator />
          <span style={{ fontFamily: "var(--font-serif)" }} className="text-[15px] text-[#888]">从模糊主题到结构化投资机会</span>
        </div>

        <SearchBar onSearch={handleSearch} loading={loading} />
        <QuickTags onSelect={handleSearch} market={market} />
      </div>
    </main>
  );
}
