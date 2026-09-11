# 乡筑工作台 · 前端（xiangzhu-web）

「乡村适老化建设辅助工作台」的前端应用：建档 → 调试 → 方案 三阶段工作台，
内置卫星图道路识别调试台与 AI 协作区。

> 配套后端：[xiangzhu-server](https://github.com/InLit-iaDuanna/xiangzhu-server)
> （fastify + 嵌入式 pglite + CodeBuddy CLI 视觉识别），前后端分离部署。

## 架构关系

```
┌────────────────────────────┐      /api/* 代理      ┌──────────────────────────┐
│  xiangzhu-web（本仓库）      │ ───────────────────▶ │  xiangzhu-server          │
│  vinext (React 19 / Vite)  │  BUSINESS_API_URL    │  fastify :4100            │
│  建档 / 调试 / 方案 / 协作区 │ ◀─────────────────── │  pglite 嵌入式库          │
└────────────────────────────┘   REST + SSE         │  CodeBuddy CLI 视觉识别    │
                                                    └──────────────────────────┘
```

- 页面与工作台：`app/`（`workspace.tsx` 为三阶段工作台主体）
- 共享纯函数库：`lib/`（空间数据模型、AI 识别结果解析、工作流判据等，与后端同源）
- 组件库：`components/`（shadcn/ui）；AI 协作区附件解析：`lib/assistant.ts`、`lib/ooxml.ts`
- 路由代理：`app/api/[...path]/route.ts` 把 `/api/*` 转发到后端 `BUSINESS_API_URL`

## 本地运行

```bash
# Node >= 22.13.0
npm install --legacy-peer-deps   # 必须带该参数（wrangler/better-auth peer 冲突）
npm run dev                      # http://localhost:3000
```

先启动后端（见 xiangzhu-server 仓库），否则板块数据接口不可用。

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `BUSINESS_API_URL` | 后端服务地址 | `http://127.0.0.1:4100` |

复制 `.env.example` 为 `.env.local` 修改即可；前端不存放任何密钥。

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（:3000） |
| `npm run build` | 生产构建（vinext → Cloudflare Workers 产物） |
| `npm run typecheck` | TypeScript 检查 |
| `npm run test` | vitest 单测（纯函数） |

## H5 可试用部署路线

1. 前端：`npm run build` 产出 Cloudflare Workers（vinext）产物，可部署到
   Cloudflare Pages / Workers；也可改造为纯静态托管。
2. 后端：部署到任意 Node 宿主（VPS / 容器），需配置 `PGLITE_DATA_DIR`
   持久化数据目录，并保证前端 `BUSINESS_API_URL` 指向该公网地址。
3. AI 能力依赖本机 CodeBuddy CLI（子进程方式调用），公网部署时需在
   宿主机安装并登录 CLI，或按 `AI_EXECUTOR` 环境变量接入其他视觉服务。
