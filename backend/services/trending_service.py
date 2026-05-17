from __future__ import annotations
import json
from backend.services.llm_client import LLMClient

SYSTEM_PROMPT = """你是一个经验丰富的宏观策略投资研究员，擅长识别被市场低估的结构性主题机会。

你的任务是为用户推荐 8-12 个值得关注的投资主题。要求：
1. 不要只推荐当前最热门的概念（如已经充分定价的），要包含一些前瞻性、有预期差的方向
2. 涵盖不同领域：科技、制造、能源、消费、金融等，不要扎堆
3. 主题名称要简洁（2-6个字），像 "HBM"、"低空经济"、"核聚变" 这样的颗粒度
4. 每个主题附带一句话的推荐理由（洞察视角）

输出严格的 JSON 数组格式：
[
  {"name": "主题名", "reason": "一句话洞察：为什么现在值得关注，预期差在哪里"},
  ...
]
"""

USER_MESSAGE = """请推荐 10 个值得关注的投资主题，当前聚焦{market_label}市场。
避免已经充分定价的热门概念，侧重有预期差、正在酝酿的方向。"""


class TrendingService:
    def __init__(self):
        self._llm = LLMClient()

    async def get_trending(self, market: str = "A") -> list[dict]:
        market_label = "A股" if market == "A" else "美股" if market == "US" else "A股+美股"
        message = USER_MESSAGE.format(market_label=market_label)

        raw = await self._llm.chat(
            system_prompt=SYSTEM_PROMPT,
            user_message=message,
            temperature=0.8,
            max_tokens=2048,
        )

        # Extract JSON array
        text = raw.strip().lstrip("﻿")
        start = text.find("[")
        end = text.rfind("]")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        # Fallback: return empty, frontend will use hardcoded tags
        return []
