# 市场信号增强 — 实时量价数据辅助 market_awareness 判断

> 日期：2026-05-17 | 状态：已确认

## 问题

`scoring_agent.py` 中的 `market_awareness`（priced_in / partially_recognized / under_the_radar）判断完全依赖 LLM 训练数据，没有实时市场数据支撑。LLM 不知道个股近期涨跌幅、换手率等客观信号，无法准确判断"市场是否已定价"。

## 方案

新增轻量级市场信号服务，在评分阶段为每家公司拉取 4 个量价信号，作为 LLM 判断 `market_awareness` 的客观依据。

### 新增文件

`backend/services/market_signal.py`

### 四个信号

| 信号 | 计算方式 | 数据源 |
|------|---------|--------|
| `return_1m` | 近 21 交易日累计涨跌幅 | AkShare `stock_zh_a_hist` / yfinance |
| `turnover_pct` | 近 21 交易日日均换手率分位（vs 近 1 年） | 同上 |
| `volume_ratio` | 近 5 日成交均量 / 近 20 日成交均量 | 同上 |
| `rsi_14` | 14 日 RSI | 同上 |

### 给 LLM 的上下文

```
📊 实时量价信号（截止 {日期}）：
- 长电科技(600584): 近1月涨幅 +23.5% 换手率85%分位 量比2.1x RSI-14 72.3
- 通富微电(002156): 近1月涨幅 +8.2% 换手率45%分位 量比1.3x RSI-14 55.1
- ...
```

LLM 据此判断：
- 涨幅大 + 换手高 + RSI>70 → priced_in
- 涨幅适中 + 换手正常 → partially_recognized
- 涨幅小 + 换手低 → under_the_radar

### 数据流

```
pipeline.py (step 4 scoring)
    ↓ 传入 companies: [{company_name, ticker, market}, ...]
market_signal.py
    ↓ A 股 → AkShare stock_zh_a_hist(ticker, period="daily", adjust="qfq")
    ↓ 美股 → yfinance download(ticker, period="1y")
    ↓ 返回 {ticker: {return_1m, turnover_pct, volume_ratio, rsi_14}}
scoring_agent.py
    ↓ 将信号注入 user_message
    ↓ LLM 有数据依据判断 market_awareness
_compute_scores() 算法不变
```

### 容错

- 单只股票数据获取失败 → 该股信号标注为 "N/A"，LLM 自行判断
- AkShare 全挂 → 跳过所有信号，回退到纯 LLM 判断（当前行为）
- 不阻塞 pipeline

### 不改

- 前端
- 评分算法 `_compute_scores()`
- 评分对外接口
- `revenue_tier` 判断逻辑（这个不需要量价数据）
