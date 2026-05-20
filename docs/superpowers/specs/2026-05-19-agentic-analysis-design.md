# Agentic Analysis: 严谨六步投资研究流程

> 更新于 2026-05-21：根据专业分析师方法论重构为严格顺序的六步工作流

## 目标

将分析流程从模型"自主决定顺序"改为**严格六步递进**，每一步完成后才能进入下一步，后续步骤可修正前面任意区块。流程模拟真实投研方法论：主题理解 → 产业链拆解 → 公司映射 → 精选深研 → 评级输出 → 执行摘要。

---

## 六步工作流

### Step 1: 主题理解与产业定位 → emit theme

**做什么**：搞懂主题到底是什么，判断产业生命周期，测算市场空间

**新增字段**：
- `lifecycle_stage`: "导入期" | "成长期" | "成熟期" | "衰退期"，附带渗透率估算依据
- `tam_description`: 市场空间描述（TAM 规模、增长驱动因素、未来 3-5 年 CAGR）
- `policy_analysis`: 产业政策环境分析（补贴、监管、国产替代政策导向）
- 现有字段保持：`theme_name`, `category`, `summary`, `directions`

**工具**：web_search, query_knowledge_graph

---

### Step 2: 产业链深度拆解 → emit chain

**做什么**：拆解每个技术方向的上下游，分析利润池和竞争格局

**新增字段**（per direction）：
- `profit_pool`: 该环节毛利率水平、议价能力描述、利润集中度
- `concentration`: 行业集中度（CR4/CR8 估算）
- `localization_rate`: 国产化率估算
- 现有字段保持：`direction`, `upstream`, `midstream`, `downstream`, `key_materials`, `key_equipment`

**工具**：web_search, query_knowledge_graph

---

### Step 3: 核心公司全量映射 → emit companies

**做什么**：产业链每个关键环节找到上市公司，全量映射 8-15 家，不做筛选

**新增字段**（per company）：
- `selected_for_deep_research`: boolean，模型判断是否值得深度调研
- `selection_reason`: 入选理由（业务纯度/卡位/预期差/代表性）
- `industry_position`: 公司在产业链中的位置描述
- 现有字段保持：`company_name`, `ticker`, `market`, `reasoning`, `relevance`

**筛选逻辑**：模型在此步骤标注 3-5 家公司为 `selected_for_deep_research: true`，筛选标准：
- 业务纯度：主题关联营收占比
- 产业链卡位：是否处于利润池集中的环节
- 预期差：市场认知不足的优于已充分定价的
- 代表性：覆盖确定性/弹性/低估三种风格

**工具**：web_search, query_knowledge_graph

---

### Step 4: 精选公司深度调研 → 暂不 emit，仅收集

**做什么**：只对 Step 3 标注的 3-5 家公司做深度调研

**调研维度**：
- 基本面：营收构成（get_fundamentals）
- 行情信号：涨跌幅、换手率、RSI、资金流向（get_market_signals）
- 近期动态：公司新闻、产能进展、战略规划（web_search）
- 护城河初步判断：无形资产/转换成本/网络效应/成本优势

**不 emit 独立区块**，调研信息作为 Step 5 的输入。

**工具**：get_fundamentals, get_market_signals, web_search

---

### Step 5: 投资评级与逻辑梳理 → emit logic

**做什么**：基于前四步所有信息，产出完整的投资逻辑卡片和评级

**输出字段**（per company，仅深度调研的 3-5 家）：

| 字段 | 说明 |
|------|------|
| `company_name`, `ticker`, `market` | 基础信息 |
| `revenue_tier` | core / important / marginal / concept |
| `market_awareness` | priced_in / partially_recognized / under_the_radar |
| `investment_logic` | 3-5 句投资逻辑 |
| `moat_assessment` | 护城河评估对象 |
| `moat_assessment.intangible_assets` | 无形资产评分 0-100 |
| `moat_assessment.switching_costs` | 转换成本评分 0-100 |
| `moat_assessment.network_effects` | 网络效应评分 0-100 |
| `moat_assessment.cost_advantage` | 成本优势评分 0-100 |
| `investment_rating` | 强烈推荐 / 推荐 / 关注 / 回避 |
| `catalysts` | 催化剂列表 |
| `catalysts[].event` | 催化剂事件描述 |
| `catalysts[].timeframe` | 预期时间窗口 |
| `catalysts[].impact` | 影响程度：高/中/低 |
| `key_variables` | 关键变量列表（保留） |
| `risks` | 风险列表（保留） |
| `risks[].falsifiable_condition` | 新增：触发该风险即证伪的明确条件 |
| `exposure_score` | 暴露度综合评分（_compute_scores 计算） |
| `dimensions` | 各维度评分（_compute_scores 计算，moat 评分替换硬编码值） |

**工具**：emit_conclusion

---

### Step 6: 执行摘要 → emit theme（补充）

**做什么**：在完成所有分析后，回到 theme 区块补充执行摘要

**新增字段**（追加到 theme）：
- `executive_summary`: 一页纸说清楚——这个主题为什么值得投资、最大的预期差在哪、核心推荐标的和评级

---

## 修正机制

任何后续步骤都可以通过 `emit_correction` 修正前面**任意**区块（不限于上一个）：

- Step 2 发现产业链结构需要调整 Step 1 的主题定义 → `emit_correction(block="theme", ...)`
- Step 4 发现某公司业务模式完全改变了产业链认知 → `emit_correction(block="chain", ...)`
- Step 5 评级时发现 Step 3 遗漏核心标的 → `emit_correction(block="companies", ...)`

---

## 工具定义（不变）

现有 6 个工具足以支撑六步工作流：

| 工具 | 用途 | 主要使用步骤 |
|------|------|-------------|
| `web_search` | 搜索最新产业动态、公司信息、政策 | Step 1-4 |
| `query_knowledge_graph` | 查询已有知识图谱 | Step 1-3 |
| `get_fundamentals` | 获取公司营收构成 | Step 4 |
| `get_market_signals` | 获取行情信号 | Step 4 |
| `emit_conclusion` | 将结论同步到报告区块 | Step 1, 2, 3, 5, 6 |
| `emit_correction` | 修正之前的结论 | 任意步骤 |

---

## 评分计算更新

`_compute_scores` 需要调整，公式：

```
moat_avg = (intangible_assets + switching_costs + network_effects + cost_advantage) / 4
moat_multiplier = moat_avg / 50        # 50 为中性基准，>50 正向加成，<50 惩罚
exposure_score = round(revenue_base × awareness_discount × moat_multiplier)

dimensions = {
    industry_purity: revenue_base,
    earnings_elasticity: revenue_base,
    expectation_gap: round(discount * 100),
    competitive_moat: moat_avg,         # 从硬编码 50 改为实际评估值
    market_awareness: round(discount * 100),
}
```

举例：core(90) × under_the_radar(1.0) × moat 四项平均 75 → 90 × 1.0 × 1.5 = 135，限制上限 100 → exposure_score = 100

---

## 报告区块变更

### 主题概览（新增字段）
- 产业生命周期标签（导入期=amber / 成长期=green / 成熟期=blue / 衰退期=gray）
- 市场空间描述
- 政策环境分析
- 执行摘要（Step 6 补充）

### 产业链图谱（不变）
- 桑基图结构不变
- 节点 tooltip 可展示利润池和集中度信息

### 核心公司映射（新增字段）
- 表格中深度调研的公司标星或行底色区分
- 入选理由简要展示

### 投资逻辑卡片（新增字段）
- 投资评级 badge（强烈推荐=red / 推荐=teal / 关注=amber / 回避=gray）
- 护城河四项评分条
- 催化剂时间线
- 证伪条件

---

## 模型调用（不变）

```python
from openai import AsyncOpenAI

client = AsyncOpenAI(
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url,
)

response = client.chat.completions.create(
    model=settings.llm_model,
    messages=[...],
    stream=True,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}},
)
```

---

## System Prompt 核心要求

```
你是一个产业投资主题分析专家。你必须严格按以下六步推进：

Step 1 — 主题理解与产业定位
Step 2 — 产业链深度拆解
Step 3 — 核心公司全量映射
Step 4 — 精选公司深度调研
Step 5 — 投资评级与逻辑梳理
Step 6 — 执行摘要

规则：
1. 必须按顺序完成，当前步骤完成后才能进入下一步
2. 任何步骤如果发现新信息影响了之前步骤的结论，立即调用 emit_correction 修正对应区块
3. Step 3 必须全量映射（8-15家），标注 selected_for_deep_research 筛选 3-5 家
4. Step 4 只调研 selected_for_deep_research=true 的公司
5. Step 5 只对深度调研的公司产出投资逻辑卡片
6. 每一条投资逻辑必须有明确的证伪条件（falsifiable_condition）
7. 所有评分和判断必须有依据，不能说空话
```
