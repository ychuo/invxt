"""Tavily real-time search client."""
from tavily import TavilyClient
from backend.config import settings


class SearchClient:
    def __init__(self):
        self._client = TavilyClient(settings.tavily_api_key) if settings.tavily_api_key else None

    async def search(self, query: str, max_results: int = 10) -> list[dict]:
        """Search for recent news/articles. Returns list of {title, url, content}."""
        if not self._client or not query:
            return []
        try:
            response = self._client.search(
                query=query,
                search_depth="advanced",
                max_results=max_results,
                include_raw_content=False,
                include_answer=False,
            )
            return [
                {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("content", "")}
                for r in response.get("results", [])
            ]
        except Exception:
            return []
