import pytest
from httpx import AsyncClient, ASGITransport
from backend.api.main import app


@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_analyze_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/analyze",
            json={"topic": "HBM", "market": "A"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data["topic"] == "HBM"
