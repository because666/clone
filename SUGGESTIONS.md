# 📋 工程化改进建议

> 2026-03-29 架构重构完成后整理

## 🥇 高优先级

### 1. 统一前端 API 调用层
当前 `utils/api.ts`（axios 封装）仅 `LoginPage` 使用，其余 20+ 处均为裸 `fetch` + 手动拼 token。
- **建议**：所有 API 调用收口到统一的 service 层，消除 `localStorage.getItem('token')` 散落。

### 2. 消灭 MapContainer 中的 `any` 类型
`selectedFlight`、`hoverInfo`、`deckRef` 等核心变量仍为 `any`，答辩时被评委翻到会扣印象分。
- **建议**：为航班、轨迹、POI 等核心数据定义明确的 TypeScript 接口。

### 3. 补充单元测试
目前仅 `tests/test_algo.py` 一个测试文件，覆盖面不足。
- **建议**：后端补充 API 响应格式测试；前端补充 `useSandbox`、`useFlightPicking` Hook 测试。

## 🥈 中优先级

### 4. 前端旧响应格式迁移
后端 API 已统一为 `{code, data, message}`，但前端仍有多处 `if (data.ok)` 旧格式判断。
- **建议**：全量迁移前端的 `data.ok` → `data.code === 0`。

### 5. 数据处理脚本文档化
`scripts/` 下 10 个 Python 脚本无 README，缺乏执行顺序和用途说明。
- **建议**：编写 `scripts/README.md`，描述数据 pipeline 流程。

### 6. 环境变量管理
`.env` 文件基本为空，`SECRET_KEY` 硬编码在 `config.py` 默认值中。
- **建议**：完善 `.env.example`，展示多环境配置切换能力。

## 🥉 锦上添花

### 7. 更新部署配置
后端从单文件变为 Blueprint 架构，`Dockerfile` 和 `zeabur-start.sh` 的启动命令可能需要调整。

### 8. 添加 `/api/health` 健康检查端点
比现有 `/api/status` 更标准化，返回数据库状态、版本号，配合 Docker HEALTHCHECK 使用。
