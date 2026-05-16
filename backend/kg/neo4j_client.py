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
        """Build graph from separate small queries to avoid Cartesian explosion."""
        node_map: dict[str, dict] = {}  # name -> {id, type, data}
        edge_set: set[tuple[str, str, str]] = set()  # (source, target, type)

        def add_node(name, ntype, data=None):
            if name and name not in node_map:
                node_map[name] = {"id": name, "type": ntype, "data": data or {}}

        with self._driver.session() as session:
            # 1. Theme node
            result = session.run(
                "MATCH (th:Theme {name: $name}) RETURN th", name=theme_name
            )
            th = result.single()
            if not th:
                return {"nodes": [], "edges": []}
            th_data = dict(th["th"])
            add_node(th_data["name"], "Theme", th_data)

            # 2. Technologies and their materials/equipment
            result = session.run(
                """
                MATCH (th:Theme {name: $name})-[:REQUIRES]->(t:Technology)
                OPTIONAL MATCH (t)-[:USES_MATERIAL]->(m:Material)
                OPTIONAL MATCH (t)-[:USES_EQUIPMENT]->(e:Equipment)
                RETURN t, collect(DISTINCT m) AS materials, collect(DISTINCT e) AS equipments
                """,
                name=theme_name,
            )
            for rec in result:
                t = rec["t"]
                t_name = t["name"]
                add_node(t_name, "Technology", dict(t))
                edge_set.add((theme_name, t_name, "REQUIRES"))
                for m in rec.get("materials") or []:
                    if m and m.get("name"):
                        add_node(m["name"], "Material", dict(m))
                        edge_set.add((t_name, m["name"], "USES_MATERIAL"))
                for e in rec.get("equipments") or []:
                    if e and e.get("name"):
                        add_node(e["name"], "Equipment", dict(e))
                        edge_set.add((t_name, e["name"], "USES_EQUIPMENT"))

            # 3. Companies exposed to theme
            result = session.run(
                "MATCH (c:Company)-[r:EXPOSED_TO]->(th:Theme {name: $name}) RETURN c, r",
                name=theme_name,
            )
            for rec in result:
                c = rec["c"]
                r = rec["r"]
                add_node(c["name"], "Company", dict(c))
                edge_set.add((c["name"], theme_name, "EXPOSED_TO"))

            # 4. Companies supplying to technologies
            result = session.run(
                """
                MATCH (th:Theme {name: $name})-[:REQUIRES]->(t:Technology)
                MATCH (c:Company)-[:SUPPLIES]->(t)
                RETURN c, t
                """,
                name=theme_name,
            )
            for rec in result:
                c, t = rec["c"], rec["t"]
                add_node(c["name"], "Company", dict(c))
                edge_set.add((c["name"], t["name"], "SUPPLIES"))

        nodes = list(node_map.values())
        edges = [{"source": s, "target": t, "type": tp} for s, t, tp in edge_set]
        return {"nodes": nodes, "edges": edges}

    def _format_graph_result(self, records) -> dict:
        node_map: dict[str, dict] = {}  # name -> node
        edge_set = set()  # (source, target, type)

        def add_node(name, ntype, data=None):
            if not name:
                return
            if name not in node_map:
                node_map[name] = {"id": name, "type": ntype, "data": data or {}}

        def add_edge(source, target, etype, edata=None):
            if not source or not target:
                return
            key = (source, target, etype)
            if key not in edge_set:
                edge_set.add(key)
                edge = {"source": source, "target": target, "type": etype}
                if edata:
                    edge["data"] = edata
                return edge
            return None

        edges = []
        theme_name = ""

        for record in records:
            th = record.get("th")
            t = record.get("t")
            m = record.get("m")
            e = record.get("e")
            c_exp = record.get("c_exp")
            r = record.get("r")

            if th and th.get("name"):
                theme_name = th["name"]
                add_node(theme_name, "Theme", dict(th))

            if t and t.get("name"):
                t_name = t["name"]
                add_node(t_name, "Technology", dict(t))
                edge = add_edge(theme_name, t_name, "REQUIRES")
                if edge:
                    edges.append(edge)

            if m and m.get("name"):
                m_name = m["name"]
                add_node(m_name, "Material", dict(m))
                if t and t.get("name"):
                    edge = add_edge(t["name"], m_name, "USES_MATERIAL")
                    if edge:
                        edges.append(edge)

            if e and e.get("name"):
                e_name = e["name"]
                add_node(e_name, "Equipment", dict(e))
                if t and t.get("name"):
                    edge = add_edge(t["name"], e_name, "USES_EQUIPMENT")
                    if edge:
                        edges.append(edge)

            if c_exp and c_exp.get("name"):
                c_name = c_exp["name"]
                add_node(c_name, "Company", dict(c_exp))
                if r:
                    edge = add_edge(c_name, theme_name, "EXPOSED_TO",
                                    {"score": r.get("score"), "reasoning": r.get("reasoning")})
                    if edge:
                        edges.append(edge)

            c_sup = record.get("c_sup")
            if c_sup and c_sup.get("name"):
                c_name = c_sup["name"]
                add_node(c_name, "Company", dict(c_sup))
                if t and t.get("name"):
                    edge = add_edge(c_name, t["name"], "SUPPLIES")
                    if edge:
                        edges.append(edge)

        return {"nodes": list(node_map.values()), "edges": edges}

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
