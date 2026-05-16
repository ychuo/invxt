"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import QuickTags from "@/components/QuickTags";
import MarketToggle from "@/components/MarketToggle";

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
        <h1 className="text-4xl font-bold mb-2">Invxt</h1>
        <p className="text-gray-500 text-lg mb-8">
          产业链智能分析 · 主题 → 公司映射
        </p>

        <div className="mb-4">
          <MarketToggle value={market} onChange={setMarket} />
        </div>

        <SearchBar onSearch={handleSearch} loading={loading} />
        <QuickTags onSelect={handleSearch} />
      </div>
    </main>
  );
}
