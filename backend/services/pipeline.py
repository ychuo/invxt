import uuid
import asyncio
from dataclasses import dataclass, field
from enum import Enum
from backend.services.llm_client import LLMClient
from backend.services.theme_agent import ThemeAgent
from backend.services.chain_agent import ChainAgent
from backend.services.mapping_agent import MappingAgent
from backend.services.scoring_agent import ScoringAgent
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore
from backend.kg.schemas import ThemeEntity


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class AnalysisState:
    task_id: str
    topic: str
    market: str = "A"
    status: StepStatus = StepStatus.PENDING
    theme_result: dict | None = None
    chain_results: list[dict] = field(default_factory=list)
    company_results: list[dict] = field(default_factory=list)
    scored_results: list[dict] = field(default_factory=list)
    current_step: str = ""
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "topic": self.topic,
            "market": self.market,
            "status": self.status.value,
            "current_step": self.current_step,
            "theme": self.theme_result,
            "chain": self.chain_results,
            "companies": self.company_results,
            "scored": self.scored_results,
            "error": self.error,
        }


class AnalysisPipeline:
    def __init__(self):
        self._llm = LLMClient()
        self._neo4j = Neo4jClient()
        self._vector = VectorStore()
        self._theme_agent = ThemeAgent(self._llm)
        self._chain_agent = ChainAgent(self._llm, self._neo4j, self._vector)
        self._mapping_agent = MappingAgent(self._llm, self._neo4j, self._vector)
        self._scoring_agent = ScoringAgent(self._llm, self._neo4j)
        self._callbacks: list = []

    def on_step(self, callback):
        self._callbacks.append(callback)

    async def _emit(self, state: AnalysisState):
        for cb in self._callbacks:
            if asyncio.iscoroutinefunction(cb):
                await cb(state)
            else:
                cb(state)

    async def run(self, topic: str, market: str = "A") -> AnalysisState:
        state = AnalysisState(task_id=str(uuid.uuid4()), topic=topic, market=market)

        # Step 1: Theme understanding
        state.status = StepStatus.RUNNING
        state.current_step = "theme_understanding"
        await self._emit(state)
        try:
            state.theme_result = await self._theme_agent.analyze(topic)
            state.current_step = "theme_understanding_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Theme analysis failed: {e}"
            await self._emit(state)
            return state

        # Step 2: Chain reasoning
        state.current_step = "chain_reasoning"
        await self._emit(state)
        try:
            directions = state.theme_result.get("directions", [])
            state.chain_results = await self._chain_agent.analyze_all(directions)
            state.current_step = "chain_reasoning_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Chain reasoning failed: {e}"
            await self._emit(state)
            return state

        # Step 3: Company mapping
        state.current_step = "company_mapping"
        await self._emit(state)
        try:
            state.company_results = await self._mapping_agent.map_all(state.chain_results)
            if market in ("A", "US"):
                state.company_results = [
                    c for c in state.company_results
                    if c.get("market", "").upper() == market
                ]
            state.current_step = "company_mapping_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Company mapping failed: {e}"
            await self._emit(state)
            return state

        # Step 4: Scoring
        state.current_step = "scoring"
        await self._emit(state)
        try:
            theme_name = state.theme_result.get("theme_name", topic)
            state.scored_results = await self._scoring_agent.score(theme_name, state.company_results)
            try:
                self._scoring_agent.write_to_graph(theme_name, state.scored_results)
            except Exception:
                pass
            state.current_step = "scoring_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Scoring failed: {e}"
            await self._emit(state)
            return state

        # Persist theme node
        try:
            theme = ThemeEntity(
                name=theme_name,
                description=state.theme_result.get("summary", ""),
                category=state.theme_result.get("category", ""),
            )
            self._neo4j.merge_entity(theme)
        except Exception:
            pass

        state.status = StepStatus.COMPLETED
        state.current_step = "done"
        await self._emit(state)
        return state
