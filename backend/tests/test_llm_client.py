import os
import pytest
from backend.services.llm_client import LLMClient


@pytest.mark.asyncio
async def test_chat_simple():
    if not os.environ.get("DEEPSEEK_API_KEY"):
        pytest.skip("DEEPSEEK_API_KEY not set")
    client = LLMClient()
    response = await client.chat(
        system_prompt="You are a helpful assistant. Reply in JSON.",
        user_message='Say hello, reply with {"greeting": "your message"}',
        max_tokens=100,
    )
    assert "greeting" in response.lower()


@pytest.mark.asyncio
async def test_chat_with_json():
    if not os.environ.get("DEEPSEEK_API_KEY"):
        pytest.skip("DEEPSEEK_API_KEY not set")
    client = LLMClient()
    result = await client.chat_with_json(
        system_prompt="Reply with valid JSON only. No markdown.",
        user_message='Return: {"answer": 42}',
        max_tokens=100,
    )
    assert result.get("answer") == 42
