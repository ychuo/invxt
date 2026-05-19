from __future__ import annotations
from openai import AsyncOpenAI
from backend.config import settings


import httpx

class LLMClient:
    def __init__(self):
        self._client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            http_client=httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0)),
        )
        self._model = settings.llm_model

    async def chat(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        choice = response.choices[0]
        content = choice.message.content or ""
        if not content:
            content = getattr(choice.message, "reasoning_content", "") or ""
        if not content:
            import sys
            print(f"[LLM] Empty response. Finish reason: {choice.finish_reason}. Keys: {[k for k in choice.message.model_extra or []]}", file=sys.stderr)
        return content

    async def chat_with_json(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        retry: bool = True,
    ) -> dict:
        import json
        text = await self.chat(system_prompt, user_message, temperature, max_tokens)
        text = text.strip()
        if text.startswith("﻿"):
            text = text[1:]
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
        if not text:
            raise ValueError("Empty response from LLM")
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
            if "Extra data" in str(e) and start >= 0:
                depth = 0
                is_array = text[0] == "["
                open_ch, close_ch = ("[", "]") if is_array else ("{", "}")
                for i, ch in enumerate(text):
                    if ch == open_ch:
                        depth += 1
                    elif ch == close_ch:
                        depth -= 1
                        if depth == 0:
                            try:
                                return json.loads(text[: i + 1])
                            except json.JSONDecodeError:
                                break
            if retry:
                return await self.chat_with_json(
                    system_prompt, user_message, temperature, max_tokens + 2048, retry=False
                )
            raise

    async def chat_stream(
        self, messages: list[dict], tools: list[dict] | None = None
    ):
        """Streaming chat completions, returns the async stream from OpenAI SDK."""
        kwargs = dict(
            model=self._model,
            messages=messages,
            stream=True,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}},
        )
        if tools:
            kwargs["tools"] = tools
        return await self._client.chat.completions.create(**kwargs)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        return [item.embedding for item in response.data]
