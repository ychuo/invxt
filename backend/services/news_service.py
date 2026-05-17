"""Targeted news search with structured event extraction for chain/mapping agents."""
from __future__ import annotations
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
