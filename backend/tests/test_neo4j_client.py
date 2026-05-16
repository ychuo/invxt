from backend.kg.schemas import (
    ThemeEntity, TechnologyEntity, CompanyEntity, Market,
    Relation, RelationType,
)


def test_create_and_find_entity(neo4j):
    entity = ThemeEntity(name="HBM", description="High Bandwidth Memory", category="半导体")
    entity_id = neo4j.create_entity(entity)
    assert entity_id

    found = neo4j.find_entity("HBM")
    assert found is not None
    assert found["name"] == "HBM"
    assert found["category"] == "半导体"


def test_create_relation(neo4j):
    theme = ThemeEntity(name="HBM", category="半导体")
    tech = TechnologyEntity(name="TSV", description="Through Silicon Via")
    neo4j.create_entity(theme)
    neo4j.create_entity(tech)

    rel = Relation(
        from_name="HBM", to_name="TSV",
        type=RelationType.REQUIRES,
        properties={"importance": 0.9},
    )
    neo4j.create_relation(rel)

    found_tech = neo4j.find_entity("TSV")
    assert found_tech is not None


def test_find_companies_by_technology(neo4j):
    tech = TechnologyEntity(name="先进封装")
    neo4j.create_entity(tech)

    company = CompanyEntity(name="长电科技", ticker="600584.SH", market=Market.A, sector="半导体")
    neo4j.create_entity(company)

    rel = Relation(
        from_name="长电科技", to_name="先进封装",
        type=RelationType.SUPPLIES,
        properties={"relevance": "核心"},
    )
    neo4j.create_relation(rel)

    companies = neo4j.find_companies_by_technology("先进封装", market="A")
    assert len(companies) == 1
    assert companies[0]["name"] == "长电科技"
