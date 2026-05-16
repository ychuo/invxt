from __future__ import annotations
import json
from backend.services.llm_client import LLMClient
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore

SYSTEM_PROMPT = """你是一个产业链分析专家。给定一个技术方向，你需要拆解它的：
- 上游：需要哪些原材料、前道工艺
- 中游（如果适用）：核心制造/工艺环节
- 下游：应用场景、终端产品
- 关键材料：产业链中的核心物料
- 关键设备：核心生产设备

你还会收到知识图谱的检索结果作为参考。请结合参考信息和你自己的知识进行分析。

输出严格的 JSON 格式：
{
  "direction": "技术方向名",
  "upstream": ["上游环节1", "上游环节2"],
  "midstream": ["中游环节1"],
  "downstream": ["下游应用1", "下游应用2"],
  "key_materials": ["材料1", "材料2"],
  "key_equipment": ["设备1", "设备2"]
}"""


class ChainAgent:
    def __init__(self, llm: LLMClient, neo4j: Neo4jClient, vector_store: VectorStore):
        self._llm = llm
        self._neo4j = neo4j
        self._vector = vector_store

    async def analyze_direction(self, direction: dict) -> dict:
        direction_name = direction["name"]
        graph_results = self._neo4j.find_entity(direction_name)
        rag_context = self._build_rag_context(direction_name, graph_results)

        user_message = f"""技术方向：{direction_name}
产业位置：{direction.get("position", "")}
描述：{direction.get("description", "")}

知识图谱参考数据：
{rag_context}

请拆解这个方向的完整产业链。"""

        result = await self._llm.chat_with_json(
            system_prompt=SYSTEM_PROMPT,
            user_message=user_message,
            temperature=0.3,
        )
        return result

    def _build_rag_context(self, direction_name: str, graph_result: dict | None) -> str:
        parts = [f"Graph node found: {direction_name}"]
        if graph_result:
            parts.append(f"Properties: {json.dumps(graph_result, ensure_ascii=False)}")
        return "\n".join(parts)

    async def analyze_all(self, directions: list[dict]) -> list[dict]:
        results = []
        for d in directions:
            result = await self.analyze_direction(d)
            results.append(result)
        return results
