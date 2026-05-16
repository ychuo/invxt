from fastapi import APIRouter, HTTPException
from backend.kg.neo4j_client import Neo4jClient

router = APIRouter()


@router.get("/company/{ticker}")
async def get_company(ticker: str):
    neo4j = Neo4jClient()
    company = neo4j.find_entity(ticker)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    with neo4j.driver.session() as session:
        result = session.run(
            """
            MATCH (c:Company {ticker: $ticker})-[r:EXPOSED_TO]->(t:Theme)
            RETURN t.name AS theme, r.score AS score, r.reasoning AS reasoning
            ORDER BY r.score DESC
            """,
            ticker=ticker,
        )
        themes = [
            {"theme": record["theme"], "score": record["score"], "reasoning": record["reasoning"]}
            for record in result
        ]

    neo4j.close()
    return {"company": company, "themes": themes}
