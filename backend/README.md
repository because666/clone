# trajectory_lab — 飞行轨迹算法开发模块

独立的飞行轨迹算法开发区，与主项目完全隔离。

## 目录结构

```
trajectory_lab/
├── core/             # 核心算法逻辑
├── models/           # 模型文件 (pkl)
├── scripts/          # 入口脚本
│   ├── batch_generate.py
│   ├── single_generate.py
│   ├── generate_energy.py
│   └── server.py
└── tests/            # 测试脚本
```

## 快速上手

### 1. 安装依赖
```bash
pip install flask flask-cors pandas scikit-learn joblib
```

### 2. 批量生成轨迹（直接写入前端）
```bash
python trajectory_lab/scripts/batch_generate.py --city shenzhen --n 1000
```

### 3. 指定两点生成单条轨迹
```bash
# 通过 POI ID
python trajectory_lab/scripts/single_generate.py --city shenzhen --from <poi_id> --to <poi_id>

# 通过经纬度
python trajectory_lab/scripts/single_generate.py --city shenzhen \
  --from-latlon 22.53,113.93 --to-latlon 22.55,113.95
```

### 4. 启动 API 服务（供前端调试面板调用）
```bash
python trajectory_lab/scripts/server.py
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
| v0 直线占位 | `core/planner.py` | 历史版本 |
| v4 A*规避+错落高度 | `core/planner.py` | ✅ 当前 |
| 后续迭代 | `core/planner.py` | 待开发 |

## 前端调试面板 API

| 接口 | 说明 |
|------|------|
| `GET /api/status` | 服务健康检查 |
| `GET /api/pois?city=shenzhen` | 获取净化后 demand POI 列表 |
| `POST /api/batch` | 批量生成 body: `{city, n, seed, min_dist, max_dist}` |
| `POST /api/single` | 单条生成 body: `{city, from_lat, from_lon, to_lat, to_lon, append}` |
