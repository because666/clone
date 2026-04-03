# 方向二：因果推理图谱 — 详细实施方案

> **目标**: 让告警系统从"孤立报警"进化为"连锁反应解释 + 智能缓解策略"
> **核心价值**: 评委看到的不是"又一个告警弹窗"，而是"这个系统能像空管员一样思考"
> **预估工时**: 3.5 天（可两人并行：后端 2 天 / 前端 1.5 天）

---

## 一、要解决的问题

当前系统的三类告警（`low-battery`、`danger-zone`、`conflict`）是**彼此独立**的。
`AlertNotificationProvider.tsx` (L43-84) 每次只推送一条孤立消息，不关联也不推理。

**真实场景中的连锁反应**：
```
起降点 A 因强风关闭
  → 正飞往 A 的 8 架 UAV 需要转场备降点 B
    → B 点空域瞬时涌入 8+5=13 架 UAV（原有 5 架）
      → 3 条航线在 B 点附近交叉，冲突概率从 2% 飙升到 67%
        → 建议：分流 4 架至 C 点 / 全局降速 30%
```

你们现有的 `checkAlerts`（`useUAVAnimation.ts` L296-526）已经**有能力检测到**每一步的单点事件，但无法把它们串成因果链。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│                    前端展示层                         │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ 告警侧栏      │  │ 3D 大屏覆盖层 │                │
│  │ (因果链展开)   │  │ (受影响航线)  │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │                  │                         │
│         └────── SSE 推送 ──┘                         │
├─────────────────────────────────────────────────────┤
│                    后端推理层                         │
│  ┌──────────────────────────────────────────────┐   │
│  │  POST /api/causal/analyze                     │   │
│  │                                               │   │
│  │  1. 接收根事件（如"POI-A关闭"）                 │   │
│  │  2. 查询 AirspaceCausalGraph 传播影响           │   │
│  │  3. 调用 A* planner 生成替代方案                │   │
│  │  4. 调用 Qwen 生成自然语言解释                   │   │
│  │  5. 返回 {影响链, 缓解方案[], 严重度}            │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  AirspaceCausalGraph (内存常驻)                │   │
│  │                                               │   │
│  │  节点: POI起降点 / 航道段 / 气象区              │   │
│  │  边:   服务关系 / 穿越关系 / 空域重叠度          │   │
│  │  数据源: poi_loader.py + FlightLog             │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 三、后端实现

### 3.1 新建 `backend/core/causal_graph.py`

```python
"""
causal_graph.py — 低空经济空域因果关系图谱

基于 POI 起降点、航道段、禁飞区构建有向加权图，
支持事件影响传播和缓解策略推理。
"""
import math
import logging
from dataclasses import dataclass, field
from collections import defaultdict

from .geo_utils import haversine_m
from .poi_loader import CityPOIs, DemandPOI
from .planner import plan

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════
# 图谱节点定义
# ═══════════════════════════════════════════════

@dataclass
class GraphNode:
    """图谱节点基类"""
    node_id: str
    node_type: str      # "POI" | "CORRIDOR" | "WEATHER_ZONE"
    lat: float
    lon: float
    name: str = ""
    capacity: int = 50  # 瞬时承载上限（POI 类型专用）

@dataclass
class CausalEdge:
    """图谱有向边"""
    source: str         # 源节点 ID
    target: str         # 目标节点 ID
    edge_type: str      # "SERVES" | "OVERLAPS" | "AFFECTED_BY"
    weight: float       # 影响权重 (0~1)

@dataclass
class ImpactChainItem:
    """影响链中的一个环节"""
    step: int
    description: str
    severity: float     # 0~1
    affected_uavs: list[str] = field(default_factory=list)
    affected_pois: list[str] = field(default_factory=list)

@dataclass
class MitigationPlan:
    """缓解方案"""
    plan_id: str
    title: str
    description: str
    actions: list[dict]             # 具体操作步骤
    estimated_risk_reduction: float # 预估风险降低比例

@dataclass
class CausalAnalysisResult:
    """因果分析完整结果"""
    root_event: dict
    impact_chain: list[ImpactChainItem]
    overall_severity: float
    mitigations: list[MitigationPlan]
    ai_explanation: str = ""        # Qwen 自然语言解释
    affected_flight_ids: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════
# 核心图谱引擎
# ═══════════════════════════════════════════════

class AirspaceCausalGraph:
    """
    空域因果关系图谱

    构建时机: 城市 POI 加载完成后（server.py 启动阶段）
    更新时机: 批量生成轨迹后重建航道段关系
    """

    # 两个 POI 之间距离 < CORRIDOR_THRESHOLD_M 认为存在潜在航道
    CORRIDOR_THRESHOLD_M = 8000
    # 两条航道间距 < OVERLAP_THRESHOLD_M 认为存在空域重叠
    OVERLAP_THRESHOLD_M = 300

    def __init__(self):
        self.nodes: dict[str, GraphNode] = {}
        self.edges: list[CausalEdge] = []
        # 邻接表: node_id -> [(target_id, edge)]
        self._adj: dict[str, list[tuple[str, CausalEdge]]] = defaultdict(list)
        # POI -> 关联航线 ID 列表
        self._poi_flights: dict[str, list[str]] = defaultdict(list)

    def build_from_city(self, city_pois: CityPOIs, flight_logs: list[dict] = None):
        """
        从城市 POI 数据构建图谱

        Args:
            city_pois: CityPOIs 对象（来自 poi_loader.load_city_pois）
            flight_logs: 可选的飞行记录列表 [{"id", "path", "timestamps"}, ...]
        """
        self.nodes.clear()
        self.edges.clear()
        self._adj.clear()
        self._poi_flights.clear()

        # 1. 添加 POI 节点
        for poi in city_pois.demand_clean:
            node = GraphNode(
                node_id=f"POI_{poi.poi_id}",
                node_type="POI",
                lat=poi.lat,
                lon=poi.lon,
                name=poi.name,
                capacity=50,
            )
            self.nodes[node.node_id] = node

        # 2. 添加禁飞区节点（作为约束节点）
        for i, nfz in enumerate(city_pois.nfz_index.zones):
            node = GraphNode(
                node_id=f"NFZ_{i}",
                node_type="NFZ",
                lat=nfz.lat,
                lon=nfz.lon,
                name=nfz.name or f"禁飞区-{nfz.category}",
            )
            self.nodes[node.node_id] = node

        # 3. 从飞行记录推断航道段关系
        if flight_logs:
            self._build_corridors_from_flights(flight_logs, city_pois)

        # 4. 计算 POI 间空域重叠度
        self._build_overlap_edges()

        logger.info(
            f"[CausalGraph] 构建完成: "
            f"{len(self.nodes)} 节点, {len(self.edges)} 边, "
            f"{len(self._poi_flights)} 个 POI 有关联航线"
        )

    def _build_corridors_from_flights(self, flights: list[dict], city_pois: CityPOIs):
        """从飞行记录反推 POI 服务关系"""
        poi_coords = {
            f"POI_{p.poi_id}": (p.lat, p.lon)
            for p in city_pois.demand_clean
        }

        for flight in flights:
            fid = flight.get("id", "")
            if fid.endswith("_ghost"):
                continue
            path = flight.get("path", [])
            if len(path) < 2:
                continue

            start_lon, start_lat = path[0][0], path[0][1]
            end_lon, end_lat = path[-1][0], path[-1][1]

            # 找最近的起/终点 POI（阈值 500m）
            start_poi = self._find_nearest_poi(start_lat, start_lon, poi_coords, 500)
            end_poi = self._find_nearest_poi(end_lat, end_lon, poi_coords, 500)

            if start_poi:
                self._poi_flights[start_poi].append(fid)
                self._add_edge(start_poi, f"FLIGHT_{fid}", "SERVES", 1.0)
            if end_poi:
                self._poi_flights[end_poi].append(fid)
                self._add_edge(f"FLIGHT_{fid}", end_poi, "SERVES", 1.0)

    def _find_nearest_poi(self, lat, lon, poi_coords, threshold_m):
        """找距离最近的 POI 节点（阈值内）"""
        best_id = None
        best_dist = threshold_m
        for pid, (plat, plon) in poi_coords.items():
            d = haversine_m(lat, lon, plat, plon)
            if d < best_dist:
                best_dist = d
                best_id = pid
        return best_id

    def _build_overlap_edges(self):
        """计算 POI 间空域重叠度——共享航线越多权重越高"""
        poi_ids = [nid for nid, n in self.nodes.items() if n.node_type == "POI"]

        for i in range(len(poi_ids)):
            for j in range(i + 1, len(poi_ids)):
                pid_a, pid_b = poi_ids[i], poi_ids[j]
                flights_a = set(self._poi_flights.get(pid_a, []))
                flights_b = set(self._poi_flights.get(pid_b, []))
                shared = flights_a & flights_b

                if shared:
                    # 重叠度 = 共享航线数 / 两者航线并集数
                    overlap = len(shared) / max(len(flights_a | flights_b), 1)
                    self._add_edge(pid_a, pid_b, "OVERLAPS", overlap)
                    self._add_edge(pid_b, pid_a, "OVERLAPS", overlap)

    def _add_edge(self, src: str, tgt: str, etype: str, weight: float):
        edge = CausalEdge(src, tgt, etype, weight)
        self.edges.append(edge)
        self._adj[src].append((tgt, edge))

    # ─────────────────────────────────────────────
    # 核心推理：事件影响传播
    # ─────────────────────────────────────────────

    def propagate_event(self, event: dict) -> CausalAnalysisResult:
        """
        给定根事件，沿图谱的边传播，计算影响链。

        event 结构:
        {
            "type": "POI_CLOSED" | "UAV_FAULT" | "WEATHER_ALERT",
            "target_id": "POI_xxx",        # 受影响的起降点
            "reason": "强风超速 > 12m/s",
            "city": "shenzhen",
        }

        Returns: CausalAnalysisResult
        """
        event_type = event.get("type", "UNKNOWN")
        target_id = event.get("target_id", "")
        reason = event.get("reason", "")
        city = event.get("city", "shenzhen")

        chain: list[ImpactChainItem] = []
        affected_flights: list[str] = []
        affected_pois: list[str] = []

        # ── Step 1: 直接影响 ──
        direct_flights = self._poi_flights.get(target_id, [])
        target_node = self.nodes.get(target_id)
        target_name = target_node.name if target_node else target_id

        chain.append(ImpactChainItem(
            step=1,
            description=f"起降点 {target_name} 因[{reason}]关闭",
            severity=0.9,
            affected_pois=[target_id],
        ))

        if direct_flights:
            chain.append(ImpactChainItem(
                step=2,
                description=f"{len(direct_flights)} 条航线受到直接影响，需要转场备降",
                severity=0.7,
                affected_uavs=direct_flights[:20],  # 截断防止过长
            ))
            affected_flights.extend(direct_flights)

        # ── Step 2: 二跳传播——找备降点并评估过载风险 ──
        neighbors = self._adj.get(target_id, [])
        overflow_pois = []

        for neighbor_id, edge in neighbors:
            if edge.edge_type != "OVERLAPS":
                continue
            neighbor_flights = self._poi_flights.get(neighbor_id, [])
            neighbor_node = self.nodes.get(neighbor_id)
            if not neighbor_node:
                continue

            # 计算转场后的负载
            current_load = len(neighbor_flights)
            incoming = int(len(direct_flights) * edge.weight)
            new_load = current_load + incoming
            capacity = neighbor_node.capacity

            if new_load > capacity * 0.8:
                overflow_pois.append({
                    "poi_id": neighbor_id,
                    "name": neighbor_node.name,
                    "current": current_load,
                    "incoming": incoming,
                    "capacity": capacity,
                    "load_ratio": new_load / capacity,
                })

        if overflow_pois:
            overflow_names = [p["name"] or p["poi_id"] for p in overflow_pois[:3]]
            chain.append(ImpactChainItem(
                step=3,
                description=f"转场导致 {', '.join(overflow_names)} 等 {len(overflow_pois)} 个备降点面临过载",
                severity=0.8,
                affected_pois=[p["poi_id"] for p in overflow_pois],
            ))

        # ── Step 3: 三跳传播——冲突风险飙升 ──
        if overflow_pois:
            peak_load = max(p["load_ratio"] for p in overflow_pois)
            conflict_prob = min(1.0, peak_load * 0.6)  # 简化概率模型
            chain.append(ImpactChainItem(
                step=4,
                description=f"空域冲突概率从正常水平飙升至 {conflict_prob*100:.0f}%",
                severity=conflict_prob,
            ))

        # ── 计算总体严重度 ──
        overall_severity = max((item.severity for item in chain), default=0)

        # ── 生成缓解方案 ──
        mitigations = self._generate_mitigations(
            target_id, direct_flights, overflow_pois, city
        )

        return CausalAnalysisResult(
            root_event=event,
            impact_chain=chain,
            overall_severity=overall_severity,
            mitigations=mitigations,
            affected_flight_ids=affected_flights[:50],
        )

    def _generate_mitigations(
        self, closed_poi: str, affected_flights: list, overflow_pois: list, city: str
    ) -> list[MitigationPlan]:
        """基于影响分析生成缓解方案"""
        plans = []

        # 方案 A: 分流至低负载 POI
        low_load_pois = self._find_low_load_pois(closed_poi, exclude=overflow_pois)
        if low_load_pois:
            names = [p["name"] or p["poi_id"] for p in low_load_pois[:3]]
            plans.append(MitigationPlan(
                plan_id="DIVERT",
                title="分流转场",
                description=f"将 {len(affected_flights)} 条受影响航线分流至 {', '.join(names)}",
                actions=[
                    {"action": "REROUTE", "from": closed_poi,
                     "to": p["poi_id"], "count": len(affected_flights) // len(low_load_pois)}
                    for p in low_load_pois[:3]
                ],
                estimated_risk_reduction=0.6,
            ))

        # 方案 B: 全局降速拉间距
        plans.append(MitigationPlan(
            plan_id="SLOW_DOWN",
            title="全域降速",
            description="全城 UAV 降速 30%，增大安全间距以降低冲突概率",
            actions=[
                {"action": "SPEED_LIMIT", "factor": 0.7, "scope": "CITY"}
            ],
            estimated_risk_reduction=0.35,
        ))

        # 方案 C: 暂停低优先级任务
        plans.append(MitigationPlan(
            plan_id="PAUSE_LOW_PRIORITY",
            title="暂停非紧急任务",
            description="暂停所有 PENDING 状态的非紧急任务，释放空域容量",
            actions=[
                {"action": "PAUSE", "target": "PENDING_TASKS", "priority_below": "NORMAL"}
            ],
            estimated_risk_reduction=0.45,
        ))

        return plans

    def _find_low_load_pois(self, exclude_poi: str, exclude: list = None) -> list[dict]:
        """找负载最低的 POI 作为分流目标"""
        exclude_ids = {exclude_poi}
        if exclude:
            exclude_ids.update(p["poi_id"] for p in exclude)

        candidates = []
        for nid, node in self.nodes.items():
            if node.node_type != "POI" or nid in exclude_ids:
                continue
            load = len(self._poi_flights.get(nid, []))
            candidates.append({
                "poi_id": nid,
                "name": node.name,
                "current_load": load,
                "capacity": node.capacity,
            })

        candidates.sort(key=lambda x: x["current_load"])
        return candidates[:5]

    def get_graph_stats(self) -> dict:
        """返回图谱统计信息（调试/展示用）"""
        type_counts = defaultdict(int)
        for n in self.nodes.values():
            type_counts[n.node_type] += 1
        edge_type_counts = defaultdict(int)
        for e in self.edges:
            edge_type_counts[e.edge_type] += 1
        return {
            "total_nodes": len(self.nodes),
            "total_edges": len(self.edges),
            "node_types": dict(type_counts),
            "edge_types": dict(edge_type_counts),
            "pois_with_flights": len(self._poi_flights),
        }
```

### 3.2 新建 `backend/api/causal.py` — 因果分析 API 蓝图

```python
"""
api/causal.py — 因果推理 API 蓝图

提供两个端点:
  POST /api/causal/analyze  — 提交根事件，返回影响链 + 缓解方案
  GET  /api/causal/stats    — 返回当前图谱统计信息
"""
import os
import json
import logging
import requests

from flask import Blueprint, request, jsonify
from dataclasses import asdict

from backend.middleware.auth import role_required

logger = logging.getLogger("TrajServer")

causal_bp = Blueprint('causal', __name__, url_prefix='/api/causal')

# 由 server.py 注入
_causal_graph = None


def init_causal_bp(causal_graph):
    global _causal_graph
    _causal_graph = causal_graph


@causal_bp.route("/analyze", methods=["POST"])
@role_required('ADMIN', 'DISPATCHER')
def analyze():
    """
    POST /api/causal/analyze

    Request Body:
    {
        "type": "POI_CLOSED",
        "target_id": "POI_xxx",
        "reason": "强风超速 > 12m/s",
        "city": "shenzhen"
    }

    Response: { code, data: CausalAnalysisResult, message }
    """
    if not _causal_graph:
        return jsonify({"code": 50000, "data": None, "message": "因果图谱未初始化"}), 500

    body = request.get_json(force=True, silent=True) or {}
    event = {
        "type": body.get("type", "POI_CLOSED"),
        "target_id": body.get("target_id", ""),
        "reason": body.get("reason", "未知原因"),
        "city": body.get("city", "shenzhen"),
    }

    if not event["target_id"]:
        return jsonify({"code": 40001, "data": None, "message": "缺少 target_id"}), 400

    result = _causal_graph.propagate_event(event)

    # 可选: 调用 Qwen 生成自然语言解释
    ai_explanation = _generate_ai_explanation(result)
    result.ai_explanation = ai_explanation

    return jsonify({
        "code": 0,
        "data": asdict(result),
        "message": "因果分析完成",
    })


@causal_bp.route("/stats", methods=["GET"])
def stats():
    """GET /api/causal/stats — 返回图谱统计"""
    if not _causal_graph:
        return jsonify({"code": 50000, "data": None, "message": "图谱未初始化"}), 500

    return jsonify({
        "code": 0,
        "data": _causal_graph.get_graph_stats(),
        "message": "success",
    })


def _generate_ai_explanation(result) -> str:
    """调用 Qwen 将因果链翻译为自然语言"""
    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        # Mock 降级: 直接拼接
        steps = [item.description for item in result.impact_chain]
        return " → ".join(steps)

    base_url = os.environ.get("LLM_BASE_URL",
                              "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
    model = os.environ.get("LLM_MODEL", "qwen-plus")

    chain_text = "\n".join(
        f"第{item.step}步: {item.description} (严重度: {item.severity:.0%})"
        for item in result.impact_chain
    )
    mitigation_text = "\n".join(
        f"方案{i+1}: {m.title} — {m.description}"
        for i, m in enumerate(result.mitigations)
    )

    prompt = f"""你是低空经济空域管制专家。请用 3-5 句话向调度员简述以下事件的连锁影响和建议措施，语言要简洁专业：

影响链:
{chain_text}

可选缓解措施:
{mitigation_text}
"""

    try:
        resp = requests.post(base_url, headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }, json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
        }, timeout=8)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning(f"AI 解释生成失败: {e}")
        steps = [item.description for item in result.impact_chain]
        return " → ".join(steps)
```

### 3.3 集成到 `server.py`

在 `server.py` 的蓝图注册阶段添加：

```python
from backend.core.causal_graph import AirspaceCausalGraph
from backend.api.causal import causal_bp, init_causal_bp

# 初始化因果图谱
causal_graph = AirspaceCausalGraph()

# 在城市 POI 加载完成后调用:
# causal_graph.build_from_city(city_pois, flight_logs)

init_causal_bp(causal_graph)
app.register_blueprint(causal_bp)
```

### 3.4 图谱重建时机

在 `trajectories.py` 的 `batch_generate()` 函数末尾，批量生成完成后触发图谱重建：

```python
# 在 batch_generate() 的 db.session.commit() 之后添加:
if _causal_graph:
    try:
        city_pois = _get_city_pois(city, buffer_m)
        trajs = _load_city_trajectories(city)
        _causal_graph.build_from_city(city_pois, trajs)
    except Exception as e:
        logger.warning(f"因果图谱重建失败: {e}")
```

---

## 四、前端实现

### 4.1 新建 `frontend/src/components/CausalAnalysisPanel.tsx`

这是一个浮窗面板，从告警侧栏的"分析影响"按钮触发：

**核心 UI 结构**:

```
┌─────────────────────────────────────┐
│  🧬 因果影响分析                 ✕   │
├─────────────────────────────────────┤
│                                      │
│  ⚡ 根事件                           │
│  ┌────────────────────────────────┐  │
│  │ 起降点 南山科技B2 因强风关闭    │  │
│  └────────────────────────────────┘  │
│                                      │
│  📊 影响传播链                        │
│  ①─→ ②─→ ③─→ ④                      │
│  (动画依次亮起，带时间线样式)          │
│                                      │
│  🎯 缓解方案                         │
│  ┌──────┐ ┌──────┐ ┌──────┐         │
│  │分流   │ │降速  │ │暂停  │         │
│  │风险-60│ │风险-35│ │风险-45│        │
│  │ [执行]│ │ [执行]│ │ [执行]│        │
│  └──────┘ └──────┘ └──────┘         │
│                                      │
│  🤖 AI 解读                          │
│  "南山科技B2因风速超限关闭后，        │
│   8条航线被迫转场，建议优先分流..."   │
│                                      │
└─────────────────────────────────────┘
```

**关键交互**:
- 从 `DashboardOverlay.tsx` 的告警区域新增"分析影响"按钮
- 点击后调用 `POST /api/causal/analyze`
- 影响链用 CSS `@keyframes` 做依次亮起的动画
- 点击缓解方案中的"执行"按钮 → 通过 SSE 广播（未来接 WebSocket 可双向控制）

### 4.2 修改 `AlertNotificationProvider.tsx`

扩展 `AlertItem` 接口，新增可选的 `causalAnalyzable` 字段：

```typescript
export interface AlertItem {
    id: string;
    type: 'low-battery' | 'danger-zone' | 'conflict';
    flightId: string;
    message: string;
    timestamp: number;
    // 新增: 标记此告警可触发因果分析
    causalAnalyzable?: boolean;
    causalTargetId?: string;  // 对应的 POI 节点 ID
}
```

### 4.3 修改 `DashboardOverlay.tsx` 告警展示区

在告警卡片上新增"分析影响"按钮（仅对 `causalAnalyzable=true` 的告警显示）:

```tsx
{alert.causalAnalyzable && (
    <button
        onClick={() => triggerCausalAnalysis(alert)}
        className="text-xs text-indigo-400 hover:text-indigo-300 
                   border border-indigo-400/30 rounded px-2 py-0.5
                   transition-all hover:bg-indigo-400/10"
    >
        🧬 分析影响链
    </button>
)}
```

### 4.4 在 3D 大屏叠加受影响航线

因果分析结果返回 `affected_flight_ids` 后，在 `useMapLayers.ts` 中新增一个 `PathLayer`：

```typescript
// 受影响航线高亮层
const causalHighlightLayer = new PathLayer({
    id: 'causal-affected-routes',
    data: affectedTrajectories,     // 从 causalAnalysis.affected_flight_ids 过滤
    getPath: d => d.path.map(p => [p[0], p[1], p[2] || 0]),
    getColor: [255, 140, 0, 180],   // 脉冲橙色
    widthMinPixels: 3,
    widthMaxPixels: 6,
    getDashArray: [8, 4],           // 虚线
    dashJustified: true,
    visible: showCausalOverlay,      // 由分析面板控制
});
```

---

## 五、API 接口规范

### `POST /api/causal/analyze`

**Request**:
```json
{
    "type": "POI_CLOSED",
    "target_id": "POI_12345",
    "reason": "强风超速 > 12m/s",
    "city": "shenzhen"
}
```

**Response**:
```json
{
    "code": 0,
    "data": {
        "root_event": { "type": "POI_CLOSED", "target_id": "POI_12345", ... },
        "impact_chain": [
            { "step": 1, "description": "起降点 南山科技B2 因[强风超速]关闭", "severity": 0.9, ... },
            { "step": 2, "description": "8 条航线受到直接影响，需要转场备降", "severity": 0.7, ... },
            { "step": 3, "description": "转场导致 深圳湾C1 等 2 个备降点面临过载", "severity": 0.8, ... },
            { "step": 4, "description": "空域冲突概率从正常水平飙升至 67%", "severity": 0.67, ... }
        ],
        "overall_severity": 0.9,
        "mitigations": [
            { "plan_id": "DIVERT", "title": "分流转场", ... },
            { "plan_id": "SLOW_DOWN", "title": "全域降速", ... }
        ],
        "ai_explanation": "南山科技B2因风速超限关闭后...",
        "affected_flight_ids": ["shenzhen_0012", "shenzhen_0034", ...]
    },
    "message": "因果分析完成"
}
```

---

## 六、文件清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **新建** | `backend/core/causal_graph.py` | 因果图谱核心引擎 |
| **新建** | `backend/api/causal.py` | 因果分析 API 蓝图 |
| **新建** | `frontend/src/components/CausalAnalysisPanel.tsx` | 因果分析浮窗面板 |
| **修改** | `backend/scripts/server.py` | 注册 causal_bp 蓝图 + 初始化图谱 |
| **修改** | `backend/api/trajectories.py` | batch_generate 后触发图谱重建 |
| **修改** | `frontend/src/components/AlertNotificationProvider.tsx` | AlertItem 接口扩展 |
| **修改** | `frontend/src/components/DashboardOverlay.tsx` | 告警卡片增加"分析影响"按钮 |
| **修改** | `frontend/src/hooks/useMapLayers.ts` | 新增受影响航线高亮图层 |

---

## 七、答辩演示脚本

1. 打开 3D 大屏，展示正在运行的无人机群
2. 手动触发一个事件："南山某起降点因强风关闭"
3. 大屏右侧弹出因果分析面板 → 影响链动画依次展开
4. 3D 大屏上受影响航线变为脉冲橙色虚线
5. 展示三个缓解方案卡片 → 点击"分流转场"
6. AI 用自然语言总结整个分析过程

**一句话答辩词**: *"我们的系统不只是监控和报警——它能像空管员一样推理：这个事件会引发什么连锁反应、波及多少架无人机、有几种化解方案。这是数字孪生从'展示'到'认知'的跨越。"*
