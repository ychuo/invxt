import json
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.schemas import Relation, RelationType

# Tier → fixed score mapping (stable across models)
TIER_SCORES: dict[str, int] = {
    "核心": 90,
    "重要": 75,
    "一般": 55,
    "边缘": 35,
    "蹭概念": 15,
}

SYSTEM_PROMPT = """你是一个投资主题暴露度评估专家。给定一个主题和一组公司，你需要评估每家公司在该主题上的暴露度等级。

只分五档，不需要打具体分数：
- 核心：产业链绝对龙头，主营直接对应，主题爆发显著拉动业绩
- 重要：产业链重要参与者，有实质业务关联但非最核心
- 一般：有技术/产品关联，但收入弹性有限
- 边缘：概念为主，无实质业绩贡献
- 蹭概念：关联极弱，纯题材炒作

输出严格的 JSON 数组格式：
[
  {
    "company_name": "公司名",
    "ticker": "代码",
    "market": "A/US",
    "tier": "核心/重要/一般/边缘/蹭概念",
    "investment_logic": "核心逻辑2-3句话",
    "key_variables": ["关键变量1", "关键变量2"],
    "risks": ["风险1"]
  }
]

规则：
- tier 必须是五个值之一：核心、重要、一般、边缘、蹭概念
- 同一产业链核心环节的公司优先给"核心"
- 确实没实质业务的果断给"蹭概念"
- 按 tier 优先级（核心>重要>一般>边缘>蹭概念）降序排列
- 只输出 JSON 数组，不要其他文字"""


class ScoringAgent:
    def __init__(self, llm: LLMClient, neo4j: Neo4jClient):
        self._llm = llm
        self._neo4j = neo4j

    async def score(self, theme_name: str, companies: list[dict]) -> list[dict]:
        if not companies:
            return []

        result = await self._llm.chat_with_json(
            system_prompt=SYSTEM_PROMPT,
            user_message=f"""主题：{theme_name}

公司列表：
{json.dumps(companies, ensure_ascii=False, indent=2)}

请评定每家公司在该主题上的暴露度等级。""",
            temperature=0,
            max_tokens=4096,
        )

        scored = result if isinstance(result, list) else []
        tier_order = {"核心": 0, "重要": 1, "一般": 2, "边缘": 3, "蹭概念": 4}
        scored.sort(key=lambda x: tier_order.get(x.get("tier", "一般"), 2))

        # Map tier to stable score and keep dimensions as derived values
        for c in scored:
            tier = c.get("tier", "一般")
            c["exposure_score"] = TIER_SCORES.get(tier, 55)
            c["dimensions"] = {
                "product_relevance": c["exposure_score"],
                "revenue_elasticity": c["exposure_score"],
                "chain_criticality": c["exposure_score"],
                "competitive_moat": c["exposure_score"],
                "market_awareness": c["exposure_score"],
            }
        return scored

    def write_to_graph(self, theme_name: str, scored_companies: list[dict]):
        from backend.kg.schemas import CompanyEntity, Market
        for company in scored_companies:
            # Create company node first
            try:
                c = CompanyEntity(
                    name=company["company_name"],
                    ticker=company.get("ticker", ""),
                    market=Market.A if company.get("market") == "A" else Market.US,
                )
                self._neo4j.merge_entity(c)
            except Exception:
                pass
            # Create exposure relationship
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
