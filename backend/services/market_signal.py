"""Per-stock market signal fetcher for scoring context."""
from __future__ import annotations
import asyncio
import math
import os
import random
import sys

# 禁用代理，akshare 直连东方财富等数据源
os.environ.pop("HTTP_PROXY", None)
os.environ.pop("HTTPS_PROXY", None)
os.environ.pop("http_proxy", None)
os.environ.pop("https_proxy", None)
os.environ["NO_PROXY"] = "*"


async def get_signals_for_companies(
    companies: list[dict],
) -> dict[str, dict[str, float | None]]:
    """Fetch market signals per company (A-share via AkShare, US via yfinance).

    Returns: {ticker: {return_1m, turnover_pct, volume_ratio, rsi_14, fund_flow}}
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


def _parse_net_amount(value: str) -> float | None:
    """Parse 净额 string like '-8.03亿' or '-6043.55万' to float in 亿."""
    if not value:
        return None
    try:
        if "亿" in str(value):
            return float(str(value).replace("亿", ""))
        if "万" in str(value):
            return round(float(str(value).replace("万", "")) / 10000, 4)
        return float(value)
    except (ValueError, TypeError):
        return None


async def _fetch_with_retry(ticker: str, fetch_fn, max_retries: int = 3):
    """Retry a fetch with exponential backoff and jitter for rate limiting."""
    for attempt in range(max_retries):
        try:
            return await fetch_fn(ticker)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            delay = (2 ** attempt) + random.uniform(0, 1)
            print(f"[market_signal] retry {ticker} in {delay:.1f}s: {type(e).__name__}", file=sys.stderr)
            await asyncio.sleep(delay)
    return None


async def _fetch_a_share(
    tickers: list[str],
) -> dict[str, dict[str, float | None]]:
    import akshare as ak

    results: dict[str, dict[str, float | None]] = {}

    # Fetch real-time fund flow for all stocks once (同花顺 即时 data)
    fund_flow_map: dict[str, float] = {}
    try:
        ff_df = ak.stock_fund_flow_individual(symbol="即时")
        for _, row in ff_df.iterrows():
            code = str(row["股票代码"])
            net = _parse_net_amount(row.get("净额"))
            if net is not None:
                fund_flow_map[code] = net
    except Exception as e:
        print(f"[market_signal] fund_flow fetch failed: {type(e).__name__}: {e}", file=sys.stderr)

    for ticker in tickers:
        # Small delay between tickers to avoid rate limiting
        if len(results) > 0:
            await asyncio.sleep(random.uniform(0.3, 0.8))

        # Strip exchange suffix for matching: "600584.SH" → "600584"
        clean_ticker = ticker.split(".")[0] if "." in ticker else ticker
        try:
            # Retry up to 3 times with backoff
            df = None
            for attempt in range(3):
                try:
                    df = ak.stock_zh_a_hist(
                        symbol=clean_ticker,
                        period="daily",
                        start_date="20250101",
                        end_date="20991231",
                        adjust="qfq",
                    )
                    break
                except Exception as e:
                    if attempt == 2:
                        raise
                    await asyncio.sleep((2 ** attempt) + random.uniform(0, 1))
            if df is None or len(df) < 22:
                print(f"[market_signal] A-share {ticker}: insufficient data (rows={len(df) if df is not None else 0})", file=sys.stderr)
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

            fund_flow = fund_flow_map.get(clean_ticker)

            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": turnover_pct,
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
                "fund_flow": fund_flow,
            }
        except Exception as e:
            print(f"[market_signal] fetch A-share {ticker} failed: {type(e).__name__}: {e}", file=sys.stderr)
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
                print(f"[market_signal] US {ticker}: insufficient data (rows={len(df) if df is not None else 0})", file=sys.stderr)
                continue
            close = df["Close"].astype(float)
            volume = df["Volume"].astype(float)

            ret_1m = float((close.iloc[-1] / close.iloc[-21] - 1) * 100)

            vol_5d = float(volume.iloc[-5:].mean())
            vol_20d = float(volume.iloc[-20:].mean())
            vol_ratio = round(vol_5d / vol_20d, 2) if vol_20d > 0 else None

            rsi = _calc_rsi(close, 14)

            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": None,  # yfinance no turnover data
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
                "fund_flow": None,  # yfinance no real-time fund flow
            }
        except Exception as e:
            print(f"[market_signal] fetch US {ticker} failed: {type(e).__name__}: {e}", file=sys.stderr)
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
            parts.append(f"主力净流 {s['fund_flow']:+.2f}亿")
        lines.append("- " + " ".join(parts))

    return "\n".join(lines)
