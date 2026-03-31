# 📦 数据处理脚本集

> 本目录包含 AetherWeave 平台的数据采集、预处理和生成流水线脚本。

## 执行顺序

数据处理 Pipeline 分为 3 个阶段，**必须按顺序执行**：

### 阶段 1：原始数据采集

| 脚本 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `fetch_multi_city_data.py` | 从 OSM 采集多城市 POI + 建筑数据 | 城市列表配置 | `data/raw/{city}/` |
| `fetch_flight_datasets.py` | 从公开数据集下载真实航班数据 | 数据集 URL | `data/raw/flights/` |

### 阶段 2：数据预处理

| 脚本 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `process_multi_city.py` | 清洗 POI 并生成 GeoJSON | `data/raw/{city}/` | `data/processed/{city}/*.geojson` |
| `compress_geojson.py` | 压缩 GeoJSON 减小体积 | `data/processed/` | `data/processed/` (原地压缩) |
| `process_airlab_energy.py` | 处理 AirLab 能耗模型数据 | 原始能耗数据 | `data/processed/energy/` |
| `extract_uav_dynamics.py` | 从飞行数据提取动力学参数 | 航班数据 | 动力学配置文件 |

### 阶段 3：轨迹与能耗生成

| 脚本 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `generate_all_cities.py` | 批量生成所有城市的 UAV 轨迹 | 预处理后的 POI 数据 | `frontend/public/data/processed/trajectories/` |
| `energy_model.py` | 生成能耗仿真数据 | 轨迹数据 + 动力学参数 | `frontend/public/data/processed/energy/` |
| `prepare_frontend_data.py` | 最终前端数据打包 | 上述所有产物 | 前端可直接使用的 JSON |
| `migrate_json_to_db.py` | 将 JSON 轨迹迁移至 SQLite 数据库 | 轨迹 JSON | `instance/aetherweave.db` |

## 快速开始

```bash
# 1. 安装依赖
pip install -r backend/requirements.txt

# 2. 一键生成所有城市轨迹（最常用）
python scripts/generate_all_cities.py

# 3. 迁移到数据库（可选，后端服务也会自动 fallback 读 JSON）
python scripts/migrate_json_to_db.py
```

## 注意事项

- 所有脚本应从项目根目录 `d:/develop/demo/` 运行
- 确保 `PYTHONPATH=.` 已设置（参考 `.env.example`）
- 网络采集脚本需要稳定的互联网连接
