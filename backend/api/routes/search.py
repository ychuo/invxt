from fastapi import APIRouter, Query
from backend.kg.neo4j_client import Neo4jClient

router = APIRouter()


@router.get("/search")
async def search(q: str = Query(min_length=1)):
    neo4j = Neo4jClient()
    results = neo4j.search_entities(q, limit=20)
    neo4j.close()
    return {"query": q, "results": results}
