import json
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.schemas import Relation, RelationType

SYSTEM_PROMPT = """你是一个投资主题暴露度评估专家。给定一个主题和一组公司，你需要评估每家公司在该主题上的暴露度（0-100分）。

评分考虑 5 个维度（各0-100分）：
1. 产品关联度：公司产品/业务与主题的直接相关性
2. 收入弹性：主题发展对公司收入的潜在拉动
3. 产业链核心度：公司在产业链中的不可替代性
4. 竞争壁垒：技术/市场壁垒
5. 市场认知度：当前市场对该关联的认知程度

综合分 = (产品关联度 × 0.30 + 收入弹性 × 0.25 + 产业链核心度 × 0.25 + 竞争壁垒 × 0.10 + 市场认知度 × 0.10)，四舍五入取整。

评分锚定标准：
- 产业链绝对龙头、主营直接对应、主题爆发将显著拉动业绩：85-95分
- 产业链重要参与者、有实质业务关联但非最核心：70-84分
- 产业链一般参与者、有技术/产品关联但弹性有限：50-69分
- 边缘相关、概念为主无实质业绩贡献：30-49分
- 蹭概念、关联极弱：10-29分

输出严格的 JSON 数组格式：
[
  {
    "company_name": "公司名",
    "ticker": "代码",
    "market": "A/US",
    "exposure_score": 85,
    "dimensions": {
      "product_relevance": 90,
      "revenue_elasticity": 80,
      "chain_criticality": 85,
      "competitive_moat": 80,
      "market_awareness": 90
    },
    "investment_logic": "核心逻辑2-3句话",
    "key_variables": ["关键变量1", "关键变量2"],
    "risks": ["风险1"]
  }
]

规则：
- 严格按照加权公式计算 exposure_score
- 同一产业链核心环节的公司分数要高
- 区分"真正受益"和"蹭概念"，后者给低分
- 按 exposure_score 降序排列
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

请评分并排序。""",
            temperature=0,
        )

        scored = result if isinstance(result, list) else []
        scored.sort(key=lambda x: x.get("exposure_score", 0), reverse=True)
        return scored

    def write_to_graph(self, theme_name: str, scored_companies: list[dict]):
        for company in scored_companies:
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
