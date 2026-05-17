# InvXt UI 系统性翻新 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系统性翻新 InvXt 前端 UI，统一视觉语言（Georgia 衬线、青绿主色），提升可读性和精致感。

**Architecture:** 纯前端 CSS/组件层改动，不改后端、不新增依赖、不改数据流。从设计 tokens（CSS 变量）开始，逐组件推进，确保每步可独立验证。

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS, TypeScript, React

---

### Task 1: 设计 Tokens 与全局样式

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: 替换 globals.css 为设计系统**

用设计 tokens 替换当前仅含 Tailwind 指令的 globals.css：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-accent: #0d9488;
  --color-accent-light: #14b8a6;
  --color-accent-bg: #f0fdfa;
  --color-accent-border: #ccfbf1;
  --color-accent-text: #0f766e;
  --color-positive: #0d9488;
  --color-warning: #d97706;
  --color-warning-text: #b45309;
  --color-danger: #dc2626;
  --color-info: #2563eb;
  --color-text: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-border: #e5e7eb;
  --color-border-light: #f0f0f0;
  --color-bg: #f8f9fb;
  --color-surface: #ffffff;
  --font-serif: Georgia, 'Times New Roman', 'Noto Serif SC', serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', 'Courier New', monospace;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-full: 100px;
}

body {
  font-family: var(--font-serif);
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: 更新 layout.tsx 移除字体无关内容**

当前 layout.tsx 已经足够简洁，只需确保 `<html>` 标签不强制指定非衬线字体：

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvXt — 主题投资分析",
  description: "AI 驱动的产业链推理与投资主题映射",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-[#f8f9fb] text-[#0f172a] antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: 验证**

启动前端 dev server，打开 http://localhost:3000，确认页面字体变为 Georgia 衬线，背景色为 #f8f9fb。

```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/globals.css frontend/src/app/layout.tsx
git commit -m "feat: add design tokens and global serif font"
```

---

### Task 2: 首页重新设计

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/SearchBar.tsx`
- Modify: `frontend/src/components/QuickTags.tsx`
- Modify: `frontend/src/components/MarketToggle.tsx`

- [ ] **Step 1: 更新 MarketToggle 适配新设计**

将当前灰色底胶囊按钮组改为青绿主题：

```tsx
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
    <div className="flex gap-1 bg-[#f5f5f5] rounded-lg p-1">
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
```

- [ ] **Step 2: 更新 SearchBar 适配新设计**

搜索框改为青绿渐变按钮 + Georgia placeholder：

```tsx
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
```

- [ ] **Step 3: 更新 QuickTags 为下划线点缀式**

标签从胶囊框改为下划线点缀：

```tsx
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
```

- [ ] **Step 4: 重写首页 page.tsx**

整合品牌元素（渐变 X + 图谱小标分隔符）：

```tsx
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
        <QuickTags onSelect={handleSearch} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: 验证**

打开 http://localhost:3000，确认：
- 渐变 X 青绿色
- 图谱小标在两句描述中间
- 标签下划线点缀，hover 变青绿
- 搜索框按钮青绿渐变
- 市场切换选中态白底青绿文字

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/SearchBar.tsx frontend/src/components/QuickTags.tsx frontend/src/components/MarketToggle.tsx
git commit -m "feat: redesign home page with teal theme, gradient X, graph icon separator"
```

---

### Task 3: 分析页布局重构（Sticky 导航 + 区块结构）

**Files:**
- Modify: `frontend/src/app/analysis/page.tsx`
- Modify: `frontend/src/components/ProgressStepper.tsx`

- [ ] **Step 1: 更新 ProgressStepper 为简洁圆点式**

```tsx
"use client";

const STEPS = [
  { key: "search", label: "搜索" },
  { key: "theme_understanding", label: "主题" },
  { key: "chain_reasoning", label: "产业链" },
  { key: "company_mapping", label: "公司" },
  { key: "scoring", label: "评分" },
];

interface ProgressStepperProps {
  currentStep: string;
}

export default function ProgressStepper({ currentStep }: ProgressStepperProps) {
  const isDone = currentStep === "done";
  const currentIndex = isDone ? STEPS.length : STEPS.findIndex((s) => currentStep.startsWith(s.key));

  return (
    <div className="flex items-center gap-1.5" style={{ fontFamily: "var(--font-serif)" }}>
      {STEPS.map((step, i) => {
        const isComplete = isDone || i < currentIndex;
        const isActive = !isDone && i === currentIndex;
        return (
          <span key={step.key} className="flex items-center gap-1.5">
            {isComplete ? (
              <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white flex items-center justify-center text-[10px]">✓</span>
            ) : isActive ? (
              <span className="w-5 h-5 rounded-full bg-[#14b8a6] text-white flex items-center justify-center text-[10px] animate-pulse">{i + 1}</span>
            ) : (
              <span className="w-5 h-5 rounded-full bg-[#e5e7eb] text-[#94a3b8] flex items-center justify-center text-[10px]">{i + 1}</span>
            )}
            <span className={`text-[11px] ${isActive ? "text-[#0d9488] font-bold" : isComplete ? "text-[#0f766e]" : "text-[#94a3b8]"}`}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-[#e5e7eb] text-[10px] mx-0.5">·</span>}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 更新分析页添加 Sticky 导航和区块结构**

关键改动：
1. 顶部 sticky 导航栏（InvXt 品牌 + 区块链接）
2. 页面标题区统一（主题名 + 市场 + 图谱小标 + 时间）
3. 每个区块统一标题栏（`<BlockHeader>` 内联组件）
4. 所有区块的 h3 标题移除，走统一标题栏
5. 搜索区块升级样式
6. 图谱工具栏移除，改在区块标题栏右侧（后续 Task 单独处理）

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { submitAnalysis, getAnalysis, getAnalysisByTopic, getGraph } from "@/lib/api";
import type { AnalysisState, GraphData } from "@/types";
import ThemeSummary from "@/components/ThemeSummary";
import IndustryChainGraph from "@/components/IndustryChainGraph";
import CompanyTable from "@/components/CompanyTable";
import LogicCards from "@/components/LogicCards";
import ProgressStepper from "@/components/ProgressStepper";

function GraphIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" className="flex-shrink-0">
      <circle cx="6" cy="6" r="2" fill="#5eead4" opacity="0.5"/>
      <circle cx="16" cy="6" r="2" fill="#0d9488" opacity="0.5"/>
      <circle cx="11" cy="16" r="2.5" fill="#14b8a6" opacity="0.4"/>
      <line x1="7.5" y1="7" x2="10" y2="14.5" stroke="#99f6e4" strokeWidth="1"/>
      <line x1="14.5" y1="7" x2="12" y2="14.5" stroke="#99f6e4" strokeWidth="1"/>
    </svg>
  );
}

function BlockHeader({ label, badge, meta }: { label: string; badge?: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-3 border-b border-[#f0f0f0] mb-3">
      <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">{label}</span>
      {badge && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
          badge === "完成" ? "bg-[#dcfce7] text-[#166534]" :
          badge.startsWith("评分") || badge.startsWith("进行") ? "bg-[#fef3c7] text-[#92400e]" :
          "bg-[#f1f5f9] text-[#64748b]"
        }`}>{badge}</span>
      )}
      {meta && <span className="text-[10px] text-[#cbd5e1]">{meta}</span>}
    </div>
  );
}

const NAV_ITEMS = [
  { key: "search", label: "搜索" },
  { key: "graph", label: "图谱" },
  { key: "table", label: "公司" },
  { key: "cards", label: "逻辑" },
];

export default function AnalysisPage() {
  const params = useSearchParams();
  const topic = params.get("q") || "";
  const market = params.get("market") || "A";

  const [state, setState] = useState<AnalysisState | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("search");

  // Step 1: Check cache or submit new analysis
  useEffect(() => {
    if (!topic) return;
    let ignore = false;
    (async () => {
      try {
        const cached = await getAnalysisByTopic(topic, market);
        if (ignore) return;
        if (cached) {
          setState(cached);
          setLoading(false);
          return;
        }
        const { task_id } = await submitAnalysis(topic, market);
        if (!ignore) setTaskId(task_id);
      } catch (err) {
        if (!ignore) {
          setError(String(err));
          setLoading(false);
        }
      }
    })();
    return () => { ignore = true; };
  }, [topic, market]);

  // Step 2: Poll for results
  useEffect(() => {
    if (!taskId) return;
    let mounted = true;
    let timer: ReturnType<typeof setInterval>;
    async function poll() {
      try {
        const result = await getAnalysis(taskId);
        if (!mounted) return;
        setState(result);
        if (result.status === "completed" || result.status === "failed") {
          setLoading(false);
          if (result.status === "failed") setError(result.error || "Analysis failed");
          clearInterval(timer);
        }
      } catch (err) {
        if (mounted) { setError(String(err)); setLoading(false); clearInterval(timer); }
      }
    }
    poll();
    timer = setInterval(poll, 2000);
    return () => { mounted = false; clearInterval(timer); };
  }, [taskId]);

  // Step 3: Fetch graph data
  useEffect(() => {
    if (state?.topic && state.chain.length > 0) {
      getGraph(state.topic).then(setGraphData).catch(() => {});
    }
  }, [state?.topic, state?.chain?.length, state?.scored?.length]);

  // Update active nav based on loaded sections
  useEffect(() => {
    if (state?.scored.length) setActiveNav("cards");
    else if (state?.companies.length) setActiveNav("table");
    else if (state?.chain.length) setActiveNav("graph");
    else setActiveNav("search");
  }, [state]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!topic) {
    return <div className="p-8 text-center text-[#94a3b8]" style={{ fontFamily: "var(--font-serif)" }}>请输入主题</div>;
  }

  const marketLabel = market === "A" ? "A股" : market === "US" ? "美股" : "全部";

  return (
    <main className="min-h-screen" style={{ fontFamily: "var(--font-serif)" }}>
      {/* ===== Sticky Nav ===== */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#f0f0f0]">
        <div className="max-w-4xl mx-auto flex items-center gap-0 px-6">
          <span className="text-[15px] font-bold text-[#111] py-2.5 whitespace-nowrap">
            Inv<span style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>X</span>t
          </span>
          <span className="text-[#e5e7eb] mx-3.5">|</span>
          <div className="flex gap-0 overflow-x-auto flex-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => scrollTo(item.key)}
                className={`px-3 py-2.5 text-[11px] whitespace-nowrap border-b-2 transition-colors ${
                  activeNav === item.key
                    ? "text-[#0d9488] font-bold border-[#0d9488]"
                    : "text-[#94a3b8] border-transparent hover:text-[#64748b]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* ===== Page Header ===== */}
        <div className="mb-0">
          <h1 className="text-[26px] font-bold text-[#0f172a] mb-1">{topic}</h1>
          <div className="flex items-center gap-2.5 pb-5 text-[13px] text-[#94a3b8]">
            <span>{marketLabel}市场</span>
            <GraphIcon />
            <span>完成于 {state?.status === "completed" ? "刚才" : "..."}</span>
          </div>
        </div>

        {/* ===== Progress ===== */}
        {state && (
          <div className="mb-6">
            <ProgressStepper currentStep={state.current_step} />
          </div>
        )}

        {/* Loading */}
        {loading && !state && !error && (
          <div className="flex items-center gap-3 text-[#94a3b8]">
            <div className="animate-spin w-5 h-5 border-2 border-[#0d9488] border-t-transparent rounded-full" />
            正在分析...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">{error}</div>
        )}

        {state && (
          <>
            {/* ===== Block: Search Results ===== */}
            {state.search && state.search.length > 0 && (
              <section id="search" className="mb-6">
                <BlockHeader label="实时搜索" badge="完成" meta={`${state.search.length} 条`} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {state.search.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                       className="block border border-[#f0f0f0] rounded-lg p-3.5 no-underline hover:border-[#d4d4d8] transition-colors">
                      <h4 className="text-[13px] font-bold text-[#0f766e] mb-1 leading-snug line-clamp-2">{r.title}</h4>
                      <p className="text-[11px] text-[#94a3b8] leading-relaxed line-clamp-3">{r.content}</p>
                      <span className="text-[9px] text-[#cbd5e1] mt-1.5 block font-mono">{new URL(r.url).hostname}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* ===== Block: Theme Summary ===== */}
            {state.theme && (
              <section id="theme" className="mb-6">
                <BlockHeader label="主题理解" badge="完成" />
                <ThemeSummary theme={state.theme} />
              </section>
            )}

            {/* ===== Block: Chain Graph ===== */}
            {/* Show spinner while chain is being built but not done */}
            {state.theme && state.chain.length === 0 && !state.current_step.startsWith("company") && !state.current_step.startsWith("scoring") && state.status === "running" && (
              <section id="graph" className="mb-6">
                <BlockHeader label="产业链图谱" badge="推理中..." />
                <div className="flex items-center gap-2 text-sm text-[#94a3b8] py-4">
                  <div className="animate-spin w-4 h-4 border-2 border-[#0d9488] border-t-transparent rounded-full" />
                  大模型正在拆解产业链结构...
                </div>
              </section>
            )}

            {state.chain.length > 0 && (
              <section id="graph" className="mb-6">
                <div className="flex items-center justify-between py-3 border-b border-[#f0f0f0] mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">产业链图谱</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#dcfce7] text-[#166534]">完成</span>
                    {graphData && <span className="text-[10px] text-[#cbd5e1]">{graphData.nodes.length} 节点 · {graphData.edges.length} 连线</span>}
                  </div>
                </div>
                <IndustryChainGraph data={graphData} />
              </section>
            )}

            {/* ===== Block: Companies Loading ===== */}
            {state.chain.length > 0 && state.companies.length === 0 && state.status === "running" && !state.current_step.startsWith("scoring") && (
              <section id="table" className="mb-6">
                <BlockHeader label="核心公司映射" badge="映射中..." />
                <div className="border border-[#f0f0f0] rounded-lg overflow-hidden">
                  {[1,2,3].map((i) => (
                    <div key={i} className="flex gap-6 px-4 py-3 border-b border-[#f5f5f5] last:border-0">
                      <div className="w-4 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                      <div className="w-20 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                      <div className="w-12 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                      <div className="w-32 h-3 bg-[#f0f0f0] rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ===== Block: Company Table ===== */}
            {state.companies.length > 0 && (
              <section id="table" className="mb-6">
                <BlockHeader
                  label="核心公司映射"
                  badge={state.scored.length > 0 ? `${state.scored.length} 家` : "评分中..."}
                />
                <CompanyTable companies={
                  state.scored.length > 0
                    ? state.scored
                    : state.companies.map(c => ({
                        company_name: c.company_name,
                        ticker: c.ticker,
                        market: c.market as "A" | "US",
                        exposure_score: 0,
                        dimensions: { product_relevance: 0, revenue_elasticity: 0, chain_criticality: 0, competitive_moat: 0, market_awareness: 0 },
                        investment_logic: c.reasoning || "",
                        key_variables: [],
                        risks: [],
                      }))
                } />
              </section>
            )}

            {/* ===== Block: Logic Cards ===== */}
            {state.scored.length > 0 && (
              <section id="cards" className="mb-8">
                <BlockHeader label="投资逻辑卡片" badge={`${Math.min(3, state.scored.length)} 家`} meta="仅展示前三" />
                <LogicCards companies={state.scored} />
              </section>
            )}

            {/* Waiting placeholder for cards */}
            {state.companies.length > 0 && state.scored.length === 0 && state.status === "running" && (
              <section id="cards" className="mb-8">
                <BlockHeader label="投资逻辑卡片" badge="等待评分" />
                <div className="border border-dashed border-[#e5e7eb] rounded-lg py-10 text-center text-[#bbb] text-[13px]">
                  评分完成后自动生成
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 验证**

打开 http://localhost:3000/analysis?q=HBM&market=A，确认：
- Sticky 导航出现，可点击跳转
- 页面标题行有图谱小标
- 每个区块有统一的标题栏
- 骨架屏加载态显示
- 完成的分析显示所有区块

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/analysis/page.tsx frontend/src/components/ProgressStepper.tsx
git commit -m "feat: redesign analysis page with sticky nav, block headers, skeleton loading"
```

---

### Task 4: 主题摘要 + 搜索区块样式升级

**Files:**
- Modify: `frontend/src/components/ThemeSummary.tsx`

- [ ] **Step 1: 重写 ThemeSummary 为卡片式**

```tsx
import type { ThemeResult } from "@/types";

interface ThemeSummaryProps {
  theme: ThemeResult;
}

export default function ThemeSummary({ theme }: ThemeSummaryProps) {
  return (
    <div className="border border-[#f0f0f0] rounded-[10px] p-5" style={{ fontFamily: "var(--font-serif)" }}>
      <h3 className="text-[18px] font-bold text-[#0f172a] mb-1.5">{theme.theme_name}</h3>
      <p className="text-[14px] text-[#64748b] leading-relaxed mb-3">{theme.summary}</p>
      <div className="flex gap-2 flex-wrap">
        <span className="px-3 py-1 bg-[#f0fdfa] text-[#0f766e] text-[11px] rounded-full border border-[#ccfbf1] font-bold">
          {theme.category}
        </span>
        {theme.directions.slice(0, 4).map((d) => (
          <span
            key={d.name}
            className="px-3 py-1 bg-[#f0fdfa] text-[#0f766e] text-[11px] rounded-full border border-[#ccfbf1]"
          >
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证**

打开分析页，确认主题摘要以卡片形式展示，标签为淡青绿底+青绿边框。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ThemeSummary.tsx
git commit -m "feat: redesign theme summary as card with teal tags"
```

---

### Task 5: 产业链图谱工具栏统一

**Files:**
- Modify: `frontend/src/components/IndustryChainGraph.tsx`

改动要点：
1. 移除 absolute 定位的浮动按钮
2. 改为通过 props 从父组件接收工具栏（工具栏已在分析页标题栏右侧预留空间）
3. 图例行内置于组件内
4. 新增节点弹窗（点击节点后浮动卡片）

因为图谱工具栏按钮（公司开关、缩放、复位、全屏）的交互逻辑深度耦合在 IndustryChainGraph 内部，改为 props 传递会增加不必要的复杂度。保持按钮在组件内部，但重新组织为顶部一行工具栏 + 图例行。

- [ ] **Step 1: 重构 IndustryChainGraph 布局**

将按钮从 absolute 四角分布改为顶部工具栏行：

关键改动：
- 顶部新增工具栏行（替换 absolute 按钮）
- 图例行紧跟工具栏
- 底部保留缩放按钮（图谱内常用）
- 节点弹窗：点击公司/材料节点后，在节点旁显示浮动信息卡片
- 全屏时工具栏保持同一布局

核心代码（仅展示改动部分，完整组件保持现有逻辑）：

```tsx
// 在 return 的 JSX 中，将容器改为：
const containerClass = fullscreen
  ? "fixed inset-0 z-50 bg-white flex flex-col"
  : "border border-[#f0f0f0] rounded-[10px] overflow-hidden";

return (
  <div className={containerClass}>
    {/* Toolbar row */}
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#f0f0f0] bg-white flex-wrap">
      <button
        onClick={() => setShowCompanies((s) => !s)}
        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors ${
          showCompanies
            ? "bg-[#f0fdfa] text-[#0d9488] border-[#99f6e4]"
            : "bg-white text-[#64748b] border-[#e5e7eb] hover:bg-[#f8fafc]"
        }`}
      >
        {showCompanies ? "公司 ON" : "公司"}
      </button>
      <span className="w-px h-5 bg-[#e5e7eb] mx-0.5" />
      <button onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))} className="px-2 py-1 rounded-md text-[10px] font-bold bg-white text-[#64748b] border border-[#e5e7eb] hover:bg-[#f8fafc]">−</button>
      <span className="text-[10px] text-[#94a3b8] min-w-[32px] text-center">{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom((z) => Math.min(5, z * 1.2))} className="px-2 py-1 rounded-md text-[10px] font-bold bg-white text-[#64748b] border border-[#e5e7eb] hover:bg-[#f8fafc]">+</button>
      <button onClick={doReset} className="px-2 py-1 rounded-md text-[10px] font-bold bg-white text-[#64748b] border border-[#e5e7eb] hover:bg-[#f8fafc]">复位</button>
      <span className="w-px h-5 bg-[#e5e7eb] mx-0.5" />
      <button onClick={toggleFullscreen} className="px-2 py-1 rounded-md text-[10px] font-bold bg-white text-[#64748b] border border-[#e5e7eb] hover:bg-[#f8fafc]">
        {fullscreen ? "✕ 退出" : "⛶ 全屏"}
      </button>
      {expandedTechs.size > 0 && (
        <button onClick={() => { setExpandedTechs(new Set()); setHighlightNode(null); }} className="px-2 py-1 rounded-md text-[10px] font-bold text-[#b45309] border border-[#fed7aa] bg-[#fff7ed]">
          收起
        </button>
      )}
      {highlightNode && (
        <button onClick={() => setHighlightNode(null)} className="px-2 py-1 rounded-md text-[10px] font-bold text-[#b45309] border border-[#fed7aa] bg-[#fff7ed]">
          清除高亮
        </button>
      )}
    </div>

    {/* Legend row */}
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#f8f8f8] bg-[#fcfcfd]">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.type} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: NODE_COLORS[item.type] }} />
          <span className="text-[9px] text-[#94a3b8]">{item.label}</span>
        </div>
      ))}
      <div className="flex-1" />
      <span className="text-[8px] text-[#d4d4d8]">拖拽平移 · 滚轮缩放 · 点击节点</span>
    </div>

    {/* Graph area */}
    <div className={`flex-1 overflow-hidden ${fullscreen ? "" : "h-96"}`}>
      <div ref={containerRef} className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
           onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {/* ... existing SVG rendering code ... */}
      </div>
    </div>

    {/* Node detail popup */}
    {highlightNode && (() => {
      const node = data?.nodes.find(n => n.id === highlightNode);
      if (!node || node.type === "Theme" || node.type === "Technology") return null;
      // Find company data from edges
      const edge = data?.edges.find(e => (e.type === "EXPOSED_TO" && (e.source === highlightNode || e.target === highlightNode)));
      const score = edge?.data?.score as number | undefined;
      return (
        <div className="absolute bottom-3 left-3 bg-white border border-[#e5e7eb] rounded-[10px] p-3.5 shadow-lg max-w-[260px] z-10"
             style={{ fontFamily: "var(--font-serif)" }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-bold text-[#0f172a]">{node.id}</span>
            <button onClick={() => setHighlightNode(null)} className="text-[#94a3b8] text-[10px] hover:text-[#64748b]">✕</button>
          </div>
          {score != null && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[20px] font-bold text-[#0f766e]">{score}</span>
              <div className="flex-1 h-1 bg-[#e5e7eb] rounded-sm"><div className="h-full bg-[#0d9488] rounded-sm" style={{ width: `${score}%` }} /></div>
            </div>
          )}
          <p className="text-[11px] text-[#64748b] leading-relaxed">{node.data?.description as string || ""}</p>
        </div>
      );
    })()}
  </div>
);
```

- [ ] **Step 2: 验证**

打开分析页图谱区块，确认：
- 工具栏在顶部一行，按钮不再散落
- 图例在第二行
- 节点和连线数量显示在分析页标题栏
- 点击节点后浮动卡片显示（仅公司/材料节点）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/IndustryChainGraph.tsx
git commit -m "feat: unify graph toolbar, add legend row, add node detail popup"
```

---

### Task 6: 公司表格增强

**Files:**
- Modify: `frontend/src/components/CompanyTable.tsx`

- [ ] **Step 1: 重写 CompanyTable**

暴露度改为数字 + 进度条双通道，序号和公司名用衬线，代码等宽：

```tsx
import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

function ScoreCell({ score }: { score: number }) {
  if (score <= 0) return <span className="text-[#cbd5e1] text-xs">…</span>;
  const color =
    score >= 80 ? "text-[#0f766e]" :
    score >= 60 ? "text-[#b45309]" :
    "text-[#64748b]";
  const barColor =
    score >= 80 ? "bg-[#0d9488]" :
    score >= 60 ? "bg-[#d97706]" :
    "bg-[#cbd5e1]";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[15px] font-bold ${color}`} style={{ fontFamily: "var(--font-serif)" }}>{score}</span>
      <div className="flex-1 min-w-[56px] h-1 bg-[#e5e7eb] rounded-sm">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function CompanyTable({ companies }: Props) {
  return (
    <div className="overflow-x-auto border border-[#f0f0f0] rounded-[10px]">
      <table className="w-full text-[13px]" style={{ fontFamily: "var(--font-serif)" }}>
        <thead>
          <tr className="bg-[#fafbfc] text-left">
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider w-7">#</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">公司</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">市场</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">暴露度</th>
            <th className="p-3 font-bold text-[#94a3b8] text-[9px] uppercase tracking-wider">关联逻辑</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c, i) => (
            <tr key={c.ticker} className="border-t border-[#f5f5f5] hover:bg-[#fafbfc] transition-colors">
              <td className="p-3 text-[#94a3b8]">{i + 1}</td>
              <td className="p-3">
                <div className="font-bold text-[#0f172a]">{c.company_name}</div>
                <div className="text-[10px] text-[#94a3b8] font-mono mt-0.5">{c.ticker}</div>
              </td>
              <td className="p-3">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  c.market === "A" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#eff6ff] text-[#2563eb]"
                }`}>
                  {c.market === "A" ? "A股" : "美股"}
                </span>
              </td>
              <td className="p-3">
                <ScoreCell score={c.exposure_score} />
              </td>
              <td className="p-3 text-[12px] text-[#64748b] leading-relaxed">
                {c.investment_logic}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 验证**

打开分析页，确认：
- 表格有圆角边框
- 序号和公司名 Georgia 衬线
- 暴露度大号数字 + 进度条
- 高分青绿、中分琥珀、低分灰
- 股票代码等宽字体

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CompanyTable.tsx
git commit -m "feat: enhance company table with score bars and typography hierarchy"
```

---

### Task 7: 投资逻辑卡片改为两列

**Files:**
- Modify: `frontend/src/components/LogicCards.tsx`

- [ ] **Step 1: 重写 LogicCards 为两列完整内容**

```tsx
import type { ScoredCompany } from "@/types";

interface Props {
  companies: ScoredCompany[];
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "text-[#0f766e]" : score >= 60 ? "text-[#b45309]" : "text-[#64748b]";
  const barColor = score >= 80 ? "bg-[#0d9488]" : score >= 60 ? "bg-[#d97706]" : "bg-[#cbd5e1]";
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-[28px] font-bold ${color}`} style={{ fontFamily: "var(--font-serif)" }}>{score}</span>
      <div className="flex-1 h-[5px] bg-[#e5e7eb] rounded-sm">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function LogicCards({ companies }: Props) {
  const top = companies.slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ fontFamily: "var(--font-serif)" }}>
      {top.map((c) => (
        <div key={c.ticker} className="border border-[#e8ecf1] rounded-[10px] overflow-hidden">
          {/* Card header */}
          <div className="p-[18px_22px_14px] border-b border-[#f0f0f0]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[18px] font-bold text-[#0f172a]">{c.company_name}</span>
              <span className="text-[10px] text-[#94a3b8] font-mono">{c.ticker}</span>
            </div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                c.market === "A" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#eff6ff] text-[#2563eb]"
              }`}>
                {c.market === "A" ? "A股" : "美股"}
              </span>
            </div>
            <ScoreBar score={c.exposure_score} />
          </div>

          {/* Card body */}
          <div className="p-[16px_22px_18px]">
            {/* Investment logic */}
            <div className="mb-3.5">
              <span className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-bold">投资逻辑</span>
              <p className="text-[12px] text-[#475569] leading-relaxed mt-1">{c.investment_logic}</p>
            </div>

            {/* Key variables */}
            {c.key_variables.length > 0 && (
              <div className="mb-3">
                <span className="text-[9px] uppercase tracking-widest text-[#0d9488] font-bold">关键变量</span>
                <div className="mt-1 flex flex-col gap-1.5">
                  {c.key_variables.map((v, i) => (
                    <div key={i}>
                      <div className="text-[12px] font-bold text-[#0f766e]">
                        {typeof v === "string" ? v : v.name}
                      </div>
                      {typeof v !== "string" && v.detail && (
                        <div className="text-[11px] text-[#64748b] leading-relaxed">{v.detail}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks */}
            {c.risks.length > 0 && (
              <div>
                <span className="text-[9px] uppercase tracking-widest text-[#b45309] font-bold">风险</span>
                <div className="mt-1 flex flex-col gap-1.5">
                  {c.risks.map((r, i) => (
                    <div key={i}>
                      <div className="text-[12px] font-bold text-[#b45309]">
                        {typeof r === "string" ? r : r.risk}
                      </div>
                      {typeof r !== "string" && r.detail && (
                        <div className="text-[11px] text-[#64748b] leading-relaxed">{r.detail}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 验证**

打开分析页，确认：
- 卡片两列（桌面端）
- 暴露度大号数字 + 进度条在卡片头部
- 投资逻辑完整展示
- 关键变量青绿色标题
- 风险琥珀色标题
- 每项都有详细说明

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LogicCards.tsx
git commit -m "feat: redesign logic cards to 2-column layout with full content"
```

---

### Task 8: 最终验证与微调

**Files:** 可能微调 globals.css 或各组件

- [ ] **Step 1: 全流程验证**

启动服务，测试完整流程：
1. 打开 http://localhost:3000，确认首页样式
2. 输入 "HBM" 点击分析
3. 观察加载态（骨架屏、等待占位）
4. 分析完成后确认每个区块样式
5. 测试图谱交互（缩放、拖拽、节点点击弹窗、全屏）
6. 测试 sticky 导航跳转

```bash
cd /Users/chao/workspace/invxt && ./start-backend.sh &
cd frontend && npm run dev
```

- [ ] **Step 2: 修复发现的问题**

根据验证结果微调样式或布局。

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "refactor: complete InvXt UI redesign with teal theme and Georgia serif"
```

---

## 执行顺序

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8

每个 Task 可独立验证，按依赖顺序执行。
