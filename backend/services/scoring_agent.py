from __future__ import annotations
import json
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.schemas import Relation, RelationType

# Revenue tier → base exposure score
REVENUE_MAP = {
    "core": 90,        # 核心业务，收入占比 >30%
    "important": 60,   # 重要业务，收入占比 10-30%
    "marginal": 30,    # 边缘业务，收入占比 5-10%
    "concept": 10,     # 概念阶段，收入占比 <5%
}

# Market awareness → discount multiplier
# High awareness = already priced in = lower investment value
AWARENESS_DISCOUNT = {
    "priced_in": 0.5,              # 市场已充分定价
    "partially_recognized": 0.8,   # 部分认知
    "under_the_radar": 1.0,        # 市场认知不足
}


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


SYSTEM_PROMPT = """你是一个投资主题产业链分析专家。给定一个主题和一组公司，你需要对每家公司提取关键信息。

不需要打分或排序。只需要诚实提取每家公司关于这个主题的结构化信息。

对每家公司判断三个东西：

1. **revenue_tier** — 主题关联的业务在公司收入中的占比等级：
   - "core": 核心业务，收入占比预计 >30%，主题爆发公司实质受益
   - "important": 重要关联，收入占比 10-30%，有实质业务但非最核心
   - "marginal": 边缘关联，收入占比 5-10%，有一定关联但弹性有限
   - "concept": 概念阶段，收入占比 <5%，更多是市场联想而非实质业务

2. **market_awareness** — 市场对这层关联的认知程度：
   - "priced_in": 市场已充分认知并定价，相关信息已在股价中反映
   - "partially_recognized": 部分认知，市场有了解但未完全定价
   - "under_the_radar": 认知不足，市场尚未充分挖掘这层关联

3. 此外还需要：
   - investment_logic: 详细投资逻辑（3-5句）
   - key_variables: 关键变量列表，每个有 name 和 detail
   - risks: 风险列表，每个有 risk 和 detail

输出严格的 JSON 数组格式：
[
  {
    "company_name": "公司名",
    "ticker": "代码",
    "market": "A/US",
    "revenue_tier": "core/important/marginal/concept",
    "market_awareness": "priced_in/partially_recognized/under_the_radar",
    "investment_logic": "详细投资逻辑：包括产品/技术/产能优势、产业链卡位、客户绑定关系、订单弹性，3-5句话",
    "key_variables": [
      {"name": "关键变量", "detail": "为什么重要、当前状态、什么变化会触发价值重估"}
    ],
    "risks": [
      {"risk": "风险", "detail": "具体场景、发生可能性、对公司的影响程度"}
    ]
  }
]

规则：
- revenue_tier 和 market_awareness 必须严格使用给定的枚举值
- 只输出 JSON 数组，不要其他文字"""


class ScoringAgent:
    def __init__(self, llm: LLMClient, neo4j: Neo4jClient):
        self._llm = llm
        self._neo4j = neo4j

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

请提取每家公司的结构化信息。注意：revenue_tier 的判断需结合上述真实营收构成数据（如果有）；market_awareness 的判断需结合上述量价信号——涨幅大+换手高+RSI高通常意味着已定价；涨幅小+换手低+主力流入通常意味着认知不足。""",
            temperature=0,
            max_tokens=16384,
        )

        extracted = result if isinstance(result, list) else []
        return _compute_scores(extracted)

    def write_to_graph(self, theme_name: str, scored_companies: list[dict]):
        from backend.kg.schemas import CompanyEntity, Market
        for company in scored_companies:
            try:
                c = CompanyEntity(
                    name=company["company_name"],
                    ticker=company.get("ticker", ""),
                    market=Market.A if company.get("market") == "A" else Market.US,
                )
                self._neo4j.merge_entity(c)
            except Exception:
                pass
            rel = Relation(
                from_name=company["company_name"],
                to_name=theme_name,
                type=RelationType.EXPOSED_TO,
                properties={
                    "score": company.get("exposure_score", 0),
                    "reasoning": company.get("investment_logic", ""),
                },
            )
            try:
                self._neo4j.create_relation(rel)
            except Exception:
                pass
