# 市场信号增强 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增市场信号服务，拉取个股量价数据辅助 LLM 判断 market_awareness

**Architecture:** 新增 market_signal.py 独立服务，AkShare/yfinance 拉取 4 个量价信号 → 注入 scoring_agent prompt → LLM 有数据依据判断 priced_in/partially/under_the_radar

**Tech Stack:** AkShare, yfinance, Python async

---

### Task 1: 创建 market_signal.py

**Files:**
- Create: `backend/services/market_signal.py`

- [ ] **Step 1: 实现 market_signal.py**

```python
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
        us_results = await _fetch_us(a_tickers=us_tickers)
        results.update(us_results)

    return results


async def _fetch_a_share(
    tickers: list[str],
) -> dict[str, dict[str, float | None]]:
    import akshare as ak

    results: dict[str, dict[str, float | None]] = {}
    for ticker in tickers:
        try:
            df = ak.stock_zh_a_hist(
                symbol=ticker,
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

            # turnover_pct: percentile of avg daily turnover in last 21 days vs last 252 days
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

            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": turnover_pct,
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
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

            results[ticker] = {
                "return_1m": round(ret_1m, 1),
                "turnover_pct": None,  # yfinance no turnover data
                "volume_ratio": vol_ratio,
                "rsi_14": rsi,
            }
        except Exception:
            continue

    return results


def _calc_rsi(series, period: int = 14) -> float | None:
    """Calculate RSI-14 for a price series. Returns None if insufficient data."""
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
        lines.append("- " + " ".join(parts))

    return "\n".join(lines)
```

- [ ] **Step 2: 验证 AkShare 能正常拉取数据**

```bash
/usr/bin/python3 -c "
import akshare as ak
df = ak.stock_zh_a_hist(symbol='600584', period='daily', start_date='20250101', end_date='20991231', adjust='qfq')
print(f'rows: {len(df)}, columns: {list(df.columns)}')
print(df.tail(3))
"
```

Expected: 正常输出长电科技日 K 线数据

- [ ] **Step 3: 验证 yfinance 能正常拉取数据**

```bash
/usr/bin/python3 -c "
import yfinance as yf
nvda = yf.Ticker('NVDA')
df = nvda.history(period='1y')
print(f'rows: {len(df)}, columns: {list(df.columns)}')
print(df.tail(3))
"
```

Expected: 正常输出 NVDA 近 1 年数据

- [ ] **Step 4: Commit**

```bash
git add backend/services/market_signal.py
git commit -m "feat: add market signal service with 4 per-stock indicators

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 集成到 scoring pipeline

**Files:**
- Modify: `backend/services/scoring_agent.py`
- Modify: `backend/services/pipeline.py`

- [ ] **Step 1: 修改 scoring_agent.py 的 score 方法接收 signals**

在 `scoring_agent.py` 的 `score` 方法中：

```python
async def score(
    self,
    theme_name: str,
    companies: list[dict],
    signals: dict[str, dict[str, float | None]] | None = None,
) -> list[dict]:
    if not companies:
        return []

    # Build signal context
    from backend.services.market_signal import format_signals_for_prompt
    signal_context = format_signals_for_prompt(companies, signals or {})

    result = await self._llm.chat_with_json(
        system_prompt=SYSTEM_PROMPT,
        user_message=f"""主题：{theme_name}

公司列表（无特定顺序）：
{json.dumps(companies, ensure_ascii=False, indent=2)}

{signal_context}

请提取每家公司的结构化信息。注意：market_awareness 的判断需要结合上述量价信号——涨幅大+换手高+RSI高的标的通常已定价。""",
        temperature=0,
        max_tokens=16384,
    )

    extracted = result if isinstance(result, list) else []
    return _compute_scores(extracted)
```

- [ ] **Step 2: 修改 pipeline.py 在评分前调用 market_signal**

在 `pipeline.py` 第 203 行 `self._scoring_agent.score(...)` 之前插入：

```python
        # Step 4: Scoring (with market signals)
        state.current_step = "scoring"
        await self._emit(state)
        display_name = state.theme_result.get("theme_name", topic)
        try:
            from backend.services.market_signal import get_signals_for_companies
            signals = await get_signals_for_companies(state.company_results)
        except Exception:
            signals = {}
        try:
            state.scored_results = await self._scoring_agent.score(
                display_name, state.company_results, signals
            )
```

- [ ] **Step 3: 验证完整流程**

重启后端，提交一个分析请求，检查评分结果中的 market_awareness 是否有数据支撑：

```bash
./start.sh &
sleep 5
curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"topic":"HBM","market":"A"}' | python3 -m json.tool
# 等待几秒后 polling
sleep 10
curl -s "http://localhost:8000/api/theme/<task_id>" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for c in d.get('scored', []):
    print(c['company_name'], c['revenue_tier'], c['market_awareness'], c['exposure_score'])
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/services/scoring_agent.py backend/services/pipeline.py
git commit -m "feat: integrate market signals into scoring pipeline

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
