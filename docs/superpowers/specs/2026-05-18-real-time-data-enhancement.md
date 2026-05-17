# 三维实时数据增强

> 日期：2026-05-18 | 状态：已确认

## 问题

分析页信息的实时性在三个维度存在不足：

1. **公司基本面**：revenue_tier（core/important/marginal/concept）完全依赖 LLM 训练数据判断，没有真实财报数据支撑。LLM 不知道公司的实际营收构成。
2. **产业链动态**：ChainAgent 和 MappingAgent 只有 pipeline 开头的一次通用 Tavily 搜索作为实时输入，没有各自领域的定向实时信息。
3. **市场情绪**：已有 4 个技术面量价信号，缺少资金面信号（主力资金流向、北向资金、机构持仓变化）。

## 方案

三个维度各自增强数据源，结构化数据做基础判断，LLM 做验证和微调（方案 B）。

### 维度一：公司基本面

新增 `backend/services/fundamental_service.py`，在 scoring 前拉取真实营收构成数据。

**A 股**：AkShare `stock_zyjs_ths(symbol)` 主营构成表
```
业务名称        收入(元)      收入比例
先进封装        45.2亿        45.2%
传统封装        30.1亿        30.1%
```

**美股**：yfinance `ticker.info`（sector/industry/businessSummary）+ Tavily 定向搜索补强（"NVDA data center revenue percentage 2025"）

**注入方式**：结构化营收数据注入 scoring prompt，LLM 据此判断 revenue_tier：
```
📊 真实营收构成（最新报告期）：
- 长电科技(600584): 先进封装 45.2%, 传统封装 30.1%, 测试 14.9%
```

### 维度二：产业链动态

新增 `backend/services/news_service.py`，提供两级定向搜索：

**技术方向级**（ChainAgent）：Tavily 定向搜索 → LLM 提取结构化事件
```json
{"events": [{"type": "产能扩张", "summary": "...", "date": "2026-05"}]}
```

**公司级**（MappingAgent）：A 股 AkShare `stock_notice_report` + 美股 Tavily 搜索 → 提取关键事件（订单、客户突破、风险提示等）

### 维度三：市场情绪

扩展 `backend/services/market_signal.py`，从 4 个信号扩到 6-7 个：

| 新增信号 | A 股来源 | 美股来源 |
|---------|---------|---------|
| `fund_flow` | AkShare 个股资金流向 | yfinance institutional_holders 变化 |
| `north_bound` | AkShare 沪深港通个股 | — |
| `inst_change` | — | yfinance institutional_holders |

### 数据流

```
Step 2: Chain Reasoning
  ├─ news_service.get_industry_news(tech_name) → 结构化事件
  └─ ChainAgent(tech, news_context)

Step 3: Company Mapping
  ├─ news_service.get_company_news(ticker) → 结构化事件
  └─ MappingAgent(node, news_context)

Step 4: Scoring
  ├─ fundamental_service.get_revenue_composition() → 营收构成
  ├─ market_signal.get_signals() → 6-7 个信号
  └─ ScoringAgent(theme, companies, signals, fundamentals)
```

### 容错

所有外部数据拉取失败时回退到纯 LLM 判断（当前行为），不阻塞 pipeline。

### 不改

- 前端 UI
- 评分算法 `_compute_scores()`
- 评分对外接口
- pipeline 整体结构（5 步不变）
- LLM client
- 首页 trending 逻辑

### 文件变更

- Create: `backend/services/fundamental_service.py`
- Create: `backend/services/news_service.py`
- Modify: `backend/services/market_signal.py` — 扩展信号
- Modify: `backend/services/scoring_agent.py` — 接收并注入基本面数据
- Modify: `backend/services/chain_agent.py` — 接收并注入行业新闻
- Modify: `backend/services/mapping_agent.py` — 接收并注入公司新闻
- Modify: `backend/services/pipeline.py` — 编排新数据拉取步骤
