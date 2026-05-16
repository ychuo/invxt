from __future__ import annotations
from neo4j import GraphDatabase, Driver
from backend.config import settings
from backend.kg.schemas import Entity, Relation, EntityType, RelationType


def _entity_label(entity_type: EntityType) -> str:
    return entity_type.value


class Neo4jClient:
    def __init__(self):
        self._driver: Driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )

    @property
    def driver(self):
        return self._driver

    def close(self):
        self._driver.close()

    def create_entity(self, entity: Entity) -> str:
        label = _entity_label(entity.type)
        props = entity.to_dict()
        with self._driver.session() as session:
            result = session.run(
                f"CREATE (n:{label} {{name: $name}}) SET n += $props RETURN elementId(n) AS id",
                name=entity.name,
                props=props,
            )
            record = result.single()
            return str(record["id"]) if record else ""

    def merge_entity(self, entity: Entity) -> str:
        label = _entity_label(entity.type)
        props = entity.to_dict()
        with self._driver.session() as session:
            result = session.run(
                f"MERGE (n:{label} {{name: $name}}) SET n += $props RETURN elementId(n) AS id",
                name=entity.name,
                props=props,
            )
            record = result.single()
            return str(record["id"]) if record else ""

    def create_relation(self, rel: Relation):
        with self._driver.session() as session:
            session.run(
                """
                MATCH (a {name: $from_name})
                MATCH (b {name: $to_name})
                MERGE (a)-[r:%s]->(b)
                SET r += $props
                """ % rel.type.value,
                from_name=rel.from_name,
                to_name=rel.to_name,
                props=rel.properties,
            )

    def find_entity(self, name: str, entity_type: EntityType | None = None) -> dict | None:
        label_clause = f":{_entity_label(entity_type)}" if entity_type else ""
        with self._driver.session() as session:
            result = session.run(
                f"MATCH (n{label_clause} {{name: $name}}) RETURN properties(n) AS props, elementId(n) AS id LIMIT 1",
                name=name,
            )
            record = result.single()
            if record:
                node = dict(record["props"])
                node["id"] = str(record["id"])
                return node
        return None

    def find_companies_by_technology(self, technology_name: str, market: str | None = None) -> list[dict]:
        with self._driver.session() as session:
            if market:
                result = session.run(
                    """
                    MATCH (t:Technology {name: $tech_name})<-[:SUPPLIES]-(c:Company {market: $market})
                    RETURN properties(c) AS props, elementId(c) AS id
                    """,
                    tech_name=technology_name,
                    market=market,
                )
            else:
                result = session.run(
                    """
                    MATCH (t:Technology {name: $tech_name})<-[:SUPPLIES]-(c:Company)
                    RETURN properties(c) AS props, elementId(c) AS id
                    """,
                    tech_name=technology_name,
                )
            return [dict(record["props"]) | {"id": str(record["id"])} for record in result]

    def find_companies_by_material(self, material_name: str, market: str | None = None) -> list[dict]:
        with self._driver.session() as session:
            if market:
                result = session.run(
                    """
                    MATCH (m:Material {name: $mat_name})<-[:SUPPLIES]-(c:Company {market: $market})
                    RETURN properties(c) AS props, elementId(c) AS id
                    """,
                    mat_name=material_name,
                    market=market,
                )
            else:
                result = session.run(
                    """
                    MATCH (m:Material {name: $mat_name})<-[:SUPPLIES]-(c:Company)
                    RETURN properties(c) AS props, elementId(c) AS id
                    """,
                    mat_name=material_name,
                )
            return [dict(record["props"]) | {"id": str(record["id"])} for record in result]

    def get_theme_graph(self, theme_name: str) -> dict:
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (th:Theme {name: $theme_name})
                OPTIONAL MATCH (th)-[:REQUIRES]->(t:Technology)
                OPTIONAL MATCH (t)-[:USES_MATERIAL]->(m:Material)
                OPTIONAL MATCH (t)-[:USES_EQUIPMENT]->(e:Equipment)
                OPTIONAL MATCH (m)<-[:SUPPLIES]-(cm:Company)
                OPTIONAL MATCH (e)<-[:SUPPLIES]-(ce:Company)
                OPTIONAL MATCH (c_exp:Company)-[r:EXPOSED_TO]->(th)
                RETURN th, collect(DISTINCT t) AS technologies,
                       collect(DISTINCT m) AS materials,
                       collect(DISTINCT e) AS equipments,
                       collect(DISTINCT cm) AS mat_companies,
                       collect(DISTINCT ce) AS eq_companies,
                       collect(DISTINCT {company: c_exp, score: r.score, reasoning: r.reasoning}) AS exposed
                """,
                theme_name=theme_name,
            )
            record = result.single()
            if not record:
                return {"nodes": [], "edges": []}
            return self._format_graph_result(record)

    def _format_graph_result(self, record) -> dict:
        nodes = []
        edges = []
        seen = set()

        def add_node(n, ntype):
            if n is None:
                return
            name = n.get("name", "")
            key = (name, ntype)
            if key in seen or not name:
                return
            seen.add(key)
            nodes.append({"id": name, "type": ntype, "data": dict(n)})

        theme = record.get("th")
        theme_name = ""
        if theme:
            add_node(theme, "Theme")
            theme_name = theme.get("name", "")

        for t in (record.get("technologies") or []):
            if t:
                add_node(t, "Technology")
                if theme_name and t.get("name"):
                    edges.append({"source": theme_name, "target": t["name"], "type": "REQUIRES"})

        for m in (record.get("materials") or []):
            if m:
                add_node(m, "Material")

        for e in (record.get("equipments") or []):
            if e:
                add_node(e, "Equipment")

        for c in (record.get("mat_companies") or []):
            if c:
                add_node(c, "Company")

        for c in (record.get("eq_companies") or []):
            if c:
                add_node(c, "Company")

        for item in (record.get("exposed") or []):
            if item and item.get("company"):
                c = item["company"]
                name = c.get("name", "")
                add_node(c, "Company")
                edges.append({
                    "source": name,
                    "target": theme_name,
                    "type": "EXPOSED_TO",
                    "data": {"score": item.get("score"), "reasoning": item.get("reasoning")},
                })

        return {"nodes": nodes, "edges": edges}

    def search_entities(self, search_query: str, limit: int = 20) -> list[dict]:
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (n)
                WHERE n.name CONTAINS $query
                RETURN properties(n) AS props, labels(n) AS labels, elementId(n) AS id
                LIMIT $limit
                """,
                {"query": search_query, "limit": limit},
            )
            return [dict(record["props"]) | {"id": str(record["id"]), "labels": record["labels"]} for record in result]
