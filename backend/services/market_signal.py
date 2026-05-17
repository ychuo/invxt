"""Per-stock market signal fetcher for scoring context."""
from __future__ import annotations
import math


async def get_signals_for_companies(
    companies: list[dict],
) -> dict[str, dict[str, float | None]]:
    """Fetch 4 market signals per company (A-share via AkShare, US via yfinance).

    Returns: {ticker: {return_1m, turnover_pct, volume_ratio, rsi_14}}
    Failed tickers excluded from result (graceful degradation).
    """
    a_tickers = [c["ticker"] for c in companies if c.get("market", "").upper() == "A"]
    us_tickers = [c["ticker"] for c in companies if c.get("market", "").upper() == "US"]

    results: dict[str, dict[str, float | None]] = {}

    if a_tickers:
        a_results = await _fetch_a_share(a_tickers)
        results.update(a_results)
    if us_tickers:
        us_results = await _fetch_us(us_tickers)
        results.update(us_results)

    return results


async def _fetch_a_share(
    tickers: list[str],
) -> dict[str, dict[str, float | None]]:
    import akshare as ak

    results: dict[str, dict[str, float | None]] = {}

    for ticker in tickers:
        # Strip exchange suffix for matching: "600584.SH" → "600584"
        clean_ticker = ticker.split(".")[0] if "." in ticker else ticker
        try:
            df = ak.stock_zh_a_hist(
                symbol=clean_ticker,
                period="daily",
                start_date="20250101",
                end_date="20991231",
                adjust="qfq",
            )
            if df is None or len(df) < 22:
                continue
            close = df["收盘"].astype(float)
            volume = df["成交量"].astype(float)
            turnover = df.get("换手率", None)
            if turnover is not None:
                turnover = turnover.astype(float)

            # return_1m: last 21 trading days cumulative return
            ret_1m = float((close.iloc[-1] / close.iloc[-21] - 1) * 100)

            # turnover_pct: percentile of avg daily turnover in last 21 days vs lookback
            if turnover is not None and len(turnover) >= 252:
                avg_21 = float(turnover.iloc[-21:].mean())
                pct = float((turnover.iloc[-252:] < avg_21).sum() / 252 * 100)
                turnover_pct = round(pct)
            elif turnover is not None and len(turnover) >= 63:
                avg_21 = float(turnover.iloc[-21:].mean())
                pct = float((turnover.iloc[-63:] < avg_21).sum() / 63 * 100)
                turnover_pct = round(pct)
            else:
                turnover_pct = None

            # volume_ratio: avg volume last 5 days / avg volume last 20 days
            vol_5d = float(volume.iloc[-5:].mean())
            vol_20d = float(volume.iloc[-20:].mean())
            vol_ratio = round(vol_5d / vol_20d, 2) if vol_20d > 0 else None

            # rsi_14
            rsi = _calc_rsi(close, 14)

            fund_flow = None
            try:
                mkt = "sh" if clean_ticker.startswith("6") else "sz"
                ff_df = ak.stock_individual_fund_flow(stock=clean_ticker, market=mkt)
                if ff_df is not None and len(ff_df) > 0:
                    net_flow = ff_df.iloc[0].get("主力净流入-净额")
                    if net_flow is not None:
                        fund_flow = round(float(net_flow) / 1e8, 2)
            except Exception:
                pass

            north_bound = None
            try:
                hsgt_df = ak.stock_hsgt_individual_em(symbol=clean_ticker)
                if hsgt_df is not None and len(hsgt_df) >= 5 and "今日增持资金" in hsgt_df.columns:
                    north_bound = round(float(hsgt_df.tail(5)["今日增持资金"].sum()) / 1e8, 2)
            except Exception:
                pass

            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": turnover_pct,
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
                "fund_flow": fund_flow,
                "north_bound": north_bound,
            }
        except Exception:
            continue

    return results


async def _fetch_us(
    tickers: list[str],
) -> dict[str, dict[str, float | None]]:
    import yfinance as yf

    results: dict[str, dict[str, float | None]] = {}
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            df = stock.history(period="1y")
            if df is None or len(df) < 22:
                continue
            close = df["Close"].astype(float)
            volume = df["Volume"].astype(float)

            ret_1m = float((close.iloc[-1] / close.iloc[-21] - 1) * 100)

            vol_5d = float(volume.iloc[-5:].mean())
            vol_20d = float(volume.iloc[-20:].mean())
            vol_ratio = round(vol_5d / vol_20d, 2) if vol_20d > 0 else None

            rsi = _calc_rsi(close, 14)

            inst_holding = None
            try:
                holders = stock.institutional_holders
                if holders is not None and len(holders) > 0 and "% Out" in holders.columns:
                    inst_holding = round(float(holders.iloc[:10]["% Out"].sum()), 1)
            except Exception:
                pass

            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": None,  # yfinance no turnover data
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
                "fund_flow": inst_holding,
                "north_bound": None,
            }
        except Exception:
            continue

    return results


def _calc_rsi(series, period: int = 14) -> float | None:
    """Calculate RSI for a price series. Returns None if insufficient data."""
    if len(series) < period + 1:
        return None
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = float(gain.iloc[-period:].mean())
    avg_loss = float(loss.iloc[-period:].mean())
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def format_signals_for_prompt(
    companies: list[dict],
    signals: dict[str, dict[str, float | None]],
) -> str:
    """Build the context string to inject into the LLM scoring prompt."""
    if not signals:
        return ""

    lines = ["📊 实时量价信号（辅助判断 market_awareness）："]
    for c in companies:
        ticker = c.get("ticker", "")
        s = signals.get(ticker)
        if not s:
            continue
        parts = [c.get("company_name", ticker)]
        if s.get("return_1m") is not None:
            parts.append(f"近1月 {s['return_1m']:+.1f}%")
        if s.get("turnover_pct") is not None:
            parts.append(f"换手率 {s['turnover_pct']}%分位")
        if s.get("volume_ratio") is not None:
            parts.append(f"量比 {s['volume_ratio']}x")
        if s.get("rsi_14") is not None:
            parts.append(f"RSI-14 {s['rsi_14']}")
        if s.get("fund_flow") is not None:
            parts.append(f"主力净流入 {s['fund_flow']:+.2f}亿")
        if s.get("north_bound") is not None:
            parts.append(f"北向净买 {s['north_bound']:+.2f}亿")
        lines.append("- " + " ".join(parts))

    return "\n".join(lines)
