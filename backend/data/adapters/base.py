from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class CompanyInfo:
    name: str
    ticker: str
    market: str  # "A" or "US"
    sector: str = ""
    industry: str = ""
    description: str = ""
    concept_tags: list[str] = field(default_factory=list)


class MarketDataAdapter(ABC):
    @abstractmethod
    async def get_company_info(self, ticker: str) -> CompanyInfo | None:
        ...

    @abstractmethod
    async def get_concept_stocks(self, concept_name: str) -> list[CompanyInfo]:
        ...

    @abstractmethod
    async def search_companies(self, keyword: str) -> list[CompanyInfo]:
        ...
