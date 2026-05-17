"""Company fundamental data fetcher — revenue composition, segment breakdowns."""
from __future__ import annotations

import pandas as pd


def _parse_a_share_revenue(df) -> dict[str, float] | None:
    """Parse AkShare stock_zygc_em output into {business_segment: revenue_pct}.

    Filters for the most recent reporting date and prefers product-level
    classification (按产品分类), falling back to industry-level (按行业分类).

    Expected columns: 分类类型, 报告日期, 主营构成, 收入比例
    Returns None if data unavailable or unparseable.
    """
    try:
        if df is None or len(df) == 0:
            return None

        # Determine the most recent report date
        df = df.copy()
        df["报告日期"] = pd.to_datetime(df["报告日期"], errors="coerce")
        latest = df["报告日期"].max()
        if pd.isna(latest):
            return None

        # Filter to most recent date
        recent = df[df["报告日期"] == latest]

        # Prefer product-level classification, fall back to industry-level
        product = recent[recent["分类类型"] == "按产品分类"]
        industry = recent[recent["分类类型"] == "按行业分类"]
        segments_df = product if len(product) > 0 else industry

        # Detect data format: decimal (0-1) or percentage (>1)
        max_pct = segments_df["收入比例"].max()
        is_decimal = max_pct <= 1.0

        segments: dict[str, float] = {}
        for _, row in segments_df.iterrows():
            name = str(row.get("主营构成", "")).strip()
            pct_val = row.get("收入比例")
            if name and pct_val is not None:
                pct = float(pct_val)
                if is_decimal:
                    pct = round(pct * 100, 1)
                else:
                    pct = round(pct, 1)
                if name != "其他(补充)" and pct > 0:
                    segments[name] = pct
                elif name == "其他(补充)" and pct > 5:
                    segments[name] = pct
        return segments if segments else None
    except Exception:
        return None


async def get_revenue_composition(ticker: str, market: str) -> dict[str, float] | None:
    """Fetch revenue composition for a single company.

    Returns {business_name: revenue_percentage} or None.
    """
    if market.upper() == "A":
        return await _fetch_a_share_revenue(ticker)
    # US: yfinance doesn't provide segment breakdowns in free tier.
    # For now return None; downstream services will use Tavily search instead.
    return None


async def _fetch_a_share_revenue(ticker: str) -> dict[str, float] | None:
    import akshare as ak

    # Determine market prefix: 6xxxxx -> SH, everything else in A market -> SZ
    prefix = "SH" if ticker.startswith("6") else "SZ"
    symbol = f"{prefix}{ticker}"

    try:
        df = ak.stock_zygc_em(symbol=symbol)
        return _parse_a_share_revenue(df)
    except Exception:
        return None


def format_fundamentals_for_prompt(
    companies: list[dict],
    fundamentals: dict[str, dict[str, float] | None],
) -> str:
    """Build the revenue context string for the LLM scoring prompt."""
    if not fundamentals:
        return ""

    lines = ["\n📊 真实营收构成（最新报告期）："]
    for c in companies:
        ticker = c.get("ticker", "")
        comp = fundamentals.get(ticker)
        if not comp:
            continue
        segments = "、".join(f"{k} {v}%" for k, v in list(comp.items())[:5])
        lines.append(f"- {c.get('company_name', ticker)}({ticker}): {segments}")

    return "\n".join(lines)
