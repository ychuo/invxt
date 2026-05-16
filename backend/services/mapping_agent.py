import json
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore

SYSTEM_PROMPT = """你是一个A股/美股公司映射专家。给定一个产业链环节（技术、材料或设备），你需要找到与之相关的上市公司。

对于每家公司，你需要解释"为什么相关"，而不是只列名字。

输出严格的 JSON 数组格式：
[
  {
    "company_name": "公司全称",
    "ticker": "股票代码（A股格式：XXXXXX.SH/SZ，美股格式：TICKER）",
    "market": "A 或 US",
    "reasoning": "为什么这家公司与该产业链环节相关（2-3句话）",
    "relevance": "核心/重要/一般"
  }
]

规则：
- 每个环节映射 3-8 家公司
- A股和美股都要覆盖（如果有相关公司的话）
- reasoning 要具体，说明技术/产品/客户关系
- 只输出 JSON 数组，不要其他文字"""


class MappingAgent:
    def __init__(self, llm: LLMClient, neo4j: Neo4jClient, vector_store: VectorStore):
        self._llm = llm
        self._neo4j = neo4j
        self._vector = vector_store

    async def map_companies(self, chain_node: dict) -> list[dict]:
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

请映射到相关的A股和美股上市公司。""",
            temperature=0.3,
        )
        return result if isinstance(result, list) else []

    def _build_context(self, node_name: str, graph_companies: list[dict]) -> str:
        if graph_companies:
            names = [c.get("name", "") for c in graph_companies]
            return f"图谱已有：{', '.join(names)}"
        return "图谱中暂无该环节的公司映射"

    async def map_all(self, chain_results: list[dict]) -> list[dict]:
        all_companies = []
        seen = set()
        for chain_node in chain_results:
            companies = await self.map_companies(chain_node)
            for c in companies:
                key = c.get("ticker", c.get("company_name", ""))
                if key and key not in seen:
                    seen.add(key)
                    all_companies.append(c)
        return all_companies
