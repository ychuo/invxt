import json
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.schemas import Relation, RelationType

# Score mapping: rank → score (percentile-based, top gets 95, bottom gets 15)
def _rank_to_score(rank: int, total: int) -> int:
    if total <= 1:
        return 75
    return round(95 - (rank - 1) / (total - 1) * 80)

SYSTEM_PROMPT = """你是一个投资主题暴露度评估专家。给定一个主题和一组公司，你需要按受益程度从高到低排序。

不需要打具体分数。只需要排出顺序——哪家公司最受益排第1，哪家只是蹭概念排最后。

判断标准：
- 产业链绝对龙头、主营直接对应、主题爆发显著拉动业绩 → 排前面
- 有实质业务关联但非最核心 → 排中间
- 纯概念炒作、关联极弱 → 排最后

输出严格的 JSON 数组格式（按受益程度从高到低排序）：
[
  {
    "company_name": "公司名",
    "ticker": "代码",
    "market": "A/US",
    "investment_logic": "详细投资逻辑：包括产品/技术/产能优势、产业链卡位、客户绑定关系、订单弹性，3-5句话写清楚",
    "key_variables": [
      {"name": "关键变量", "detail": "为什么重要、当前状态、什么变化会触发价值重估"},
      {"name": "另一个变量", "detail": "跟踪方法、影响路径"}
    ],
    "risks": [
      {"risk": "风险", "detail": "具体场景、发生可能性、对公司的影响程度"},
      {"risk": "另一个风险", "detail": "预警信号、如何判断风险是否临近"}
    ]
  }
]

规则：
- 数组顺序就是排名，第1个最受益，最后1个蹭概念
- 排名要有区分度，不要很多公司挤在同一位置
- investment_logic 必须写到位，让人读完能理解投资逻辑链条
- key_variables 每个变量的 detail 是核心，要写清楚怎么跟踪
- risks 每个风险的 detail 要具体，不是简单复述风险名
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

公司列表（无特定顺序）：
{json.dumps(companies, ensure_ascii=False, indent=2)}

请按受益程度从高到低排序。""",
            temperature=0,
            max_tokens=16384,
        )

        ranked = result if isinstance(result, list) else []
        total = len(ranked)

        for i, c in enumerate(ranked):
            rank = i + 1
            score = _rank_to_score(rank, total)
            c["exposure_score"] = score
            c["dimensions"] = {
                "product_relevance": score,
                "revenue_elasticity": score,
                "chain_criticality": score,
                "competitive_moat": score,
                "market_awareness": score,
            }
        return ranked

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
