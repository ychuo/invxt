from __future__ import annotations
import json
import sys
from datetime import date
from backend.services.llm_client import LLMClient
from backend.services.search_client import SearchClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "搜索互联网获取最新产业动态、公司信息、政策动向。在分析产业链、映射公司、验证判断时主动调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词，越具体越好"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fundamentals",
            "description": "获取公司营收构成，验证主题关联业务的真实收入占比。对具体公司做深度分析时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "股票代码，如 002156.SZ"},
                    "market": {"type": "string", "enum": ["A", "US"]},
                },
                "required": ["ticker", "market"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_signals",
            "description": "获取公司近期行情信号（涨跌幅、换手率、RSI、主力资金流向），判断市场认知程度。",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "股票代码"},
                    "market": {"type": "string", "enum": ["A", "US"]},
                },
                "required": ["ticker", "market"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_knowledge_graph",
            "description": "查询知识图谱中已有的产业链节点和公司关系，用于补充和交叉验证。",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity_name": {"type": "string", "description": "实体名称（主题、技术、公司等）"},
                },
                "required": ["entity_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "emit_theme",
            "description": "产出 Step 1 主题理解结论（必须调用）或 Step 6 执行摘要（补充 executive_summary 字段）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "theme_name": {"type": "string", "description": "规范化主题名称"},
                    "category": {"type": "string", "description": "产业分类（半导体/人工智能/新能源等）"},
                    "summary": {"type": "string", "description": "一句话概述核心投资逻辑"},
                    "lifecycle_stage": {"type": "string", "enum": ["导入期", "成长期", "成熟期", "衰退期"], "description": "产业生命周期阶段"},
                    "tam_description": {"type": "string", "description": "市场空间描述（TAM规模、增长驱动、3-5年CAGR）"},
                    "policy_analysis": {"type": "string", "description": "产业政策环境分析"},
                    "directions": {
                        "type": "array",
                        "description": "3-6个核心技术/产业方向",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "技术方向名"},
                                "position": {"type": "string", "description": "上游/中游/下游"},
                                "description": {"type": "string", "description": "与主题的产业关联逻辑"},
                            },
                            "required": ["name", "position", "description"],
                        },
                    },
                    "executive_summary": {
                        "type": "object",
                        "description": "Step 6 执行摘要（仅在Step 6调用时填写）",
                        "properties": {
                            "theme_definition": {"type": "string"},
                            "lifecycle_and_market": {"type": "string"},
                            "core_links": {"type": "string"},
                            "top_picks": {"type": "array", "items": {"type": "object", "properties": {"company_name": {"type": "string"}, "ticker": {"type": "string"}, "rating": {"type": "string"}, "logic": {"type": "string"}}, "required": ["company_name", "ticker", "rating", "logic"]}},
                            "biggest_mispricing": {"type": "string"},
                            "key_catalysts": {"type": "string"},
                        },
                    },
                },
                "required": ["theme_name", "category", "summary", "directions"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "emit_chain",
            "description": "产出 Step 2 产业链深度拆解结论。针对每个技术方向拆解上下游。",
            "parameters": {
                "type": "object",
                "properties": {
                    "chains": {
                        "type": "array",
                        "description": "产业链拆解数组，每个元素对应一个技术方向",
                        "items": {
                            "type": "object",
                            "properties": {
                                "direction": {"type": "string", "description": "技术方向名"},
                                "upstream": {"type": "array", "items": {"type": "string"}, "description": "上游环节"},
                                "midstream": {"type": "array", "items": {"type": "string"}, "description": "中游环节"},
                                "downstream": {"type": "array", "items": {"type": "string"}, "description": "下游环节"},
                                "key_materials": {"type": "array", "items": {"type": "string"}, "description": "关键材料"},
                                "key_equipment": {"type": "array", "items": {"type": "string"}, "description": "关键设备"},
                                "profit_pool": {"type": "string", "description": "利润池分析（毛利率水平、议价能力）"},
                                "concentration": {"type": "string", "description": "行业集中度（CR4/CR8估算）"},
                                "localization_rate": {"type": "string", "description": "国产化率估算"},
                            },
                            "required": ["direction", "upstream", "midstream", "downstream"],
                        },
                    },
                },
                "required": ["chains"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "emit_companies",
            "description": "产出 Step 3 核心公司全量映射结论。全量映射 8-15 家，标注 3-5 家深度调研。",
            "parameters": {
                "type": "object",
                "properties": {
                    "companies": {
                        "type": "array",
                        "description": "公司列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "company_name": {"type": "string", "description": "公司简称（股市常用简称）"},
                                "ticker": {"type": "string", "description": "股票代码（A股: XXXXXX.SH/SZ, 美股: TICKER）"},
                                "market": {"type": "string", "enum": ["A", "US"], "description": "上市市场"},
                                "reasoning": {"type": "string", "description": "为什么这家公司与该产业链相关"},
                                "relevance": {"type": "string", "enum": ["核心", "重要", "一般"], "description": "关联程度"},
                                "selected_for_deep_research": {"type": "boolean", "description": "是否入选深度调研（3-5家为true）"},
                                "selection_reason": {"type": "string", "description": "入选深度调研的理由"},
                                "industry_position": {"type": "string", "description": "公司在产业链中的位置"},
                            },
                            "required": ["company_name", "ticker", "market", "reasoning", "relevance"],
                        },
                    },
                },
                "required": ["companies"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "emit_logic",
            "description": "产出 Step 5 投资评级与逻辑梳理结论。只对深度调研的 3-5 家公司产出。",
            "parameters": {
                "type": "object",
                "properties": {
                    "companies": {
                        "type": "array",
                        "description": "深度调研公司列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "company_name": {"type": "string"},
                                "ticker": {"type": "string"},
                                "market": {"type": "string", "enum": ["A", "US"]},
                                "revenue_tier": {"type": "string", "enum": ["core", "important", "marginal", "concept"]},
                                "market_awareness": {"type": "string", "enum": ["priced_in", "partially_recognized", "under_the_radar"]},
                                "investment_logic": {"type": "string", "description": "3-5句投资逻辑"},
                                "investment_rating": {"type": "string", "enum": ["强烈推荐", "推荐", "关注", "回避"]},
                                "moat_assessment": {
                                    "type": "object",
                                    "properties": {
                                        "intangible_assets": {"type": "integer", "minimum": 0, "maximum": 100},
                                        "switching_costs": {"type": "integer", "minimum": 0, "maximum": 100},
                                        "network_effects": {"type": "integer", "minimum": 0, "maximum": 100},
                                        "cost_advantage": {"type": "integer", "minimum": 0, "maximum": 100},
                                    },
                                    "required": ["intangible_assets", "switching_costs", "network_effects", "cost_advantage"],
                                },
                                "catalysts": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "event": {"type": "string"},
                                            "timeframe": {"type": "string"},
                                            "impact": {"type": "string", "enum": ["高", "中", "低"]},
                                        },
                                        "required": ["event", "timeframe", "impact"],
                                    },
                                },
                                "key_variables": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"name": {"type": "string"}, "detail": {"type": "string"}},
                                        "required": ["name", "detail"],
                                    },
                                },
                                "risks": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {"risk": {"type": "string"}, "detail": {"type": "string"}, "falsifiable_condition": {"type": "string"}},
                                        "required": ["risk", "detail"],
                                    },
                                },
                            },
                            "required": ["company_name", "ticker", "market", "revenue_tier", "market_awareness", "investment_logic", "investment_rating", "moat_assessment", "key_variables", "risks"],
                        },
                    },
                },
                "required": ["companies"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "emit_correction",
            "description": "当需要修正之前的结论时调用。会触发报告区块内容更新而非替换。",
            "parameters": {
                "type": "object",
                "properties": {
                    "block": {
                        "type": "string",
                        "enum": ["theme", "chain", "companies", "logic"],
                    },
                    "reason": {"type": "string", "description": "修正原因和内容"},
                },
                "required": ["block", "reason"],
            },
        },
    },
]

SYSTEM_PROMPT = """你是一个产业投资主题分析专家。你必须严格按以下六步推进，当前步骤完成后才能进入下一步。

## 工作流

### Step 1 — 主题理解与产业定位
搞清楚主题定义、产业生命周期（导入期/成长期/成熟期/衰退期，估算渗透率）、市场空间（TAM、增长驱动因素、3-5 年 CAGR）、产业政策环境。
产出：emit_theme(theme_name="...", category="...", summary="...", directions=[...], lifecycle_stage="...", tam_description="...", policy_analysis="...")

### Step 2 — 产业链深度拆解
针对每个技术方向拆解上下游、关键材料、关键设备，同时分析每个环节的利润池（毛利率水平、议价能力）、行业集中度（CR4/CR8 估算）、国产化率估算。
产出：emit_chain(chains=[{direction, upstream, midstream, downstream, key_materials, key_equipment, profit_pool, concentration, localization_rate}])

### Step 3 — 核心公司全量映射
产业链每个关键环节找到 A 股/美股上市公司，全量映射 8-15 家。对每家公司标注：
- selected_for_deep_research: true/false（筛选 3-5 家深度调研）
- selection_reason: 入选理由（业务纯度/产业链卡位/预期差/代表性）
- industry_position: 产业链位置描述
筛选标准：主题关联营收占比高、处于利润池集中环节、市场认知不足、覆盖不同投资风格。
产出：emit_companies(companies=[{company_name, ticker, market, reasoning, relevance, selected_for_deep_research, selection_reason, industry_position}])

### Step 4 — 精选公司深度调研
只调研 selected_for_deep_research=true 的 3-5 家公司：
- 营收构成（get_fundamentals）
- 行情信号（get_market_signals）
- 近期动态、产能进展、战略规划（web_search）
- 护城河初步判断
不 emit 独立区块，信息作为 Step 5 输入。

### Step 5 — 投资评级与逻辑梳理
基于前四步所有信息，对深度调研公司逐家产出完整评估。
产出：emit_logic(companies=[{company_name, ticker, market, revenue_tier, market_awareness, investment_logic, investment_rating, moat_assessment, catalysts, key_variables, risks}])

### Step 6 — 执行摘要
在完成所有分析后，补充执行摘要，调用 emit_theme 只传 executive_summary 字段：
产出：emit_theme(executive_summary={theme_definition, lifecycle_and_market, core_links, top_picks, biggest_mispricing, key_catalysts})

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


class AgenticAnalyzer:
    def __init__(self):
        self._llm = LLMClient()
        self._search = SearchClient()
        self._neo4j = Neo4jClient()
        self._vector = VectorStore()

    async def _execute_tool(self, name: str, args: dict) -> str:
        if name == "web_search":
            query = args.get("query", "") or ""
            if not query:
                return json.dumps([], ensure_ascii=False)
            results = await self._search.search(
                query, max_results=args.get("max_results", 5)
            )
            return json.dumps(results, ensure_ascii=False)
        elif name == "get_fundamentals":
            from backend.services.fundamental_service import get_revenue_composition

            ticker = args.get("ticker", "")
            market = args.get("market", "A")
            if not ticker:
                return json.dumps({"error": "ticker is required"}, ensure_ascii=False)
            comp = await get_revenue_composition(ticker, market)
            return json.dumps(comp, ensure_ascii=False) if comp else "无数据"
        elif name == "get_market_signals":
            from backend.services.market_signal import get_signals_for_companies

            ticker = args.get("ticker", "")
            market = args.get("market", "A")
            if not ticker:
                return json.dumps({"error": "ticker is required"}, ensure_ascii=False)
            signals = await get_signals_for_companies(
                [{"ticker": ticker, "market": market}]
            )
            return json.dumps(signals, ensure_ascii=False)
        elif name == "query_knowledge_graph":
            entity = args.get("entity_name", "")
            if not entity:
                return json.dumps({"error": "entity_name is required"}, ensure_ascii=False)
            result = self._neo4j.find_entity(entity)
            return json.dumps(result, ensure_ascii=False) if result else "未找到"
        elif name in ("emit_theme", "emit_chain", "emit_companies", "emit_logic", "emit_correction"):
            return "ok"
        return "unknown tool"

    async def analyze(self, topic: str, market: str = "A"):
        """Async generator that yields SSE event dicts."""
        market_label = {"A": "A股", "US": "美股", "all": "A股 美股"}.get(market, "A股 美股")
        today = date.today().strftime("%Y年%m月%d日")

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"请分析投资主题：{topic}，市场：{market_label}，当前日期：{today}。请自主规划研究路径，无需等待确认。先搜索最新信息，然后逐步分析。",
            },
        ]

        max_steps = 20
        for step in range(max_steps):
            # Debug: log step and message sizes
            total_chars = sum(len(str(m.get("content", ""))) + str(m.get("tool_calls", "")).__len__() for m in messages)
            print(f"[AgenticAnalyzer] Step {step+1}/{max_steps}, {len(messages)} messages, ~{total_chars} chars, calling chat_stream...", file=sys.stderr)

            stream = await self._llm.chat_stream(messages=messages, tools=TOOLS)
            print(f"[AgenticAnalyzer] Step {step+1}: stream created, starting iteration...", file=sys.stderr)

            full_content = ""
            full_reasoning = ""
            tool_calls_buf: list[dict] = []
            current_tool_idx = -1

            try:
                async for chunk in stream:
                    delta = chunk.choices[0].delta

                    # Reasoning content (thinking stream — stream to frontend)
                    reasoning = (
                        getattr(delta, "reasoning_content", None)
                        or getattr(delta, "reasoning", None)
                        or ""
                    )
                    if reasoning:
                        full_reasoning += reasoning
                        yield {"type": "thinking", "text": reasoning}

                    # Regular content
                    content = delta.content or ""
                    if content:
                        full_content += content

                    # Tool calls
                    if delta.tool_calls:
                        for tc in delta.tool_calls:
                            if tc.index is not None and tc.index > current_tool_idx:
                                current_tool_idx = tc.index
                                tool_calls_buf.append(
                                    {
                                        "id": tc.id or "",
                                        "function": {
                                            "name": tc.function.name or "",
                                            "arguments": "",
                                        },
                                    }
                                )
                            if tc.function and tc.function.arguments:
                                idx = tc.index if tc.index is not None else current_tool_idx
                                if idx < len(tool_calls_buf):
                                    tool_calls_buf[idx]["function"][
                                        "arguments"
                                    ] += tc.function.arguments

            except Exception as e:
                print(f"[AgenticAnalyzer] Step {step+1} stream ERROR: {type(e).__name__}: {e}", file=sys.stderr)
                yield {"type": "error", "message": f"LLM stream error: {type(e).__name__}: {e}"}
                break

            # Process tool calls
            if tool_calls_buf:
                print(f"[AgenticAnalyzer] Step {step+1}: got {len(tool_calls_buf)} tool calls: {[tc['function']['name'] for tc in tool_calls_buf]}", file=sys.stderr)
                msg = {"role": "assistant", "content": full_content or None}
                # DeepSeek V4 requires reasoning_content when tool_calls are present
                if full_reasoning:
                    msg["reasoning_content"] = full_reasoning
                msg["tool_calls"] = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": tc["function"],
                    }
                    for tc in tool_calls_buf
                ]
                messages.append(msg)

                for tc in tool_calls_buf:
                    name = tc["function"]["name"]
                    raw_args = tc["function"]["arguments"]
                    args = json.loads(raw_args) if raw_args.strip() else {}
                    yield {"type": "tool_call", "name": name, "args": args}

                    try:
                        result = await self._execute_tool(name, args)
                    except Exception as e:
                        result = json.dumps({"error": f"{type(e).__name__}: {e}"}, ensure_ascii=False)
                    yield {"type": "tool_result", "name": name, "result": result}

                    # Special handling for emit_* tools — yield as conclusion/correction events
                    if name == "emit_theme":
                        yield {"type": "conclusion", "block": "theme", "content": json.dumps(args, ensure_ascii=False)}
                    elif name == "emit_chain":
                        chains = args.get("chains", args.get("chain", []))
                        yield {"type": "conclusion", "block": "chain", "content": json.dumps(chains, ensure_ascii=False)}
                    elif name == "emit_companies":
                        companies = args.get("companies", [])
                        yield {"type": "conclusion", "block": "companies", "content": json.dumps(companies, ensure_ascii=False)}
                    elif name == "emit_logic":
                        companies = args.get("companies", [])
                        yield {"type": "conclusion", "block": "logic", "content": json.dumps(companies, ensure_ascii=False)}
                    elif name == "emit_correction":
                        yield {
                            "type": "correction",
                            "block": args.get("block", ""),
                            "reason": args.get("reason", ""),
                        }

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": result[:8000],
                        }
                    )
            else:
                # No tool calls — model is done
                print(f"[AgenticAnalyzer] Step {step+1}: no tool calls, done. full_content={len(full_content)} chars", file=sys.stderr)
                if full_content:
                    yield {"type": "thinking", "text": full_content}
                break

        print(f"[AgenticAnalyzer] Analysis complete", file=sys.stderr)
