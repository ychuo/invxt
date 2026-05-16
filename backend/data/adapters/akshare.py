import akshare as ak
from backend.data.adapters.base import MarketDataAdapter, CompanyInfo


class AkShareAdapter(MarketDataAdapter):
    async def get_company_info(self, ticker: str) -> CompanyInfo | None:
        try:
            code = ticker.replace(".SH", "").replace(".SZ", "")
            df = ak.stock_individual_info_em(symbol=code)
            if df is None or df.empty:
                return None
            info = {row["item"]: row["value"] for _, row in df.iterrows()}
            return CompanyInfo(
                name=info.get("股票简称", ""),
                ticker=ticker,
                market="A",
                sector=info.get("行业", ""),
                description=info.get("主营范围", ""),
            )
        except Exception:
            return None

    async def get_concept_stocks(self, concept_name: str) -> list[CompanyInfo]:
        try:
            df = ak.stock_board_concept_cons_em(symbol=concept_name)
            if df is None or df.empty:
                return []
            return [
                CompanyInfo(name=row["名称"], ticker=row["代码"], market="A")
                for _, row in df.iterrows()
            ]
        except Exception:
            return []

    async def search_companies(self, keyword: str) -> list[CompanyInfo]:
        try:
            df = ak.stock_info_a_code_name()
            if df is None or df.empty:
                return []
            matches = df[df["名称"].str.contains(keyword, na=False)]
            return [
                CompanyInfo(name=row["名称"], ticker=row["代码"], market="A")
                for _, row in matches.head(20).iterrows()
            ]
        except Exception:
            return []
