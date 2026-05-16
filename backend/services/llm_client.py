import json
import httpx
from backend.config import settings


class LLMClient:
    def __init__(self):
        self._api_key = settings.deepseek_api_key
        self._base_url = settings.deepseek_base_url.rstrip("/")
        self._model = settings.deepseek_model

    async def chat(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self._base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def chat_with_json(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> dict:
        text = await self.chat(system_prompt, user_message, temperature, max_tokens)
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(text)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self._base_url}/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "input": texts,
                },
            )
            response.raise_for_status()
            data = response.json()
            return [item["embedding"] for item in data["data"]]
