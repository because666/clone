# trajectory_lab — 飞行轨迹算法开发模块

独立的飞行轨迹算法开发区，与主项目完全隔离。

## 目录结构

```
trajectory_lab/
├── core/
│   ├── geo_utils.py      # 地理工具（haversine、插值）
│   ├── no_fly_zones.py   # 禁飞区数据结构与格网索引
│   ├── poi_loader.py     # POI 加载 + 净化（过滤被禁飞区覆盖的 demand）
│   └── planner.py        # 轨迹规划接口（当前：直线占位）
├── batch_generate.py     # 批量随机生成
├── single_generate.py    # 指定两点生成单条
└── server.py             # Flask REST API
```

## 快速上手

### 1. 安装依赖
```bash
pip install flask flask-cors
```

### 2. 批量生成轨迹（直接写入前端）
```bash
python trajectory_lab/batch_generate.py --city shenzhen --n 50
```

### 3. 指定两点生成单条轨迹
```bash
# 通过 POI ID
python trajectory_lab/single_generate.py --city shenzhen --from <poi_id> --to <poi_id>

# 通过经纬度
python trajectory_lab/single_generate.py --city shenzhen \
  --from-latlon 22.53,113.93 --to-latlon 22.55,113.95
```

### 4. 启动 API 服务（供前端调试面板调用）
```bash
python trajectory_lab/server.py
# 默认监听 http://127.0.0.1:5001
```

### 5. 启动前端
```bash
cd frontend && npm run dev
# 访问 http://localhost:5173
# 点击右上角 ⚡ 图标打开算法调试面板
```

## 🔑 关键设计：demand POI 净化

对每个城市，`poi_loader.load_city_pois()` 会自动过滤掉**落在禁飞区内的 demand POI**，避免不合规的起降点污染轨迹生成。

```python
from trajectory_lab.core.poi_loader import load_city_pois
city_pois = load_city_pois("shenzhen", buffer_m=0)
print(f"净化后可用: {len(city_pois.demand_clean)}")
print(f"被禁飞区覆盖: {len(city_pois.demand_blocked)}")
```

## 数据流

```
poi_loader（净化 demand）
       ↓
planner.plan(A, B, nfz_index)   ← 在此迭代算法
       ↓
{id, path:[lon,lat,alt][], timestamps:[]} JSON
       ↓
frontend/public/data/processed/trajectories/{city}_uav_trajectories.json
       ↓
前端 TripsLayer 自动渲染
```

## 当前算法版本

| 版本 | 文件 | 状态 |
|-----|------|------|
| v0 直线占位 | `core/planner.py` | ✅ 当前 |
| 后续迭代 | `core/planner.py` | 待开发 |

## 前端调试面板 API

| 接口 | 说明 |
|------|------|
| `GET /api/status` | 服务健康检查 |
| `GET /api/pois?city=shenzhen` | 获取净化后 demand POI 列表 |
| `POST /api/batch` | 批量生成 body: `{city, n, seed, min_dist, max_dist}` |
| `POST /api/single` | 单条生成 body: `{city, from_lat, from_lon, to_lat, to_lon, append}` |
