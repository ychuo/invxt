# Invxt — 主题投资分析系统 设计文档

> 日期：2026-05-16 | 状态：已确认

## 概述

Invxt 是一个 AI 驱动的主题投资分析工具。用户输入一个模糊主题（如 "HBM"、"低空经济"），系统自动完成产业链拆解、A股/美股公司映射、关联强度评分，以结构化方式呈现投资机会图谱。

## 范围

### Phase 1 包含

- 主题输入 → 产业链推理 → 公司映射 → 暴露度评分
- A股 + 美股双市场覆盖
- Neo4j 知识图谱（实体 + 关系）
- 本地 Web 应用（Next.js 前端）
- 产业链图谱可视化（React Flow）
- 公司映射表格 + 投资逻辑卡片
- 主题搜索 + 历史查询
- WebSocket 流式推送分析进度

### Phase 1 不包含

- 实时热点自动发现
- 预期差分析
- 动态事件/新闻追踪
- 资金流向分析
- 用户系统、权限、多租户
- LangGraph / multi-agent 编排（先用 prompt chain）

## 目标用户

个人投资者，自己使用。不需要用户系统或认证。

## 架构总览

五层架构：

```
数据层（AkShare, Yahoo Finance, 财联社 RSS）
    ↓
知识图谱层（Neo4j 关系图 + pgvector 语义检索）
    ↓
AI 推理层（DeepSeek 驱动的 4 步 prompt chain）
    ↓
API 层（FastAPI REST + WebSocket）
    ↓
产品层（Next.js Web 应用）
```

### 基础设施（Docker Compose）

| 服务 | 端口 | 用途 |
|------|------|------|
| FastAPI | 8000 | 后端 API |
| Next.js | 3000 | 前端开发服务器 |
| Neo4j | 7474 / 7687 | 图数据库 |
| PostgreSQL | 5432 | 关系 + pgvector |
| Redis | 6379 | 缓存 |

## 知识图谱 Schema

### 实体节点（6 类）

| 类型 | Label | 关键属性 | 示例 |
|------|-------|---------|------|
| 主题 | `:Theme` | name, aliases, description, category | HBM, 低空经济 |
| 技术/工艺 | `:Technology` | name, description, maturity | TSV, 先进封装 |
| 材料/部件 | `:Material` | name, description, category | DRAM, 硅片 |
| 设备 | `:Equipment` | name, description, type | 光刻机, 刻蚀设备 |
| 产品 | `:Product` | name, description | AI GPU, CDU |
| 公司 | `:Company` | name, ticker, market, sector, description | 长电科技, NVIDIA |

### 关系边（6 类）

| 关系 | 方向 | 属性 |
|------|------|------|
| `:REQUIRES` | Theme → Technology | importance (0-1) |
| `:USES_MATERIAL` | Technology → Material | criticality |
| `:USES_EQUIPMENT` | Technology → Equipment | criticality |
| `:PRODUCES` | Company → Product | revenue_share, is_core |
| `:SUPPLIES` | Company → Material/Equipment | market_share, relevance |
| `:EXPOSED_TO` | Company → Theme | score (0-100), reasoning |

### 跨市场设计

- 主题和技术节点不区分市场，产业链逻辑全球通用
- 公司通过 `market` 属性（"A" / "US"）区分市场
- 映射时做市场过滤 + 跨国供应链关联

## AI 推理链（Prompt Chain）

4 步顺序执行，每步结果缓存，失败可单步重试：

### Step 1: 主题理解
- **输入**: 用户原始主题字符串
- **输出**: 结构化主题信息（名称、分类、核心技术方向）
- **策略**: DeepSeek 单次调用，结构化 prompt 约束 JSON 输出

### Step 2: 产业链推理
- **输入**: Step 1 输出的技术方向 + Neo4j 图遍历 + pgvector 语义相似检索
- **输出**: 每个方向的上下游、关键材料、关键设备
- **策略**: DeepSeek + 知识图谱双路召回增强

### Step 3: 公司映射
- **输入**: Step 2 输出的产业链节点 + 目标市场
- **输出**: 每家公司及其关联逻辑
- **策略**: DeepSeek + Neo4j `:SUPPLIES` 图遍历 + 向量检索

### Step 4: 暴露度评分
- **输入**: Step 3 的公司列表 + 主题上下文
- **评分维度**: 产品关联度、收入/利润弹性、产业链核心度、竞争壁垒、市场认知度
- **输出**: 排序后的公司列表，含暴露度分数和投资逻辑
- **写回**: 评分结果写入 Neo4j `:EXPOSED_TO` 关系

### Pipeline 设计原则

- 渐进式处理：每步结果缓存到 Redis
- 结果回写图谱：每次分析积累知识
- 流式输出：WebSocket 推送每步中间结果

## 数据层

### 数据源

| 数据源 | 用途 | 市场 | SDK |
|--------|------|------|-----|
| AkShare | 公司信息、概念板块、财务 | A股 | akshare |
| Yahoo Finance | 公司信息、财务、行业分类 | 美股 | yfinance |
| 财联社 RSS | 快讯、主题新闻 | 通用 | HTTP |
| DeepSeek 批量 | 公司描述、产业链关系 | 通用 | API |

### 适配器模式

统一 `MarketDataAdapter` 基类接口，具体实现可替换：

```python
class MarketDataAdapter(ABC):
    def get_company_info(ticker: str) -> CompanyInfo
    def get_sector_mapping() -> dict
    def search_companies(keyword: str) -> list[CompanyInfo]
```

实现：`AkShareAdapter`（A股）、`YahooFinanceAdapter`（美股），预留 `TushareAdapter`（未来升级）。

### ETL 流程

数据拉取 → 实体提取（公司名、产品、技术词）→ bge-m3 向量化 pgvector → LLM + 规则构建图谱节点与边。

### 知识图谱初始构建

- LLM 批量生成产业链关系链
- 从 AkShare 概念板块提取公司-主题关联
- 从公司描述提取产品信息
- 每次主题分析结果自动写回图谱（冷启动积累）

## 前端页面

技术栈：**Next.js (App Router) + React Flow + Tailwind CSS + React Query + WebSocket**

### 页面 1：首页 `/`

- 大搜索框 + 快速标签（HBM、低空经济等）
- A股 / 美股 / 全部 切换
- 简洁，侧重输入效率

### 页面 2：分析结果 `/analysis?q=<topic>`

四个信息区块：

1. **主题摘要** — 名称、分类标签、一句话概述
2. **产业链图谱** — React Flow 渲染 DAG，可拖拽、缩放、点击节点展开公司
3. **公司映射表格** — 排名、公司、代码、产业环节、暴露度评分、关联逻辑
4. **投资逻辑卡片** — 核心逻辑、关键变量、风险提示

分析过程通过 WebSocket 流式展示进度，前端逐步渲染。

## 后端 API

技术栈：**FastAPI + Python**

### REST 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/analyze` | 提交主题，返回 task_id |
| `GET` | `/api/theme/{id}` | 查询已有分析结果 |
| `GET` | `/api/company/{ticker}` | 公司详情（主题、暴露度、图谱位置） |
| `GET` | `/api/graph/{theme_id}` | 图谱子图数据（React Flow 渲染用） |
| `GET` | `/api/search` | 搜索公司/主题（自动补全） |

### WebSocket

`/ws/analyze/{task_id}` — 流式推送 4 步进度，每步完成即推送中间结果 JSON。

### 目录结构

```
invxt/
├── backend/
│   ├── api/
│   │   ├── routes/        # analyze.py, theme.py, company.py, graph.py
│   │   ├── ws/            # analyze.py
│   │   └── main.py        # FastAPI app
│   ├── services/
│   │   ├── pipeline.py    # 4-step 推理链编排
│   │   ├── theme_agent.py # Step 1
│   │   ├── chain_agent.py # Step 2
│   │   ├── mapping_agent.py # Step 3
│   │   ├── scoring_agent.py # Step 4
│   │   └── llm_client.py  # DeepSeek API 封装
│   ├── data/
│   │   ├── adapters/      # base.py, akshare.py, yahoo.py
│   │   ├── etl.py
│   │   └── seed_kg.py     # 初始图谱构建
│   ├── kg/
│   │   ├── neo4j_client.py
│   │   ├── vector_store.py
│   │   └── schemas.py
│   └── config.py
├── frontend/              # Next.js 应用
├── docker-compose.yml
└── README.md
```

## 技术选型汇总

| 层级 | 技术 | 原因 |
|------|------|------|
| 前端框架 | Next.js (App Router) | React 生态，路由+SSR |
| 可视化 | React Flow | 产业链 DAG 可交互 |
| 样式 | Tailwind CSS | 快速构建 |
| 后端框架 | FastAPI | Python 异步，WebSocket 原生支持 |
| LLM | DeepSeek | 中文产业理解好，性价比高 |
| 图数据库 | Neo4j | 产业链关系查询 |
| 向量数据库 | pgvector | 嵌入 PostgreSQL，不需要额外服务 |
| 关系数据库 | PostgreSQL | 元数据存储 |
| 缓存 | Redis | 分析结果缓存 |
| 基础设施 | Docker Compose | 本地统一管理所有服务 |
| 数据（A股） | AkShare | 免费，Python SDK |
| 数据（美股） | Yahoo Finance (yfinance) | 免费，Python SDK |
| Embedding | bge-m3 | 中文语义检索效果好 |

## AI 模型

- **主推理模型**: DeepSeek（Chat API）
- **Embedding**: bge-m3（通过本地或 API 调用）

## 关键设计决策

1. **Python 后端而非 TypeScript 全栈** — AkShare 和 yfinance 只有 Python SDK，数据层无法迁移
2. **Neo4j 而非纯向量检索** — 产业链关系（上下游、供应、竞争）用图数据库表达更精确，长期积累价值更大
3. **Prompt chain 而非 LangGraph** — Phase 1 规模下 prompt chain 更可控、易调试，Phase 2 再引入编排框架
4. **适配器模式数据层** — 方便后续从免费数据源升级到 Tushare 等专业数据源

## 下一步

1. 实现计划拆分（writing-plans）
2. 搭建 Docker Compose 基础设施
3. 知识图谱 seed 脚本（LLM 批量构建初始产业链）
4. 后端 API + 推理链实现
5. 前端页面实现
