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
            "name": "emit_conclusion",
            "description": "当分析得出一个确定结论时调用，将结论同步到分析报告对应区块。这是将思考转化为可见结果的机制。",
            "parameters": {
                "type": "object",
                "properties": {
                    "block": {
                        "type": "string",
                        "enum": ["theme", "chain", "companies", "logic"],
                        "description": "目标区块",
                    },
                    "content": {"type": "string", "description": "区块内容（JSON 字符串，结构与当前 pipeline 输出一致）"},
                },
                "required": ["block", "content"],
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

SYSTEM_PROMPT = """你是一个产业投资主题分析专家。给定一个主题词，你需要通过深度研究完成完整的投资分析报告。

你有以下工具可用：
- web_search: 搜索最新产业动态
- get_fundamentals: 获取公司营收构成
- get_market_signals: 获取行情信号
- query_knowledge_graph: 查询已有知识图谱
- emit_conclusion: 将结论同步到报告
- emit_correction: 修正之前的结论

分析流程由你自主决定。核心要求：
1. 拆解产业链上下游，识别关键环节
2. 映射每个环节的核心 A 股/美股上市公司
3. 结合基本面和行情信号做深度分析
4. 最终产出：主题概览、产业链拆解、公司列表（含暴露度评分）、投资逻辑

对每家公司需要判断：
- revenue_tier: core/important/marginal/concept（主题关联业务收入占比）
- market_awareness: priced_in/partially_recognized/under_the_radar
- investment_logic: 3-5句详细投资逻辑
- key_variables: 关键变量列表
- risks: 风险列表

emit_conclusion 的 content 格式要求：
- block="theme": {"theme_name":"...", "category":"...", "summary":"...", "directions":[{"name":"...", "position":"...", "description":"..."}]}
- block="chain": [{"direction":"...", "upstream":[...], "midstream":[...], "downstream":[...], "key_materials":[...], "key_equipment":[...]}]
- block="companies": [{"company_name":"...", "ticker":"...", "market":"A/US", "reasoning":"...", "relevance":"核心/重要/一般"}]
- block="logic": [{"company_name":"...", "ticker":"...", "market":"A/US", "revenue_tier":"core/important/marginal/concept", "market_awareness":"priced_in/partially_recognized/under_the_radar", "investment_logic":"...", "key_variables":[{"name":"...", "detail":"..."}], "risks":[{"risk":"...", "detail":"..."}]}]"""


class AgenticAnalyzer:
    def __init__(self, mock_search: bool = False):
        self._llm = LLMClient()
        self._search = SearchClient() if not mock_search else None
        self._neo4j = Neo4jClient()
        self._vector = VectorStore()
        self._mock_search = mock_search

    async def _execute_tool(self, name: str, args: dict) -> str:
        if name == "web_search":
            if self._mock_search:
                return json.dumps([
                    {"title": "Mock: " + args.get("query", ""), "url": "https://example.com",
                     "content": "这是模拟搜索结果。HBM产业链包括上游设备和材料、中游先进封装、下游AI服务器。"},
                ], ensure_ascii=False)
            results = await self._search.search(
                args["query"], max_results=args.get("max_results", 5)
            )
            return json.dumps(results, ensure_ascii=False)
        elif name == "get_fundamentals":
            from backend.services.fundamental_service import get_revenue_composition

            comp = await get_revenue_composition(args["ticker"], args["market"])
            return json.dumps(comp, ensure_ascii=False) if comp else "无数据"
        elif name == "get_market_signals":
            from backend.services.market_signal import get_signals_for_companies

            signals = await get_signals_for_companies(
                [{"ticker": args["ticker"], "market": args["market"]}]
            )
            return json.dumps(signals, ensure_ascii=False)
        elif name == "query_knowledge_graph":
            result = self._neo4j.find_entity(args["entity_name"])
            return json.dumps(result, ensure_ascii=False) if result else "未找到"
        elif name in ("emit_conclusion", "emit_correction"):
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

                    result = await self._execute_tool(name, args)
                    yield {"type": "tool_result", "name": name, "result": result}

                    # Special handling for emit_conclusion / emit_correction
                    if name == "emit_conclusion":
                        yield {
                            "type": "conclusion",
                            "block": args.get("block", ""),
                            "content": args.get("content", ""),
                        }
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

        print(f"[AgenticAnalyzer] Analysis complete, yielding done", file=sys.stderr)
        yield {"type": "done"}
