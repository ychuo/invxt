from __future__ import annotations
import yfinance as yf
from backend.data.adapters.base import MarketDataAdapter, CompanyInfo


class YahooFinanceAdapter(MarketDataAdapter):
    async def get_company_info(self, ticker: str) -> CompanyInfo | None:
        try:
            stock = yf.Ticker(ticker)
            info = stock.info or {}
            return CompanyInfo(
                name=info.get("longName") or info.get("shortName", ""),
                ticker=ticker,
                market="US",
                sector=info.get("sector", ""),
                industry=info.get("industry", ""),
                description=info.get("longBusinessSummary", ""),
            )
        except Exception:
            return None

    async def get_concept_stocks(self, concept_name: str) -> list[CompanyInfo]:
        return []

    async def search_companies(self, keyword: str) -> list[CompanyInfo]:
        try:
            ticker = yf.Ticker(keyword.upper())
            info = ticker.info or {}
            if info.get("longName"):
                return [
                    CompanyInfo(
                        name=info.get("longName", ""),
                        ticker=keyword.upper(),
                        market="US",
                        sector=info.get("sector", ""),
                        description=info.get("longBusinessSummary", ""),
                    )
                ]
            return []
        except Exception:
            return []
