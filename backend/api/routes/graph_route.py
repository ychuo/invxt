from fastapi import APIRouter, HTTPException
from backend.kg.neo4j_client import Neo4jClient

router = APIRouter()


@router.get("/graph/{theme_name}")
async def get_graph(theme_name: str):
    neo4j = Neo4jClient()
    graph = neo4j.get_theme_graph(theme_name)
    neo4j.close()
    if not graph["nodes"]:
        raise HTTPException(status_code=404, detail="Theme not found in graph")
    return graph
