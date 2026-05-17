import json
import httpx
from backend.config import settings


class LLMClient:
    def __init__(self):
        self._api_key = settings.llm_api_key
        self._base_url = settings.llm_base_url.rstrip("/")
        self._model = settings.llm_model

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
            choice = data["choices"][0]
            msg = choice.get("message", {})
            content = msg.get("content", "")
            # v4-flash may return empty content when thinking is enabled; use reasoning_content as fallback
            if not content:
                content = msg.get("reasoning_content", "")
            if not content:
                # Log raw response for debugging
                import sys
                print(f"[LLM] Empty response. Finish reason: {choice.get('finish_reason')}. Keys: {list(msg.keys())}", file=sys.stderr)
            return content

    async def chat_with_json(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        retry: bool = True,
    ) -> dict:
        text = await self.chat(system_prompt, user_message, temperature, max_tokens)
        text = text.strip()
        # Strip BOM
        if text.startswith("﻿"):
            text = text[1:]
        # Strip markdown fences
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
        # Try to find JSON in the response
        if not text:
            raise ValueError("Empty response from LLM")
        # Find first [ or { and parse first complete JSON structure
        idx_bracket = text.find("[")
        idx_brace = text.find("{")
        start = -1
        if idx_bracket >= 0 and idx_brace >= 0:
            start = min(idx_bracket, idx_brace)
        elif idx_bracket >= 0:
            start = idx_bracket
        elif idx_brace >= 0:
            start = idx_brace
        if start >= 0:
            text = text[start:]
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            # Try to extract just the first complete JSON object/array
            if "Extra data" in str(e) and start >= 0:
                depth = 0
                is_array = text[0] == "["
                open_ch, close_ch = ("[", "]") if is_array else ("{", "}")
                for i, ch in enumerate(text):
                    if ch == open_ch: depth += 1
                    elif ch == close_ch:
                        depth -= 1
                        if depth == 0:
                            try:
                                return json.loads(text[:i+1])
                            except json.JSONDecodeError:
                                break
            if retry:
                return await self.chat_with_json(system_prompt, user_message, temperature, max_tokens + 2048, retry=False)
            raise

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
