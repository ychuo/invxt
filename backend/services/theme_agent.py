from backend.services.llm_client import LLMClient

SYSTEM_PROMPT = """你是一个产业投资主题分析专家。给定一个主题词，你需要：
1. 理解这个主题的真正含义
2. 确定产业分类
3. 拆解出 3-6 个核心技术方向

输出严格的 JSON 格式：
{
  "theme_name": "主题名称（规范化）",
  "category": "产业分类（如半导体、人工智能、新能源等）",
  "summary": "一句话概述这个主题的核心投资逻辑",
  "directions": [
    {
      "name": "技术方向名",
      "position": "上游/中游/下游",
      "description": "为什么这个方向与主题相关"
    }
  ]
}

规则：
- directions 中必须覆盖上游、中游、下游至少各一个方向
- 每个 direction 的 description 要解释产业关联逻辑
- 只输出 JSON，不要其他文字"""


class ThemeAgent:
    def __init__(self, llm: LLMClient):
        self._llm = llm

    async def analyze(self, topic: str, search_results: list[dict] | None = None) -> dict:
        search_context = ""
        if search_results:
            snippets = "\n".join(
                f"- [{r.get('title', '')}] {r.get('content', '')[:200]}"
                for r in search_results[:5] if r.get("content")
            )
            if snippets:
                search_context = f"\n\n最新实时搜索信息（结合以下信息辅助判断）：\n{snippets}"

        return await self._llm.chat_with_json(
            system_prompt=SYSTEM_PROMPT,
            user_message=f"请分析以下投资主题：{topic}{search_context}",
            temperature=0.3,
        )
