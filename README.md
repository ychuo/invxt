# InvXt

AI 驱动的产业链推理与投资主题映射。

输入一个模糊主题（如"液冷散热"、"低空经济"），系统自动完成产业链拆解、A 股/美股公司映射、暴露度评分，以结构化方式呈现投资机会图谱。

## 快速开始

### 1. 环境准备

```bash
# 启动基础设施（Neo4j、PostgreSQL、Redis）
docker compose up -d neo4j postgres redis

# 安装前端依赖
cd frontend && npm install
```

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY 和 TAVILY_API_KEY
```

### 3. 启动

```bash
./start.sh
```

访问 http://localhost:3000

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 + React + Tailwind CSS |
| 可视化 | d3-sankey（产业链桑基图） |
| 后端 | FastAPI + Python |
| LLM | DeepSeek（API 兼容 OpenAI 格式） |
| 图数据库 | Neo4j（产业链知识图谱） |
| 向量库 | PostgreSQL + pgvector |
| 缓存 | Redis |
| 搜索 | Tavily API（实时网页搜索） |

## 项目结构

```
invxt/
├── backend/
│   ├── api/routes/     # REST 端点
│   ├── services/       # LLM 客户端、分析 Pipeline、搜索
│   └── kg/             # Neo4j 客户端、向量存储
├── frontend/
│   └── src/
│       ├── app/        # 页面（首页 /、分析页 /analysis）
│       ├── components/ # UI 组件
│       └── lib/        # API 调用封装
├── docker-compose.yml  # 基础设施服务
├── start.sh            # 一键启动前后端
└── .env.example        # 环境变量模板
```

## License

MIT
