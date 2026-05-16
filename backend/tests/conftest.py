import pytest
from backend.kg.neo4j_client import Neo4jClient


@pytest.fixture
def neo4j():
    client = Neo4jClient()
    with client.driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    yield client
    with client.driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    client.close()
