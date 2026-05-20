# 严谨六步工作流 + 报告升级 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agentic 分析流程从"模型自主决定顺序"升级为"严格六步递进"，同时丰富报告内容（执行摘要、护城河评分、催化剂、证伪条件等）

**Architecture:** 后端修改 system prompt 和工具定义，更新 `_compute_scores` 公式；前端新增执行摘要组件，扩展现有组件的展示字段，不改布局架构

**Tech Stack:** Python 3.9+, OpenAI SDK, Next.js 14, TypeScript, react-markdown, lucide-react

---

### Task 1: 后端 — System Prompt 重写 + 评分公式更新

**Files:**
- Modify: `backend/services/agentic_analyzer.py`
- Modify: `backend/services/scoring_agent.py`

#### Step 1: 重写 SYSTEM_PROMPT

将 `agentic_analyzer.py` 中的 `SYSTEM_PROMPT` 替换为：

```python
SYSTEM_PROMPT = """你是一个产业投资主题分析专家。你必须严格按以下六步推进，当前步骤完成后才能进入下一步。

## 工作流

### Step 1 — 主题理解与产业定位
搞清楚主题定义、产业生命周期（导入期/成长期/成熟期/衰退期，估算渗透率）、市场空间（TAM、增长驱动因素、3-5 年 CAGR）、产业政策环境。
产出：emit_conclusion(block="theme", content={...})

### Step 2 — 产业链深度拆解
针对每个技术方向拆解上下游、关键材料、关键设备，同时分析每个环节的利润池（毛利率水平、议价能力）、行业集中度（CR4/CR8 估算）、国产化率估算。
产出：emit_conclusion(block="chain", content=[{...}])

### Step 3 — 核心公司全量映射
产业链每个关键环节找到 A 股/美股上市公司，全量映射 8-15 家。对每家公司标注：
- selected_for_deep_research: true/false（筛选 3-5 家深度调研）
- selection_reason: 入选理由（业务纯度/产业链卡位/预期差/代表性）
- industry_position: 产业链位置描述
筛选标准：主题关联营收占比高、处于利润池集中环节、市场认知不足、覆盖不同投资风格。
产出：emit_conclusion(block="companies", content=[{...}])

### Step 4 — 精选公司深度调研
只调研 selected_for_deep_research=true 的 3-5 家公司：
- 营收构成（get_fundamentals）
- 行情信号（get_market_signals）
- 近期动态、产能进展、战略规划（web_search）
- 护城河初步判断
不 emit 独立区块，信息作为 Step 5 输入。

### Step 5 — 投资评级与逻辑梳理
基于前四步所有信息，对深度调研公司逐家产出完整评估。每家公司必须包含：
- revenue_tier: core/important/marginal/concept
- market_awareness: priced_in/partially_recognized/under_the_radar
- investment_logic: 3-5 句投资逻辑
- moat_assessment: {intangible_assets: 0-100, switching_costs: 0-100, network_effects: 0-100, cost_advantage: 0-100}
- investment_rating: 强烈推荐/推荐/关注/回避
- catalysts: [{event, timeframe, impact: "高/中/低"}]
- key_variables: [{name, detail}]
- risks: [{risk, detail, falsifiable_condition}]
产出：emit_conclusion(block="logic", content=[{...}])

### Step 6 — 执行摘要
在完成所有分析后，补充执行摘要：
- 主题一句话定义
- 产业生命周期 + 市场空间
- 产业链核心环节和利润集中点
- 2-3 个核心推荐标的（公司名+代码+评级+一句话逻辑）
- 最大预期差
- 关键催化剂时间线
产出：emit_conclusion(block="theme", content={...executive_summary...})（追加到 theme 区块）

## 分析角度参考

以下角度供参考，根据主题自主判断权重：
- 政策环境与监管趋势
- 国产替代进度与自主可控需求
- 行业牌照与准入壁垒
- 全球竞争格局与市场份额演变
- 技术迭代方向与专利壁垒
- 上下游议价能力与利润分配
- 产能周期与供需平衡
- 客户集中度与绑定深度
- ESG 与合规风险
- 估值水位与市场情绪

## 规则

1. 严格按顺序推进，当前步骤完成后进入下一步
2. 任何步骤发现新信息影响之前结论时，立即 emit_correction 修正对应区块（不限上一个）
3. Step 3 全量映射 8-15 家，selected_for_deep_research 筛选 3-5 家
4. Step 4 只调研 selected_for_deep_research=true 的公司
5. Step 5 只对深度调研公司产出投资逻辑卡片
6. 每条投资逻辑必须有证伪条件（falsifiable_condition）
7. 评分和判断必须有依据
8. 搜索时关注信息发布日期，引用数据注明来源和时间；超两年数据标注"可能过时"
9. 根据主题自主判断分析角度权重，不平均用力"""
```

#### Step 2: 更新 `_compute_scores` 加入护城河加权

修改 `backend/services/scoring_agent.py` 中的 `_compute_scores`：

```python
def _compute_scores(companies: list[dict]) -> list[dict]:
    """Algorithm computes scores from LLM-extracted tiers and moat assessment."""
    for c in companies:
        revenue = REVENUE_MAP.get(c.get("revenue_tier", "concept"), 10)
        discount = AWARENESS_DISCOUNT.get(c.get("market_awareness", "priced_in"), 0.5)

        # Moat multiplier: average of 4 dimensions, 50 as neutral baseline
        moat = c.get("moat_assessment")
        if moat and isinstance(moat, dict):
            moat_scores = [
                moat.get("intangible_assets", 50),
                moat.get("switching_costs", 50),
                moat.get("network_effects", 50),
                moat.get("cost_advantage", 50),
            ]
            moat_avg = sum(moat_scores) / 4
        else:
            moat_avg = 50
        moat_multiplier = moat_avg / 50.0

        c["exposure_score"] = min(100, round(revenue * discount * moat_multiplier))
        c["dimensions"] = {
            "industry_purity": revenue,
            "earnings_elasticity": revenue,
            "expectation_gap": round(discount * 100),
            "competitive_moat": round(moat_avg),
            "market_awareness": round(discount * 100),
        }

    companies.sort(key=lambda c: c["exposure_score"], reverse=True)
    return companies
```

#### Step 3: 验证 Python 语法

```bash
python3 -m py_compile backend/services/agentic_analyzer.py
python3 -m py_compile backend/services/scoring_agent.py
```

#### Step 4: Commit

```bash
git add backend/services/agentic_analyzer.py backend/services/scoring_agent.py
git commit -m "feat: rewrite system prompt for 6-step workflow, update _compute_scores with moat multiplier"
```

---

### Task 2: TypeScript 类型更新

**Files:**
- Modify: `frontend/src/types/index.ts`

#### Step 1: 新增/更新类型定义

在 `frontend/src/types/index.ts` 中追加：

```typescript
export interface MoatAssessment {
  intangible_assets: number;
  switching_costs: number;
  network_effects: number;
  cost_advantage: number;
}

export interface Catalyst {
  event: string;
  timeframe: string;
  impact: "高" | "中" | "低";
}

export interface RiskItem {
  risk: string;
  detail: string;
  falsifiable_condition?: string;
}

export interface ExecutiveSummary {
  theme_definition: string;
  lifecycle_and_market: string;
  core_links: string;
  top_picks: { company_name: string; ticker: string; rating: string; logic: string }[];
  biggest_mispricing: string;
  key_catalysts: string;
}

// 更新 ThemeResult
export interface ThemeResult {
  theme_name: string;
  category: string;
  summary: string;
  directions: Direction[];
  lifecycle_stage?: string;
  tam_description?: string;
  policy_analysis?: string;
  executive_summary?: ExecutiveSummary;
}

// 更新 ChainResult
export interface ChainResult {
  direction: string;
  upstream: string[];
  midstream: string[];
  downstream: string[];
  key_materials: string[];
  key_equipment: string[];
  profit_pool?: string;
  concentration?: string;
  localization_rate?: string;
}

// 更新 CompanyMapping
export interface CompanyMapping {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  reasoning: string;
  relevance: string;
  selected_for_deep_research?: boolean;
  selection_reason?: string;
  industry_position?: string;
}

// 更新 ScoredCompany
export interface ScoredCompany {
  company_name: string;
  ticker: string;
  market: "A" | "US";
  exposure_score: number;
  revenue_tier: "core" | "important" | "marginal" | "concept";
  market_awareness: "priced_in" | "partially_recognized" | "under_the_radar";
  dimensions: {
    industry_purity: number;
    earnings_elasticity: number;
    expectation_gap: number;
    competitive_moat: number;
    market_awareness: number;
  };
  investment_logic: string;
  investment_rating?: string;
  moat_assessment?: MoatAssessment;
  catalysts?: Catalyst[];
  key_variables: KeyVariable[];
  risks: RiskItem[];
}
```

#### Step 2: 验证 TypeScript

```bash
npx tsc --noEmit
```

#### Step 3: Commit

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add new fields to TypeScript types for rigorous workflow"
```

---

### Task 3: 执行摘要组件 + 主题概览升级

**Files:**
- Create: `frontend/src/components/ExecutiveSummary.tsx`
- Modify: `frontend/src/components/ThemeSummary.tsx`

#### Step 1: 创建 ExecutiveSummary 组件

`frontend/src/components/ExecutiveSummary.tsx`：

```typescript
import type { ExecutiveSummary } from "@/types";

export default function ExecutiveSummary({ data }: { data: ExecutiveSummary }) {
  return (
    <div className="border border-[#ccfbf1] rounded-[10px] overflow-hidden" style={{ background: "linear-gradient(135deg, #f0fdfa, #fff)" }}>
      <div className="px-6 py-4 border-b border-[#ccfbf1]" style={{ background: "#f0fdfa" }}>
        <span className="text-[11px] uppercase tracking-widest text-[#0f766e] font-bold">执行摘要</span>
      </div>
      <div className="p-6 space-y-4" style={{ fontFamily: "var(--font-serif)" }}>
        {/* 主题定义 */}
        <div>
          <p className="text-[14px] text-[#0f172a] leading-relaxed font-bold">{data.theme_definition}</p>
        </div>

        {/* 生命周期 + 市场空间 */}
        <div className="flex gap-3 text-[12px] text-[#64748b]">
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider">市场</span>
          {data.lifecycle_and_market}
        </div>

        {/* 核心环节 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-1">核心环节</span>
          <p className="text-[12px] text-[#475569] leading-relaxed">{data.core_links}</p>
        </div>

        {/* 推荐标的 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-2">核心推荐</span>
          {data.top_picks.map((pick, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-[#f5f5f5] last:border-0">
              <span className="text-[13px] font-bold text-[#0f172a]">{pick.company_name}</span>
              <span className="text-[10px] text-[#94a3b8] font-mono">{pick.ticker}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                pick.rating === "强烈推荐" ? "bg-[#fef2f2] text-[#dc2626]" :
                pick.rating === "推荐" ? "bg-[#f0fdfa] text-[#0d9488]" :
                pick.rating === "关注" ? "bg-[#fef3c7] text-[#92400e]" :
                "bg-[#f1f5f9] text-[#64748b]"
              }`}>{pick.rating}</span>
              <span className="text-[11px] text-[#64748b] flex-1">{pick.logic}</span>
            </div>
          ))}
        </div>

        {/* 预期差 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-1">最大预期差</span>
          <p className="text-[12px] text-[#0f766e] leading-relaxed font-bold">{data.biggest_mispricing}</p>
        </div>

        {/* 催化剂 */}
        <div>
          <span className="text-[#94a3b8] text-[10px] uppercase tracking-wider block mb-1">关键催化剂</span>
          <p className="text-[12px] text-[#475569] leading-relaxed">{data.key_catalysts}</p>
        </div>
      </div>
    </div>
  );
}
```

#### Step 2: 更新 ThemeSummary 展示新字段

在 `ThemeSummary.tsx` 中，在现有 summary 文本下方追加 lifecycle_stage、tam_description、policy_analysis：

在 `<div className="flex gap-2 flex-wrap">` 标签区域内，增加 lifecycle 标签渲染。在 tags 下方增加 tam 和 policy 段落：

```typescript
// 在 ThemeSummary 组件 return 中，现有 tags 区域下方增加：

{theme.lifecycle_stage && (
  <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-bold mr-2"
      style={{
        background: theme.lifecycle_stage === "成长期" ? "#dcfce7" :
                    theme.lifecycle_stage === "导入期" ? "#fef3c7" :
                    theme.lifecycle_stage === "成熟期" ? "#dbeafe" : "#f1f5f9",
        color: theme.lifecycle_stage === "成长期" ? "#166534" :
               theme.lifecycle_stage === "导入期" ? "#92400e" :
               theme.lifecycle_stage === "成熟期" ? "#1e40af" : "#64748b",
      }}>
      {theme.lifecycle_stage}
    </span>
  </div>
)}

{theme.tam_description && (
  <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
    <span className="text-[10px] uppercase tracking-wider text-[#94a3b8] font-bold block mb-1">市场空间</span>
    <p className="text-[12px] text-[#475569] leading-relaxed">{theme.tam_description}</p>
  </div>
)}

{theme.policy_analysis && (
  <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
    <span className="text-[10px] uppercase tracking-wider text-[#94a3b8] font-bold block mb-1">政策环境</span>
    <p className="text-[12px] text-[#475569] leading-relaxed">{theme.policy_analysis}</p>
  </div>
)}
```

#### Step 3: 验证 TypeScript

```bash
npx tsc --noEmit
```

#### Step 4: Commit

```bash
git add frontend/src/components/ExecutiveSummary.tsx frontend/src/components/ThemeSummary.tsx
git commit -m "feat: add executive summary component, extend theme summary with lifecycle/TAM/policy"
```

---

### Task 4: 公司表格 — 深度调研高亮

**Files:**
- Modify: `frontend/src/components/CompanyTable.tsx`

#### Step 1: 在表格中标记深度调研公司

在 `CompanyTable.tsx` 中，给深度调研的行增加星标和底色。在 `<tr>` 元素上增加条件样式：

```typescript
// 在 map companies 渲染行时：
const isDeepResearch = (company as any).selected_for_deep_research === true;

<tr
  key={company.ticker || company.company_name}
  className={`border-b border-[#f5f5f5] ${isDeepResearch ? "bg-[#fafdfc]" : ""}`}
>
  {/* ... existing columns ... */}
</tr>
```

在排名序号列，深度调研的公司显示 ★ 而非数字：

```typescript
<td style={{ padding: "14px 16px", color: isDeepResearch ? "#0d9488" : "#94a3b8" }}>
  {isDeepResearch ? "★" : (index + 1)}
</td>
```

#### Step 2: 在关联逻辑列追加入选理由

在关联逻辑 `<td>` 中，如果公司有 `selection_reason`，追加显示：

```typescript
<td style={{ padding: "14px 16px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
  {company.reasoning || company.investment_logic}
  {(company as any).selection_reason && (
    <span style={{ display: "block", marginTop: 4, fontSize: 10, color: "#0d9488", fontWeight: 600 }}>
      入选理由: {(company as any).selection_reason}
    </span>
  )}
</td>
```

#### Step 3: 验证 TypeScript

```bash
npx tsc --noEmit
```

#### Step 4: Commit

```bash
git add frontend/src/components/CompanyTable.tsx
git commit -m "feat: highlight deep research picks in company table with star and selection reason"
```

---

### Task 5: 投资逻辑卡片升级

**Files:**
- Modify: `frontend/src/components/LogicCards.tsx`

#### Step 1: 新增投资评级 badge、护城河评分条、催化剂、证伪条件

在 `LogicCards.tsx` 的卡片内容区域（`investment_logic` 段落之后）增加以下渲染：

```typescript
// 投资评级 badge（放在卡片 header 区域，score 数字后面）
{company.investment_rating && (
  <span style={{
    fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
    background: company.investment_rating === "强烈推荐" ? "#fef2f2" :
                company.investment_rating === "推荐" ? "#f0fdfa" :
                company.investment_rating === "关注" ? "#fef3c7" : "#f1f5f9",
    color: company.investment_rating === "强烈推荐" ? "#dc2626" :
           company.investment_rating === "推荐" ? "#0d9488" :
           company.investment_rating === "关注" ? "#92400e" : "#64748b",
  }}>
    {company.investment_rating}
  </span>
)}

// 护城河四项评分条（在 投资逻辑 段落之后）
{company.moat_assessment && (
  <div style={{ marginBottom: 14 }}>
    <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", fontWeight: 600 }}>
      护城河评估
    </span>
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      {[
        { key: "intangible_assets", label: "无形资产" },
        { key: "switching_costs", label: "转换成本" },
        { key: "network_effects", label: "网络效应" },
        { key: "cost_advantage", label: "成本优势" },
      ].map(({ key, label }) => {
        const score = (company.moat_assessment as any)[key] || 50;
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 56, fontSize: 10, color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 4, background: "#e5e7eb", borderRadius: 2 }}>
              <div style={{
                width: `${score}%`, height: "100%", borderRadius: 2,
                background: score >= 70 ? "#0d9488" : score >= 40 ? "#d97706" : "#dc2626",
              }} />
            </div>
            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, width: 24 }}>{score}</span>
          </div>
        );
      })}
    </div>
  </div>
)}

// 催化剂时间线（在 关键变量 之后）
{company.catalysts && company.catalysts.length > 0 && (
  <div style={{ marginBottom: 12 }}>
    <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0d9488", fontWeight: 600 }}>
      催化剂
    </span>
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      {(company.catalysts as any[]).map((cat: any, ci: number) => (
        <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{
            fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 600, flexShrink: 0,
            background: cat.impact === "高" ? "#fef2f2" : cat.impact === "中" ? "#fef3c7" : "#f1f5f9",
            color: cat.impact === "高" ? "#dc2626" : cat.impact === "中" ? "#92400e" : "#64748b",
          }}>
            {cat.impact}
          </span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: "#0f172a", fontWeight: 600 }}>{cat.event}</span>
            <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>{cat.timeframe}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

// 证伪条件（在 风险 区域每条风险的 detail 下方追加）
{risk.falsifiable_condition && (
  <div style={{ marginTop: 4, fontSize: 10, color: "#b45309", fontStyle: "italic", background: "#fffbeb", padding: "4px 8px", borderRadius: 4 }}>
    证伪条件: {risk.falsifiable_condition}
  </div>
)}
```

#### Step 2: 验证 TypeScript

```bash
npx tsc --noEmit
```

#### Step 3: Commit

```bash
git add frontend/src/components/LogicCards.tsx
git commit -m "feat: add investment rating, moat bars, catalysts timeline, and falsifiable conditions to logic cards"
```

---

### Task 6: 页面集成

**Files:**
- Modify: `frontend/src/components/ProgressStepper.tsx`
- Modify: `frontend/src/app/analysis/page.tsx`

#### Step 1: 更新 ProgressStepper 加第六步

在 `ProgressStepper.tsx` 的 `STEPS` 数组中追加：

```typescript
const STEPS = [
  { key: "theme_understanding", label: "主题" },
  { key: "chain_reasoning", label: "产业链" },
  { key: "company_mapping", label: "公司" },
  { key: "scoring", label: "评分" },
  { key: "executive_summary", label: "摘要" },
];
```

#### Step 2: 在分析页挂载 ExecutiveSummary

在 `page.tsx` 中：

```typescript
import ExecutiveSummary from "@/components/ExecutiveSummary";
import type { ExecutiveSummary as ExecSummaryType } from "@/types";

// 在主题概览区块之前插入执行摘要区块
{blocks.theme != null && (blocks.theme as any).executive_summary != null && (
  <section id="summary" className="mb-6">
    <ExecutiveSummary data={(blocks.theme as any).executive_summary as ExecSummaryType} />
  </section>
)}
```

#### Step 3: 更新 currentStep 派生逻辑

在 `page.tsx` 的 `currentStep` 派生中增加摘要步骤：

```typescript
const currentStep = status === "idle" || status === "error"
  ? ""
  : (blocks.theme as any)?.executive_summary != null
    ? "executive_summary"
    : blocks.logic != null
      ? "scoring"
      : blocks.companies != null
        ? "company_mapping"
        : blocks.chain != null
          ? "chain_reasoning"
          : blocks.theme != null
            ? "theme_understanding"
            : "";
```

#### Step 4: 更新导航和 IntersectionObserver

```typescript
const NAV_ITEMS = [
  { key: "graph", label: "图谱" },
  { key: "table", label: "公司" },
  { key: "cards", label: "逻辑" },
];

const sectionIds = ["summary", "theme", "graph", "table", "cards"];
```

#### Step 5: 验证 TypeScript

```bash
npx tsc --noEmit
```

#### Step 6: Commit

```bash
git add frontend/src/components/ProgressStepper.tsx frontend/src/app/analysis/page.tsx
git commit -m "feat: add executive summary section to report, update progress stepper with 6th step"
```

---

### Summary

| Task | 文件 | 变更类型 |
|------|------|----------|
| 1 | `backend/services/agentic_analyzer.py` | 重写 SYSTEM_PROMPT |
| 1 | `backend/services/scoring_agent.py` | 更新 _compute_scores |
| 2 | `frontend/src/types/index.ts` | 新增所有类型字段 |
| 3 | `frontend/src/components/ExecutiveSummary.tsx` | 新建 |
| 3 | `frontend/src/components/ThemeSummary.tsx` | 追加 lifecycle/TAM/policy |
| 4 | `frontend/src/components/CompanyTable.tsx` | 深度调研高亮+入选理由 |
| 5 | `frontend/src/components/LogicCards.tsx` | 评级/moat/催化剂/证伪条件 |
| 6 | `frontend/src/components/ProgressStepper.tsx` | 加第六步 |
| 6 | `frontend/src/app/analysis/page.tsx` | 集成新组件 |
