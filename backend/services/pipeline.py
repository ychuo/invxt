from __future__ import annotations
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
            state.error = f"Theme analysis failed: {type(e).__name__}: {e}"
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
            state.error = f"Chain reasoning failed: {type(e).__name__}: {e}"
            await self._emit(state)
            return state

        # Step 3: Company mapping (keep per-tech grouping for SUPPLIES edges)
        state.current_step = "company_mapping"
        await self._emit(state)
        # Map: tech_name -> [companies]
        tech_companies: dict[str, list[dict]] = {}
        try:
            for chain in state.chain_results:
                tech_name = chain.get("direction", "")
                if tech_name:
                    companies = await self._mapping_agent.map_companies(chain)
                    tech_companies[tech_name] = companies

            # Flatten for scoring (deduplicate by ticker)
            seen = set()
            all_companies = []
            for companies in tech_companies.values():
                for c in companies:
                    key = c.get("ticker", c.get("company_name", ""))
                    if key and key not in seen:
                        seen.add(key)
                        all_companies.append(c)

            if market in ("A", "US"):
                all_companies = [
                    c for c in all_companies
                    if c.get("market", "").upper() == market
                ]
            state.company_results = all_companies
            state.current_step = "company_mapping_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Company mapping failed: {type(e).__name__}: {e}"
            await self._emit(state)
            return state

        # Step 4: Scoring (use original topic for graph consistency)
        state.current_step = "scoring"
        await self._emit(state)
        display_name = state.theme_result.get("theme_name", topic)
        try:
            state.scored_results = await self._scoring_agent.score(display_name, state.company_results)
            try:
                self._scoring_agent.write_to_graph(topic, state.scored_results)
            except Exception:
                pass
            state.current_step = "scoring_completed"
            await self._emit(state)
        except Exception as e:
            state.status = StepStatus.FAILED
            state.error = f"Scoring failed: {type(e).__name__}: {e}"
            await self._emit(state)
            return state

        # Persist theme node + chain structure in graph
        try:
            theme = ThemeEntity(
                name=topic,
                description=state.theme_result.get("summary", ""),
                category=state.theme_result.get("category", ""),
                aliases=[display_name] if display_name != topic else [],
            )
            self._neo4j.merge_entity(theme)

            # Create technology/material/equipment nodes and relationships
            from backend.kg.schemas import (
                TechnologyEntity, MaterialEntity, EquipmentEntity,
                Relation, RelationType,
            )
            for chain in state.chain_results:
                tech_name = chain.get("direction", "")
                if not tech_name:
                    continue
                tech = TechnologyEntity(name=tech_name)
                self._neo4j.merge_entity(tech)
                self._neo4j.create_relation(Relation(
                    from_name=topic, to_name=tech_name, type=RelationType.REQUIRES,
                ))

                for mat_name in chain.get("key_materials", []):
                    if mat_name:
                        mat = MaterialEntity(name=mat_name)
                        self._neo4j.merge_entity(mat)
                        self._neo4j.create_relation(Relation(
                            from_name=tech_name, to_name=mat_name, type=RelationType.USES_MATERIAL,
                        ))

                for eq_name in chain.get("key_equipment", []):
                    if eq_name:
                        eq = EquipmentEntity(name=eq_name)
                        self._neo4j.merge_entity(eq)
                        self._neo4j.create_relation(Relation(
                            from_name=tech_name, to_name=eq_name, type=RelationType.USES_EQUIPMENT,
                        ))

            # Create Company SUPPLIES Technology edges
            from backend.kg.schemas import CompanyEntity, Market as MarketEnum
            for tech_name, companies in tech_companies.items():
                for company in companies:
                    try:
                        c = CompanyEntity(
                            name=company["company_name"],
                            ticker=company.get("ticker", ""),
                            market=MarketEnum.A if company.get("market") == "A" else MarketEnum.US,
                        )
                        self._neo4j.merge_entity(c)
                        self._neo4j.create_relation(Relation(
                            from_name=company["company_name"],
                            to_name=tech_name,
                            type=RelationType.SUPPLIES,
                            properties={"relevance": company.get("relevance", "")},
                        ))
                    except Exception:
                        pass

        except Exception:
            pass

        state.status = StepStatus.COMPLETED
        state.current_step = "done"
        await self._emit(state)
        return state
