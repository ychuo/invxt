import pytest
from backend.data.adapters.akshare import AkShareAdapter
from backend.data.adapters.yahoo import YahooFinanceAdapter


@pytest.mark.asyncio
async def test_akshare_search():
    adapter = AkShareAdapter()
    results = await adapter.search_companies("长电")
    assert len(results) > 0
    assert any("长电" in c.name for c in results)


@pytest.mark.asyncio
async def test_yahoo_get_company():
    adapter = YahooFinanceAdapter()
    info = await adapter.get_company_info("NVDA")
    assert info is not None
    assert info.ticker == "NVDA"
    assert info.market == "US"
    assert len(info.name) > 0
