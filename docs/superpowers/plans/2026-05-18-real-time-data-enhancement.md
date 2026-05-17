# 三维实时数据增强 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为公司基本面、产业链动态、市场情绪三个维度引入实时数据，从"LLM 纯记忆判断"升级为"结构化数据 + LLM 验证"

**Architecture:** 新增 fundamental_service.py（营收构成拉取+解析）和 news_service.py（定向搜索+事件提取），扩展 market_signal.py（新增资金面信号），在 pipeline 各步骤前拉取对应数据并注入 agent prompt

**Tech Stack:** AkShare, yfinance, Tavily, Python async

---

### File Structure

| 文件 | 职责 |
|------|------|
| `backend/services/fundamental_service.py` **(new)** | 拉取+解析公司营收构成数据（A 股 AkShare 主营构成，美股 yfinance+Tavily） |
| `backend/services/news_service.py` **(new)** | 定向搜索技术/公司新闻，LLM 提取结构化事件 |
| `backend/services/market_signal.py` (modify) | 扩展 4→6/7 个信号，新增资金面 |
| `backend/services/chain_agent.py` (modify) | `analyze_direction()` 接收并注入行业新闻 |
| `backend/services/mapping_agent.py` (modify) | `map_companies()` 接收并注入公司新闻 |
| `backend/services/scoring_agent.py` (modify) | `score()` 接收并注入基本面数据 |
| `backend/services/pipeline.py` (modify) | 编排新的数据拉取步骤 |

---

### Task 1: 创建 fundamental_service.py — A 股营收构成拉取

**Files:**
- Create: `backend/services/fundamental_service.py`

`get_revenue_composition()` 对 A 股调用 AkShare `stock_zyjs_ths` 获取主营构成表，解析为 `{业务名: 收入占比%}` 结构。对美股暂返回 None（维度一中美股用 Tavily 搜索补强，在 Task 2 覆盖）。

- [ ] **Step 1: 写模块骨架**

```python
"""Company fundamental data fetcher — revenue composition, segment breakdowns."""
from __future__ import annotations


def _parse_a_share_revenue(df) -> dict[str, float] | None:
    """Parse AkShare stock_zyjs_ths output into {business_segment: revenue_pct}.

    Expected columns: 主营业务类型, 收入比例
    Returns None if data unavailable or unparseable.
    """
    try:
        segments: dict[str, float] = {}
        for _, row in df.iterrows():
            name = str(row.get("主营业务类型", "")).strip()
            pct_val = row.get("收入比例")
            if name and pct_val is not None:
                pct = float(pct_val)
                if pct > 0:
                    segments[name] = round(pct, 1)
        return segments if segments else None
    except Exception:
        return None


async def get_revenue_composition(ticker: str, market: str) -> dict[str, float] | None:
    """Fetch revenue composition for a single company.

    Returns {business_name: revenue_percentage} or None.
    """
    if market.upper() == "A":
        return await _fetch_a_share_revenue(ticker)
    # US: yfinance doesn't provide segment breakdowns in free tier.
    # For now return None; downstream services will use Tavily search instead.
    return None


async def _fetch_a_share_revenue(ticker: str) -> dict[str, float] | None:
    import akshare as ak
    try:
        df = ak.stock_zyjs_ths(symbol=ticker)
        if df is None or len(df) == 0:
            return None
        return _parse_a_share_revenue(df)
    except Exception:
        return None


def format_fundamentals_for_prompt(
    companies: list[dict],
    fundamentals: dict[str, dict[str, float] | None],
) -> str:
    """Build the revenue context string for the LLM scoring prompt."""
    if not fundamentals:
        return ""

    lines = ["📊 真实营收构成（最新报告期）："]
    for c in companies:
        ticker = c.get("ticker", "")
        comp = fundamentals.get(ticker)
        if not comp:
            continue
        segments = "、".join(f"{k} {v}%" for k, v in list(comp.items())[:5])
        lines.append(f"- {c.get('company_name', ticker)}({ticker}): {segments}")

    return "\n".join(lines)
```

- [ ] **Step 2: 验证 AkShare 主营构成数据**

```bash
/usr/bin/python3 -c "
import akshare as ak
df = ak.stock_zyjs_ths(symbol='600584')
print(f'rows: {len(df)}, columns: {list(df.columns)}')
print(df[['主营业务类型', '收入比例']].head(10).to_string())
"
```

Expected: 输出长电科技主营构成表，包含业务名称和收入比例列。

- [ ] **Step 3: 本地测试 parse 函数**

```bash
/usr/bin/python3 -c "
import asyncio, akshare as ak
from backend.services.fundamental_service import _parse_a_share_revenue, _fetch_a_share_revenue

# Test parser directly
df = ak.stock_zyjs_ths(symbol='600584')
result = _parse_a_share_revenue(df)
print('Parsed:', result)
assert result is not None
assert len(result) >= 1
for name, pct in result.items():
    assert isinstance(pct, float)
    assert 0 < pct <= 100
print('Parse test PASSED')

# Test full fetch
result2 = asyncio.run(_fetch_a_share_revenue('600584'))
print('Fetched:', result2)
assert result2 is not None
print('Full fetch test PASSED')
"
```

Expected: 两个测试都 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/services/fundamental_service.py
git commit -m "feat: add fundamental service for A-share revenue composition data

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 创建 news_service.py — 定向搜索与事件提取

**Files:**
- Create: `backend/services/news_service.py`

提供 `get_industry_news(tech_name)` 和 `get_company_news(ticker, market)` 两个接口。用 Tavily 定向搜索后用 LLM 提取结构化事件。LLM 调用失败时回退到原始搜索结果摘要。

- [ ] **Step 1: 写 news_service.py**

```python
"""Targeted news search with structured event extraction for chain/mapping agents."""
from __future__ import annotations
import json
from backend.services.llm_client import LLMClient
from backend.services.search_client import SearchClient


EVENT_EXTRACTION_PROMPT = """你是一个金融信息提取专家。给定一组搜索结果，提取对投资判断有实质影响的事件。

输出严格 JSON 格式：
{
  "events": [
    {"type": "产能扩张|技术突破|政策变化|订单公告|并购重组|风险提示|其他", "summary": "一句话描述事件", "date": "YYYY-MM 或 未知"}
  ]
}

规则：
- 只提取与主题/公司直接相关的事件
- 如果没有实质事件，返回 {"events": []}
- 不要编造，每条事件必须能从搜索结果中找到依据
- 只输出 JSON，不要其他文字"""


class NewsService:
    def __init__(self):
        self._search = SearchClient()
        self._llm = LLMClient()

    async def get_industry_news(self, tech_name: str) -> str:
        """Search and extract structured news for a technology direction.

        Returns a formatted context string ready for injection into ChainAgent prompt.
        """
        results = await self._search.search(
            f"{tech_name} 最新进展 技术突破 产能扩张 政策 2026", max_results=6
        )
        if not results:
            return ""

        events = await self._extract_events(results)
        return self._format_context(tech_name, events, results)

    async def get_company_news(self, ticker: str, market: str, company_name: str) -> str:
        """Search and extract structured news for a company.

        Returns a formatted context string ready for injection into MappingAgent prompt.
        """
        label = company_name if market == "A" else ticker
        market_cn = "A股" if market == "A" else "美股"
        results = await self._search.search(
            f"{label} {ticker} {market_cn} 公告 订单 客户 产能 最新动态", max_results=5
        )
        if not results:
            return ""

        events = await self._extract_events(results)
        return self._format_context(f"{company_name}({ticker})", events, results)

    async def _extract_events(self, search_results: list[dict]) -> list[dict]:
        """Use LLM to extract structured events from search results.

        Falls back to raw search snippets if LLM fails.
        """
        context = "\n".join(
            f"- [{r.get('title', '')}] {r.get('content', '')[:300]}"
            for r in search_results[:5] if r.get("content")
        )
        try:
            result = await self._llm.chat_with_json(
                system_prompt=EVENT_EXTRACTION_PROMPT,
                user_message=f"搜索结果：\n{context}",
                temperature=0,
                max_tokens=1024,
            )
            return result.get("events", []) if isinstance(result, dict) else []
        except Exception:
            return []

    def _format_context(
        self,
        label: str,
        events: list[dict],
        raw_results: list[dict],
    ) -> str:
        """Build the context string to inject into agent prompt."""
        parts = [f"\n📰 {label} 最新动态："]
        if events:
            for e in events[:8]:
                parts.append(
                    f"- [{e.get('type', '其他')}] {e.get('summary', '')} ({e.get('date', '未知')})"
                )
        else:
            # Fallback: show raw titles
            for r in raw_results[:3]:
                parts.append(f"- {r.get('title', '')}: {r.get('content', '')[:150]}")
        return "\n".join(parts)
```

- [ ] **Step 2: 验证 Tavily 定向搜索可用**

```bash
/usr/bin/python3 -c "
import asyncio
from backend.services.search_client import SearchClient

async def test():
    sc = SearchClient()
    results = await sc.search('HBM 先进封装 技术突破 产能扩张 2026', max_results=5)
    print(f'Results: {len(results)}')
    for r in results[:3]:
        print(f'  - [{r[\"title\"]}] {r[\"content\"][:100]}...')

asyncio.run(test())
"
```

Expected: 返回 HBM 先进封装相关的最新搜索结果。

- [ ] **Step 3: 验证新闻服务完整流程（需要 LLM 可用）**

```bash
/usr/bin/python3 -c "
import asyncio, os
from backend.services.news_service import NewsService

async def test():
    if not os.environ.get('LLM_API_KEY'):
        print('SKIP: LLM_API_KEY not set')
        return
    ns = NewsService()
    context = await ns.get_industry_news('HBM 先进封装')
    print(context)
    assert len(context) > 0
    print('Industry news test PASSED')

    context2 = await ns.get_company_news('600584.SH', 'A', '长电科技')
    print(context2)
    assert len(context2) > 0
    print('Company news test PASSED')

asyncio.run(test())
"
```

Expected: 输出 HBM 和长电科技的实时动态上下文，两个测试都 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/services/news_service.py
git commit -m "feat: add news service with targeted search and structured event extraction

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 扩展 market_signal.py — 新增资金面信号

**Files:**
- Modify: `backend/services/market_signal.py`

在现有 4 个信号基础上，A 股新增 `fund_flow`（主力资金流向）和 `north_bound`（北向资金变化），美股新增 `inst_holding`（机构持仓）。`format_signals_for_prompt()` 同步更新。

- [ ] **Step 1: 在 _fetch_a_share 中添加资金面和北向资金信号**

在 `backend/services/market_signal.py` 的 `_fetch_a_share` 函数中，`results[ticker] = {...}` 之前插入新信号的获取逻辑：

```python
            # --- 新增: 主力资金流向 ---
            fund_flow = None
            try:
                ff_df = ak.stock_individual_fund_flow_rank()
                if ff_df is not None and "代码" in ff_df.columns:
                    row = ff_df[ff_df["代码"] == ticker]
                    if len(row) > 0:
                        net_flow = row.iloc[0].get("主力净流入", row.iloc[0].get("主力净流入额"))
                        if net_flow is not None:
                            fund_flow = round(float(net_flow) / 1e8, 2)  # 转换为亿元
            except Exception:
                pass

            # --- 新增: 北向资金 ---
            north_bound = None
            try:
                hsgt_df = ak.stock_hsgt_individual_detail_em(symbol=ticker)
                if hsgt_df is not None and len(hsgt_df) > 0:
                    # Net north-bound flow over last 5 trading days
                    recent = hsgt_df.head(5)
                    if "净买入" in recent.columns:
                        north_bound = round(float(recent["净买入"].sum()) / 1e8, 2)
            except Exception:
                pass
```

然后将这两个新字段加入 `results[ticker]`：

```python
            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": turnover_pct,
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
                "fund_flow": fund_flow,
                "north_bound": north_bound,
            }
```

- [ ] **Step 2: 在 _fetch_us 中添加机构持仓信号**

在 `_fetch_us` 函数的 `results[ticker] = {...}` 之前插入：

```python
            # --- 新增: 机构持仓 ---
            inst_holding = None
            try:
                holders = stock.institutional_holders
                if holders is not None and len(holders) > 0:
                    # Sum of top institutional holder percentages
                    inst_holding = round(float(holders.iloc[:10]["% Out"].sum()), 1)
            except Exception:
                pass
```

在 `results[ticker]` 中添加：

```python
            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": None,
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
                "fund_flow": inst_holding,
                "north_bound": None,
            }
```

- [ ] **Step 3: 更新 format_signals_for_prompt**

在 `format_signals_for_prompt` 函数中，为每个公司添加新信号展示：

```python
        if s.get("rsi_14") is not None:
            parts.append(f"RSI-14 {s['rsi_14']}")
        if s.get("fund_flow") is not None:
            parts.append(f"主力净流入 {s['fund_flow']:+.2f}亿")
        if s.get("north_bound") is not None:
            parts.append(f"北向净买 {s['north_bound']:+.2f}亿")
        lines.append("- " + " ".join(parts))
```

- [ ] **Step 4: 验证新信号数据源**

A 股：

```bash
/usr/bin/python3 -c "
import akshare as ak

# Test fund flow
ff = ak.stock_individual_fund_flow_rank()
print('Fund flow columns:', list(ff.columns))
print(ff[ff['代码'].isin(['600584', '002156'])].to_string())

# Test north bound
hsgt = ak.stock_hsgt_individual_detail_em(symbol='600584')
print('North bound columns:', list(hsgt.columns))
print(hsgt.head(3).to_string())
"
```

美股：

```bash
/usr/bin/python3 -c "
import yfinance as yf
nvda = yf.Ticker('NVDA')
holders = nvda.institutional_holders
print('Institutional holders:')
print(holders.head(5).to_string() if holders is not None else 'None')
"
```

Expected: A 股输出资金流向和北向数据，美股输出机构持仓数据。

- [ ] **Step 5: Commit**

```bash
git add backend/services/market_signal.py
git commit -m "feat: add fund flow, north-bound, and institutional holding signals to market_signal

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 修改 chain_agent.py — 接收行业新闻

**Files:**
- Modify: `backend/services/chain_agent.py`

`ChainAgent.analyze_direction()` 新增 `news_context` 参数，将行业新闻注入 LLM prompt。`analyze_all()` 同步透传。

- [ ] **Step 1: 修改 analyze_direction 和 analyze_all 签名**

在 `analyze_direction` 方法签名中添加 `news_context` 参数，并在 user_message 末尾注入：

```python
    async def analyze_direction(
        self, direction: dict, search_context: str = "", news_context: str = ""
    ) -> dict:
        direction_name = direction["name"]
        graph_results = self._neo4j.find_entity(direction_name)
        rag_context = self._build_rag_context(direction_name, graph_results)

        user_message = f"""技术方向：{direction_name}
产业位置：{direction.get("position", "")}
描述：{direction.get("description", "")}

知识图谱参考数据：
{rag_context}

请拆解这个方向的完整产业链。{search_context}{news_context}"""

        result = await self._llm.chat_with_json(
            system_prompt=SYSTEM_PROMPT,
            user_message=user_message,
            temperature=0.3,
        )
        return result
```

`analyze_all` 也需要新增参数并透传：

```python
    async def analyze_all(
        self, directions: list[dict], search_context: str = "", news_contexts: list[str] | None = None
    ) -> list[dict]:
        news_list = news_contexts or [""] * len(directions)
        results = []
        for d, nc in zip(directions, news_list):
            result = await self.analyze_direction(d, search_context, nc)
            results.append(result)
        return results
```

- [ ] **Step 2: 验证 chain_agent 仍可正常调用（向后兼容）**

```bash
/usr/bin/python3 -c "
import asyncio, os
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore
from backend.services.chain_agent import ChainAgent

async def test():
    if not os.environ.get('LLM_API_KEY'):
        print('SKIP')
        return
    llm = LLMClient()
    agent = ChainAgent(llm, Neo4jClient(), VectorStore())
    # Test backward compat (no news_context)
    result = await agent.analyze_direction({'name': '先进封装', 'position': '中游', 'description': '半导体封装技术'})
    print('direction:', result.get('direction'))
    print('upstream:', result.get('upstream'))
    assert result.get('direction'), 'direction field missing'
    print('Backward compat test PASSED')

    # Test with news_context
    result2 = await agent.analyze_direction(
        {'name': '先进封装', 'position': '中游', 'description': '测试'},
        news_context='📰 最新动态：\n- [产能扩张] 台积电CoWoS产能翻倍 (2026-04)'
    )
    print('With news:', result2.get('direction'))
    print('News context test PASSED')

asyncio.run(test())
"
```

Expected: 两个测试都 PASS。

- [ ] **Step 3: Commit**

```bash
git add backend/services/chain_agent.py
git commit -m "feat: add news_context param to ChainAgent for real-time industry news injection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 修改 mapping_agent.py — 接收公司新闻

**Files:**
- Modify: `backend/services/mapping_agent.py`

`MappingAgent.map_companies()` 新增 `news_context` 参数，将公司级新闻注入 LLM prompt。

- [ ] **Step 1: 修改 map_companies 签名**

在 `map_companies` 方法签名中添加 `news_context` 参数，并在 user_message 末尾注入：

```python
    async def map_companies(
        self, chain_node: dict, search_context: str = "", news_context: str = ""
    ) -> list[dict]:
        node_name = chain_node.get("direction", chain_node.get("name", ""))

        graph_companies = []
        try:
            graph_companies = self._neo4j.find_companies_by_technology(node_name)
        except Exception:
            pass

        rag_context = self._build_context(node_name, graph_companies)

        result = await self._llm.chat_with_json(
            system_prompt=SYSTEM_PROMPT,
            user_message=f"""产业链环节：{node_name}

环节详情：
{json.dumps(chain_node, ensure_ascii=False, indent=2)}

知识图谱中已有的关联公司：
{rag_context}

请映射到相关的A股和美股上市公司。{search_context}{news_context}""",
            temperature=0.3,
        )
        companies = result if isinstance(result, list) else []
        return _clean_names(companies)
```

- [ ] **Step 2: 验证向后兼容**

```bash
/usr/bin/python3 -c "
import asyncio, os
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore
from backend.services.mapping_agent import MappingAgent

async def test():
    if not os.environ.get('LLM_API_KEY'):
        print('SKIP')
        return
    llm = LLMClient()
    agent = MappingAgent(llm, Neo4jClient(), VectorStore())
    result = await agent.map_companies({'direction': '先进封装', 'position': '中游', 'description': '半导体封装'})
    print(f'Companies: {len(result)}')
    assert len(result) >= 1
    for c in result[:2]:
        print(f'  - {c[\"company_name\"]} ({c.get(\"ticker\", \"\")})')
    print('PASSED')

asyncio.run(test())
"
```

Expected: PASSED，返回相关公司列表。

- [ ] **Step 3: Commit**

```bash
git add backend/services/mapping_agent.py
git commit -m "feat: add news_context param to MappingAgent for company news injection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 修改 scoring_agent.py — 接收基本面数据

**Files:**
- Modify: `backend/services/scoring_agent.py`

`ScoringAgent.score()` 新增 `fundamentals` 参数，在 prompt 中信号与基本面之间插入营收构成数据。

- [ ] **Step 1: 修改 score 方法签名和 prompt 构建**

将 `score` 方法签名修改为接收 `fundamentals`：

```python
    async def score(
        self,
        theme_name: str,
        companies: list[dict],
        signals: dict[str, dict[str, float | None]] | None = None,
        fundamentals: dict[str, dict[str, float] | None] | None = None,
    ) -> list[dict]:
        if not companies:
            return []

        from backend.services.market_signal import format_signals_for_prompt
        from backend.services.fundamental_service import format_fundamentals_for_prompt
        signal_context = format_signals_for_prompt(companies, signals or {})
        fundamental_context = format_fundamentals_for_prompt(companies, fundamentals or {})

        result = await self._llm.chat_with_json(
            system_prompt=SYSTEM_PROMPT,
            user_message=f"""主题：{theme_name}

公司列表（无特定顺序）：
{json.dumps(companies, ensure_ascii=False, indent=2)}

{fundamental_context}

{signal_context}

请提取每家公司的结构化信息。注意：revenue_tier 的判断需结合上述真实营收构成数据；market_awareness 的判断需结合上述量价信号——涨幅大+换手高+RSI高通常意味着已定价；涨幅小+换手低+主力流入通常意味着认知不足。""",
            temperature=0,
            max_tokens=16384,
        )

        extracted = result if isinstance(result, list) else []
        return _compute_scores(extracted)
```

- [ ] **Step 2: 验证向后兼容（不传 fundamentals）**

```bash
/usr/bin/python3 -c "
import asyncio, os
from backend.services.llm_client import LLMClient
from backend.services.scoring_agent import ScoringAgent
from backend.kg.neo4j_client import Neo4jClient

async def test():
    if not os.environ.get('LLM_API_KEY'):
        print('SKIP')
        return
    llm = LLMClient()
    neo4j = Neo4jClient()
    agent = ScoringAgent(llm, neo4j)

    companies = [
        {'company_name': '长电科技', 'ticker': '600584.SH', 'market': 'A', 'reasoning': '先进封装龙头'},
    ]
    # No fundamentals — should still work
    results = await agent.score('HBM', companies)
    assert len(results) == 1
    assert 'revenue_tier' in results[0]
    assert 'market_awareness' in results[0]
    print(f'revenue_tier={results[0][\"revenue_tier\"]}, awareness={results[0][\"market_awareness\"]}, score={results[0][\"exposure_score\"]}')
    print('Backward compat PASSED')

    # With mock fundamentals
    results2 = await agent.score(
        'HBM', companies,
        fundamentals={'600584.SH': {'先进封装': 45.2, '传统封装': 30.1, '测试': 14.9}}
    )
    assert len(results2) == 1
    print(f'With fundamentals - revenue_tier={results2[0][\"revenue_tier\"]}')
    print('Fundamentals injection PASSED')

    neo4j.close()

asyncio.run(test())
"
```

Expected: 两次测试 PASS，有基本面数据时 LLM 基于真实营收构成判断 revenue_tier。

- [ ] **Step 3: Commit**

```bash
git add backend/services/scoring_agent.py
git commit -m "feat: inject revenue composition data into scoring prompt for data-driven revenue_tier

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 编排 pipeline.py — 串联所有新数据源

**Files:**
- Modify: `backend/services/pipeline.py`

在 Step 2（Chain Reasoning）、Step 3（Company Mapping）、Step 4（Scoring）之前分别拉取行业新闻、公司基本面、扩展信号，传递到对应 agent。

- [ ] **Step 1: 在 Step 2 注入行业新闻**

在 `pipeline.py` 的 chain reasoning 循环前插入 NewsService 调用：

```python
        # Step 2: Chain reasoning (with industry news)
        state.current_step = "chain_reasoning"
        await self._emit(state)
        try:
            from backend.services.news_service import NewsService
            ns = NewsService()
            directions = state.theme_result.get("directions", [])
            # Fetch industry news per direction in parallel
            news_tasks = [ns.get_industry_news(d.get("name", "")) for d in directions]
            news_contexts = await asyncio.gather(*news_tasks, return_exceptions=True)
            news_contexts = [nc if isinstance(nc, str) else "" for nc in news_contexts]
            state.chain_results = await self._chain_agent.analyze_all(
                directions, search_context, news_contexts
            )
            state.current_step = "chain_reasoning_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Chain reasoning failed: {type(e).__name__}: {e}"
            await self._emit(state)
            return state
```

- [ ] **Step 2: 在 Step 3 注入公司新闻**

在 company mapping 循环中，为每个 tech 方向拉取公司级新闻：

```python
        # Step 3: Company mapping (with company news)
        state.current_step = "company_mapping"
        await self._emit(state)
        from backend.services.news_service import NewsService
        ns = NewsService()
        tech_companies: dict[str, list[dict]] = {}
        try:
            for chain in state.chain_results:
                tech_name = chain.get("direction", "")
                if tech_name:
                    tech_news = await ns.get_industry_news(tech_name)
                    companies = await self._mapping_agent.map_companies(chain, search_context, tech_news)
                    tech_companies[tech_name] = companies
            # ... flatten and deduplicate (existing logic unchanged)
```

现有逻辑中 flatten/deduplicate 部分保持不变。

- [ ] **Step 3: 在 Step 4 注入基本面数据**

在 scoring 前拉取所有公司的营收构成：

```python
        # Step 4: Scoring (with fundamentals + signals)
        state.current_step = "scoring"
        await self._emit(state)
        display_name = state.theme_result.get("theme_name", topic)
        try:
            from backend.services.market_signal import get_signals_for_companies
            signals = await get_signals_for_companies(state.company_results)
        except Exception:
            signals = {}
        try:
            from backend.services.fundamental_service import get_revenue_composition
            fundamentals: dict[str, dict[str, float] | None] = {}
            for c in state.company_results:
                ticker = c.get("ticker", "")
                market = c.get("market", "")
                if ticker:
                    comp = await get_revenue_composition(ticker, market)
                    if comp:
                        fundamentals[ticker] = comp
        except Exception:
            fundamentals = {}
        try:
            state.scored_results = await self._scoring_agent.score(
                display_name, state.company_results, signals, fundamentals
            )
```

- [ ] **Step 4: 端到端测试**

```bash
curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"topic":"HBM","market":"A"}'
```

等待完成后查看 scored 结果中的 revenue_tier 是否基于真实数据：

```bash
# 替换 <task_id> 为实际任务 ID
curl -s "http://localhost:8000/api/theme/<task_id>" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for c in d.get('scored', [])[:5]:
    print(f\"{c['company_name']:12s} revenue_tier={c['revenue_tier']:12s} awareness={c['market_awareness']:20s} score={c['exposure_score']}\")
"
```

Expected: 分析正常完成，revenue_tier 基于真实营收构成数据，market_awareness 基于量价+资金面信号。

- [ ] **Step 5: Commit**

```bash
git add backend/services/pipeline.py
git commit -m "feat: integrate fundamental, news, and enhanced signal data into analysis pipeline

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
