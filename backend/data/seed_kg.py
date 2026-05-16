"""
Seed the knowledge graph with initial industry chain relationships.
Uses DeepSeek to batch-generate common theme -> technology -> material/equipment chains,
then populates Neo4j.
"""
import json
import asyncio
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.schemas import (
    ThemeEntity, TechnologyEntity, MaterialEntity, EquipmentEntity,
    Relation, RelationType,
)
from backend.services.llm_client import LLMClient


SEED_THEMES = [
    "HBM", "先进封装", "光模块", "液冷散热", "铜连接",
    "AI芯片", "人形机器人", "低空经济", "卫星互联网",
    "存储芯片", "算力服务器", "第三代半导体",
]

SYSTEM_PROMPT = """你是一个产业链知识图谱构建专家。你的任务是为给定主题构建产业链关系。

输出严格的 JSON 格式：
{
  "theme": {
    "name": "主题名",
    "description": "一句话描述",
    "category": "分类（如半导体/AI/新能源等）"
  },
  "technologies": [
    {
      "name": "技术名",
      "description": "一句话描述",
      "maturity": "成熟度（成熟/成长/早期）",
      "materials": [{"name": "材料名", "category": "分类"}],
      "equipment": [{"name": "设备名", "type": "设备类型"}]
    }
  ]
}

规则：
- technologies 列 3-6 个核心技术方向
- 每个技术下列 2-4 个关键材料或设备
- 名称用中文，保持简洁准确
- 只输出 JSON，不要其他文字"""


async def seed_knowledge_graph():
    llm = LLMClient()
    kg = Neo4jClient()

    for theme_name in SEED_THEMES:
        print(f"Processing theme: {theme_name}")
        try:
            response = await llm.chat(
                system_prompt=SYSTEM_PROMPT,
                user_message=f"请构建以下主题的产业链关系：{theme_name}",
                temperature=0.3,
            )
            data = json.loads(response)

            theme_data = data["theme"]
            theme = ThemeEntity(
                name=theme_data["name"],
                description=theme_data.get("description", ""),
                category=theme_data.get("category", ""),
            )
            kg.merge_entity(theme)

            for tech_data in data.get("technologies", []):
                tech = TechnologyEntity(
                    name=tech_data["name"],
                    description=tech_data.get("description", ""),
                    maturity=tech_data.get("maturity", ""),
                )
                kg.merge_entity(tech)

                kg.create_relation(Relation(
                    from_name=theme.name, to_name=tech.name,
                    type=RelationType.REQUIRES,
                ))

                for mat_data in tech_data.get("materials", []):
                    mat = MaterialEntity(
                        name=mat_data["name"],
                        category=mat_data.get("category", ""),
                    )
                    kg.merge_entity(mat)
                    kg.create_relation(Relation(
                        from_name=tech.name, to_name=mat.name,
                        type=RelationType.USES_MATERIAL,
                    ))

                for eq_data in tech_data.get("equipment", []):
                    eq = EquipmentEntity(
                        name=eq_data["name"],
                        equipment_type=eq_data.get("type", ""),
                    )
                    kg.merge_entity(eq)
                    kg.create_relation(Relation(
                        from_name=tech.name, to_name=eq.name,
                        type=RelationType.USES_EQUIPMENT,
                    ))

            print(f"  Created {len(data.get('technologies', []))} technology nodes")

        except Exception as e:
            print(f"  Error: {e}")

    kg.close()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed_knowledge_graph())
