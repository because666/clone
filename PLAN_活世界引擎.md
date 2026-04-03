# 活世界引擎 — 从"录像循环"到"每秒都是全新状态"

> **这是最根本的架构升级**——它改变的不是某个功能点，而是系统的存在方式。

---

## 一、问题诊断：当前系统到底在做什么？

```
当前架构（录像机模式）：

  batch_generate.py                  前端
  ┌──────────────┐                 ┌──────────────┐
  │ 预生成 500 条  │ ──→ JSON ──→  │ 加载 JSON     │
  │ 固定轨迹       │               │ cycleDuration │
  │ + 幽灵镜像     │               │ → 无限循环播放 │
  └──────────────┘                 └──────────────┘
        ↑                                ↑
     启动前一次性执行              动画时间 mod cycleDuration
     此后永不改变                  永远在播同一段录像
```

问题：
1. **每条轨迹是"命中注定"的** — 起终点、路径、起飞时间在 `batch_generate` 时全部固定
2. **cycleDuration 循环** — 动画时间到周期末尾就回到 0，幽灵镜像负责"接缝"
3. **demand POI 没有自主权** — 它们只是被随机 `sample(clean, 2)` 抽中的被动数据
4. **没有时间流逝的概念** — 没有"已完成的航班"和"新到来的订单"，一切都是静态快照

**结论：这是一个精致的录像机，不是活着的世界。**

---

## 二、目标：什么才是"活世界"？

```
活世界架构：

  后端 WorldEngine (常驻线程)            前端
  ┌────────────────────────────┐     ┌──────────────────┐
  │ while True:                 │     │                   │
  │   wall_clock += 1s          │     │  GET /api/world   │
  │                             │     │  每秒拉取活跃轨迹  │
  │   1. demand POI 按权重      │ SSE │  增量更新渲染状态  │
  │      随机发起新订单          │ ──→ │                   │
  │   2. A* 实时规划航线         │     │  永远没有 cycle   │
  │   3. 管理飞行中 UAV 生命周期 │     │  永远没有幽灵镜像  │
  │   4. 检测冲突/异常           │     │  每一帧都是真实的  │
  │   5. 触发随机突发事件        │     │                   │
  │   6. 推送增量世界状态        │     │                   │
  └────────────────────────────┘     └──────────────────┘
```

核心原则：
- **没有 cycleDuration**，没有幽灵镜像，没有循环
- 每秒都有新航班起飞，旧航班降落
- demand POI 是主动的——它们按自己的权重概率独立发起请求
- 控制同时在飞数量 ≤ 300
- 突发事件（POI 关闭、天气突变）随机注入

---

## 三、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    后端 (Flask + 后台线程)                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WorldEngine (daemon thread)                          │   │
│  │                                                       │   │
│  │  ┌─────────┐  ┌────────────┐  ┌───────────────────┐  │   │
│  │  │ Demand   │  │ A* Planner │  │ FlightLifecycle   │  │   │
│  │  │ Scheduler│→ │ (已有)     │→ │ Manager           │  │   │
│  │  │          │  │            │  │                    │  │   │
│  │  │ POI按权重│  │ plan()     │  │ SPAWNING → FLYING │  │   │
│  │  │ 产生订单 │  │ 实时避障   │  │  → LANDING → DONE │  │   │
│  │  └─────────┘  └────────────┘  └───────────────────┘  │   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ EventInjector │  │ WorldState (内存)            │   │   │
│  │  │               │  │                              │   │   │
│  │  │ 随机突发事件   │  │ active_flights: dict         │   │   │
│  │  │ · POI 关闭    │  │ completed_count: int         │   │   │
│  │  │ · 天气突变    │  │ events_log: deque            │   │   │
│  │  │ · UAV 故障    │  │ wall_clock: float            │   │   │
│  │  └──────────────┘  └─────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API 层                                               │   │
│  │                                                       │   │
│  │  GET  /api/world/state     → 当前所有活跃航班          │   │
│  │  GET  /api/world/stream    → SSE 增量推送              │   │
│  │  POST /api/world/event     → 注入突发事件              │   │
│  │  GET  /api/world/stats     → 统计仪表盘数据            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                    前端                                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  useLiveWorld (替代 useCityData + useUAVAnimation)    │   │
│  │                                                       │   │
│  │  · 首次加载: GET /api/world/state → 全量轨迹          │   │
│  │  · 运行时: SSE /api/world/stream → 增量更新           │   │
│  │    - NEW_FLIGHT: 新增一条轨迹到 trajectories[]        │   │
│  │    - FLIGHT_DONE: 从 trajectories[] 移除              │   │
│  │    - EVENT: 推送事件通知                               │   │
│  │  · 动画: 墙钟时间驱动，不再有 cycleDuration            │   │
│  │  · 渲染: 现有 Deck.gl 图层框架完全复用                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、后端实现

### 4.1 核心：`backend/core/world_engine.py`

```python
"""
world_engine.py — 活世界引擎

在后台线程中持续运行的世界仿真引擎。
每一秒钟的世界状态都是全新计算的——不是录像回放。

核心机制:
  1. DemandScheduler: POI 按权重独立产生运输需求
  2. FlightManager: 管理航班生命周期 (排队→起飞→飞行→降落→完成)
  3. EventInjector: 随机注入突发事件
  4. A* Planner: 实时规划每条航线 (复用已有 plan() 函数)
"""
import time
import math
import random
import logging
import threading
from collections import deque
from dataclasses import dataclass, field

from .planner import plan
from .poi_loader import CityPOIs, DemandPOI
from .geo_utils import haversine_m

logger = logging.getLogger("WorldEngine")


# ═══════════════════════════════════════════════
# 数据结构
# ═══════════════════════════════════════════════

@dataclass
class ActiveFlight:
    """一架正在飞行中的 UAV"""
    flight_id: str
    path: list               # [[lon, lat, alt], ...]
    timestamps: list          # [t0, t1, ...] 相对于 spawn_time 的秒数
    spawn_wall_time: float    # 起飞时的墙钟时间 (time.monotonic)
    duration: float           # 飞行总时长 (秒)
    from_poi: str
    to_poi: str
    status: str = "FLYING"    # FLYING | LANDING | DONE

    def progress(self, now: float) -> float:
        """当前飞行进度 0~1"""
        elapsed = now - self.spawn_wall_time
        return min(1.0, elapsed / self.duration) if self.duration > 0 else 1.0

    def is_finished(self, now: float) -> bool:
        return (now - self.spawn_wall_time) >= self.duration

    def to_trajectory_dict(self, world_clock: float) -> dict:
        """导出为前端可用的轨迹格式
        
        关键: timestamps 使用世界时钟偏移，而非 cycleDuration 循环
        """
        base_time = self.spawn_wall_time
        return {
            "id": self.flight_id,
            "path": self.path,
            "timestamps": [t + base_time for t in self.timestamps],
            "from_poi": self.from_poi,
            "to_poi": self.to_poi,
            "status": self.status,
            "spawn_time": self.spawn_wall_time,
        }


@dataclass
class WorldEvent:
    """世界事件记录"""
    event_id: str
    event_type: str         # "FLIGHT_SPAWN" | "FLIGHT_DONE" | "POI_CLOSED" | "WEATHER" | "UAV_FAULT"
    timestamp: float        # 墙钟时间
    data: dict = field(default_factory=dict)


# ═══════════════════════════════════════════════
# 需求调度器
# ═══════════════════════════════════════════════

class DemandScheduler:
    """
    POI 需求调度器 — 每个 demand POI 按自身权重独立产生运输订单
    
    核心参数:
      - base_rate: 全城每秒的基准请求数 (控制总吞吐)
      - max_concurrent: 最大同时在飞数
    """

    def __init__(self, pois: list[DemandPOI], base_rate: float = 0.5,
                 max_concurrent: int = 300, rng_seed: int = 42):
        self.pois = pois
        self.base_rate = base_rate
        self.max_concurrent = max_concurrent
        self.rng = random.Random(rng_seed)

        # 按权重构建采样概率 (这里 POI 没有 weight 字段所以均匀分布)
        # 在 poi_demand.geojson 中 weight 字段存在于 properties 中
        self.weights = [1.0] * len(pois)
        total_w = sum(self.weights)
        self.probs = [w / total_w for w in self.weights]

        # 被关闭的 POI 集合 (突发事件可以动态添加/移除)
        self.closed_pois: set[str] = set()

    def set_poi_weights(self, weights_map: dict[str, float]):
        """外部注入权重 (如从 GeoJSON properties.weight 读取)"""
        for i, poi in enumerate(self.pois):
            if poi.poi_id in weights_map:
                self.weights[i] = weights_map[poi.poi_id]
        total_w = sum(self.weights)
        if total_w > 0:
            self.probs = [w / total_w for w in self.weights]

    def close_poi(self, poi_id: str):
        """关闭一个起降点 (突发事件)"""
        self.closed_pois.add(poi_id)

    def reopen_poi(self, poi_id: str):
        """重新开放一个起降点"""
        self.closed_pois.discard(poi_id)

    def generate_demand(self, current_active: int, dt: float) -> list[tuple[DemandPOI, DemandPOI]]:
        """
        生成本 tick 的新需求对列表

        Args:
            current_active: 当前在飞数量
            dt: 距上次 tick 的秒数

        Returns:
            [(from_poi, to_poi), ...]
        """
        # 动态调速: 当接近 max_concurrent 时降低新增速率
        headroom = max(0, self.max_concurrent - current_active)
        rate = self.base_rate * min(1.0, headroom / 50)  # 剩余容量 < 50 时线性降速

        # 泊松过程: 本 tick 产生的需求数
        expected = rate * dt
        n_demands = self.rng.choices(
            range(5), weights=self._poisson_weights(expected), k=1
        )[0]

        if n_demands == 0:
            return []

        # 过滤可用 POI
        available = [
            (i, p) for i, p in enumerate(self.pois)
            if p.poi_id not in self.closed_pois
        ]
        if len(available) < 2:
            return []

        avail_indices = [i for i, _ in available]
        avail_pois = [p for _, p in available]
        avail_probs = [self.probs[i] for i in avail_indices]
        total_p = sum(avail_probs)
        if total_p <= 0:
            return []
        avail_probs = [p / total_p for p in avail_probs]

        pairs = []
        for _ in range(n_demands):
            # 按权重采样起点和终点 (不重复)
            sampled = self.rng.choices(range(len(avail_pois)), weights=avail_probs, k=2)
            if sampled[0] == sampled[1]:
                continue
            from_poi = avail_pois[sampled[0]]
            to_poi = avail_pois[sampled[1]]

            # 距离过滤: 400m ~ 8000m
            dist = haversine_m(from_poi.lat, from_poi.lon, to_poi.lat, to_poi.lon)
            if dist < 400 or dist > 8000:
                continue

            pairs.append((from_poi, to_poi))

        return pairs

    def _poisson_weights(self, lam: float) -> list[float]:
        """泊松分布前 5 项的权重"""
        weights = []
        for k in range(5):
            w = (lam ** k) * math.exp(-lam) / math.factorial(k)
            weights.append(w)
        return weights


# ═══════════════════════════════════════════════
# 突发事件注入器
# ═══════════════════════════════════════════════

class EventInjector:
    """
    随机突发事件生成器
    
    事件类型:
      - POI_CLOSED: 某个起降点因故关闭 (持续 60-300 秒)
      - WEATHER_CHANGE: 风速突变
      - UAV_FAULT: 某架 UAV 故障返航
    """

    def __init__(self, avg_interval_s: float = 120, rng_seed: int = 99):
        self.avg_interval = avg_interval_s
        self.rng = random.Random(rng_seed)
        self.next_event_time = 0.0
        self._schedule_next(0)

        # 被关闭的 POI 及其重开时间
        self.poi_closures: dict[str, float] = {}  # poi_id → reopen_time

    def _schedule_next(self, now: float):
        """用指数分布安排下一个事件"""
        gap = self.rng.expovariate(1.0 / self.avg_interval)
        self.next_event_time = now + max(30, gap)  # 至少 30 秒间隔

    def tick(self, now: float, scheduler: DemandScheduler,
             active_flights: dict) -> list[WorldEvent]:
        """
        每个 tick 调用：检查是否触发事件 + 处理已到期的关闭恢复
        """
        events = []

        # 1. 恢复已到期的 POI 关闭
        expired = [pid for pid, t in self.poi_closures.items() if now >= t]
        for pid in expired:
            scheduler.reopen_poi(pid)
            del self.poi_closures[pid]
            events.append(WorldEvent(
                event_id=f"evt_{int(now)}_{pid}",
                event_type="POI_REOPENED",
                timestamp=now,
                data={"poi_id": pid, "message": f"起降点 {pid} 已恢复运行"}
            ))

        # 2. 检查是否到了触发新事件的时间
        if now < self.next_event_time:
            return events

        self._schedule_next(now)

        # 3. 随机选择事件类型
        roll = self.rng.random()
        if roll < 0.5:
            # POI_CLOSED
            available_pois = [
                p for p in scheduler.pois
                if p.poi_id not in scheduler.closed_pois
            ]
            if available_pois:
                victim = self.rng.choice(available_pois)
                close_duration = self.rng.uniform(60, 300)
                scheduler.close_poi(victim.poi_id)
                self.poi_closures[victim.poi_id] = now + close_duration
                events.append(WorldEvent(
                    event_id=f"evt_{int(now)}_close",
                    event_type="POI_CLOSED",
                    timestamp=now,
                    data={
                        "poi_id": victim.poi_id,
                        "poi_name": victim.name,
                        "reason": self.rng.choice([
                            "强风超速", "设备维护", "临时管制", "安全检查"
                        ]),
                        "duration_s": round(close_duration),
                        "reopen_at": now + close_duration,
                    }
                ))

        elif roll < 0.8:
            # WEATHER_CHANGE  
            new_wind = self.rng.uniform(2, 15)
            events.append(WorldEvent(
                event_id=f"evt_{int(now)}_weather",
                event_type="WEATHER_CHANGE",
                timestamp=now,
                data={"wind_speed": round(new_wind, 1)}
            ))

        else:
            # UAV_FAULT — 从在飞列表中随机挑一架
            if active_flights:
                victim_id = self.rng.choice(list(active_flights.keys()))
                events.append(WorldEvent(
                    event_id=f"evt_{int(now)}_fault",
                    event_type="UAV_FAULT",
                    timestamp=now,
                    data={
                        "flight_id": victim_id,
                        "reason": self.rng.choice([
                            "电机异常", "GPS 信号丢失", "电池温度过高"
                        ])
                    }
                ))

        return events


# ═══════════════════════════════════════════════
# 世界引擎主体
# ═══════════════════════════════════════════════

class WorldEngine:
    """
    活世界引擎 — 后台线程持续运行的世界仿真核心
    
    与前端的协议:
      - 前端不再加载静态 JSON 轨迹文件
      - 前端通过 SSE 接收增量事件:
        * NEW_FLIGHT: 一条新轨迹加入
        * FLIGHT_DONE: 一条轨迹结束
        * EVENT: 突发世界事件
      - 前端的动画时间 = 服务器墙钟时间 (通过 sync 同步)
    """

    TICK_INTERVAL = 1.0  # 每秒一个 tick

    def __init__(self, city_pois: CityPOIs, city: str = "shenzhen",
                 max_concurrent: int = 300, base_rate: float = 0.5,
                 enable_events: bool = True):
        self.city = city
        self.city_pois = city_pois
        self.max_concurrent = max_concurrent

        # 内部状态
        self.active_flights: dict[str, ActiveFlight] = {}
        self.completed_count = 0
        self.flight_counter = 0
        self.wall_clock = 0.0  # 世界时钟 (秒, 从启动时开始计数)
        self.events_log: deque[WorldEvent] = deque(maxlen=200)
        self.pending_sse_events: list[dict] = []  # 待推送给前端的事件队列

        # 子系统
        self.scheduler = DemandScheduler(
            pois=city_pois.demand_clean,
            base_rate=base_rate,
            max_concurrent=max_concurrent,
        )
        self.event_injector = EventInjector() if enable_events else None

        # 线程控制
        self._running = False
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

        logger.info(
            f"[WorldEngine] 初始化完成: city={city}, "
            f"POI={len(city_pois.demand_clean)}, "
            f"max_concurrent={max_concurrent}, "
            f"base_rate={base_rate}/s"
        )

    def start(self):
        """启动世界引擎后台线程"""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("[WorldEngine] 🌍 活世界已启动")

    def stop(self):
        """停止世界引擎"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("[WorldEngine] 世界已停止")

    def _run_loop(self):
        """主循环：每秒一个 tick"""
        last_time = time.monotonic()

        while self._running:
            now = time.monotonic()
            dt = now - last_time
            last_time = now
            self.wall_clock += dt

            try:
                self._tick(dt)
            except Exception as e:
                logger.error(f"[WorldEngine] tick 异常: {e}", exc_info=True)

            # 精确 1 秒间隔
            elapsed = time.monotonic() - now
            sleep_time = max(0, self.TICK_INTERVAL - elapsed)
            time.sleep(sleep_time)

    def _tick(self, dt: float):
        """单个世界 tick"""
        with self._lock:
            # ── 1. 清理已完成的航班 ──
            finished_ids = [
                fid for fid, f in self.active_flights.items()
                if f.is_finished(self.wall_clock)
            ]
            for fid in finished_ids:
                del self.active_flights[fid]
                self.completed_count += 1
                self._push_event("FLIGHT_DONE", {"flight_id": fid})

            # ── 2. 生成新需求 → A* 规划 → 注入在飞列表 ──
            pairs = self.scheduler.generate_demand(
                current_active=len(self.active_flights),
                dt=dt
            )
            for from_poi, to_poi in pairs:
                if len(self.active_flights) >= self.max_concurrent:
                    break
                self._spawn_flight(from_poi, to_poi)

            # ── 3. 突发事件 ──
            if self.event_injector:
                events = self.event_injector.tick(
                    self.wall_clock, self.scheduler, self.active_flights
                )
                for evt in events:
                    self.events_log.append(evt)
                    self._push_event("WORLD_EVENT", {
                        "event_id": evt.event_id,
                        "event_type": evt.event_type,
                        "data": evt.data,
                    })

    def _spawn_flight(self, from_poi: DemandPOI, to_poi: DemandPOI):
        """调用 A* 规划并创建一个新航班"""
        self.flight_counter += 1
        fid = f"live_{self.city}_{self.flight_counter:06d}"

        try:
            result = plan(
                from_poi.lat, from_poi.lon,
                to_poi.lat, to_poi.lon,
                nfz_index=self.city_pois.nfz_index,
                city=self.city,
                flight_id=fid,
                from_poi_id=from_poi.poi_id,
                to_poi_id=to_poi.poi_id,
            )
        except Exception as e:
            logger.warning(f"[WorldEngine] A* 规划失败: {fid}, {e}")
            return

        if not result or len(result.path) < 2:
            return

        duration = result.timestamps[-1] - result.timestamps[0]

        flight = ActiveFlight(
            flight_id=fid,
            path=result.path,
            timestamps=result.timestamps,
            spawn_wall_time=self.wall_clock,
            duration=duration,
            from_poi=from_poi.poi_id,
            to_poi=to_poi.poi_id,
        )

        self.active_flights[fid] = flight

        # 推送 SSE 事件
        self._push_event("NEW_FLIGHT", flight.to_trajectory_dict(self.wall_clock))

    def _push_event(self, event_type: str, data: dict):
        """添加到待推送队列"""
        self.pending_sse_events.append({
            "type": event_type,
            "data": data,
            "wall_clock": round(self.wall_clock, 3),
        })

    # ─────────────────────────────────────────
    # API 层接口
    # ─────────────────────────────────────────

    def get_full_state(self) -> dict:
        """获取完整世界状态 (前端首次加载用)"""
        with self._lock:
            trajectories = [
                f.to_trajectory_dict(self.wall_clock)
                for f in self.active_flights.values()
            ]
            return {
                "wall_clock": round(self.wall_clock, 3),
                "active_count": len(self.active_flights),
                "completed_count": self.completed_count,
                "total_spawned": self.flight_counter,
                "closed_pois": list(self.scheduler.closed_pois),
                "trajectories": trajectories,
                "recent_events": [
                    {
                        "event_id": e.event_id,
                        "event_type": e.event_type,
                        "timestamp": e.timestamp,
                        "data": e.data,
                    }
                    for e in list(self.events_log)[-20:]
                ],
            }

    def drain_sse_events(self) -> list[dict]:
        """取出并清空待推送的 SSE 事件队列"""
        with self._lock:
            events = self.pending_sse_events.copy()
            self.pending_sse_events.clear()
            return events

    def inject_event(self, event_type: str, data: dict):
        """外部手动注入事件 (用于答辩演示)"""
        with self._lock:
            if event_type == "POI_CLOSED" and "poi_id" in data:
                self.scheduler.close_poi(data["poi_id"])
                duration = data.get("duration_s", 120)
                if self.event_injector:
                    self.event_injector.poi_closures[data["poi_id"]] = \
                        self.wall_clock + duration

            evt = WorldEvent(
                event_id=f"manual_{int(self.wall_clock)}",
                event_type=event_type,
                timestamp=self.wall_clock,
                data=data,
            )
            self.events_log.append(evt)
            self._push_event("WORLD_EVENT", {
                "event_id": evt.event_id,
                "event_type": evt.event_type,
                "data": evt.data,
            })

    def get_stats(self) -> dict:
        """返回仪表盘统计数据"""
        with self._lock:
            return {
                "wall_clock": round(self.wall_clock, 3),
                "active_flights": len(self.active_flights),
                "completed_flights": self.completed_count,
                "total_spawned": self.flight_counter,
                "closed_pois_count": len(self.scheduler.closed_pois),
                "spawn_rate": round(self.scheduler.base_rate, 2),
                "max_concurrent": self.max_concurrent,
            }
```

### 4.2 新建 `backend/api/world.py` — 活世界 API

```python
"""
api/world.py — 活世界 API 蓝图

端点:
  GET  /api/world/state   → 完整世界状态 (首次加载)
  GET  /api/world/stream  → SSE 增量推送 (长连接)
  POST /api/world/event   → 手动注入事件 (答辩演示用)
  GET  /api/world/stats   → 仪表盘统计
"""
import json
import time
import logging

from flask import Blueprint, request, jsonify, Response, current_app

logger = logging.getLogger("TrajServer")

world_bp = Blueprint('world', __name__, url_prefix='/api/world')

_engine = None   # 由 server.py 注入


def init_world_bp(engine):
    global _engine
    _engine = engine


@world_bp.route("/state", methods=["GET"])
def world_state():
    """完整世界状态快照"""
    if not _engine:
        return jsonify({"code": 50000, "message": "世界引擎未启动"}), 500
    return jsonify({"code": 0, "data": _engine.get_full_state()})


@world_bp.route("/stream", methods=["GET"])
def world_stream():
    """SSE 增量推送"""
    if not _engine:
        return jsonify({"code": 50000, "message": "世界引擎未启动"}), 500

    app = current_app._get_current_object()

    def generate():
        while True:
            events = _engine.drain_sse_events()
            for evt in events:
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"

            # 每秒发送一次心跳 + 时钟同步
            stats = _engine.get_stats()
            yield f"event: tick\ndata: {json.dumps(stats)}\n\n"

            time.sleep(1.0)

    return Response(generate(), mimetype="text/event-stream", headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    })


@world_bp.route("/event", methods=["POST"])
def inject_event():
    """手动注入突发事件"""
    if not _engine:
        return jsonify({"code": 50000, "message": "世界引擎未启动"}), 500
    body = request.get_json(force=True, silent=True) or {}
    event_type = body.get("type", "UNKNOWN")
    data = body.get("data", {})
    _engine.inject_event(event_type, data)
    return jsonify({"code": 0, "message": f"事件 {event_type} 已注入"})


@world_bp.route("/stats", methods=["GET"])
def world_stats():
    """仪表盘统计"""
    if not _engine:
        return jsonify({"code": 50000, "message": "世界引擎未启动"}), 500
    return jsonify({"code": 0, "data": _engine.get_stats()})
```

### 4.3 集成到 `server.py`

```python
from backend.core.world_engine import WorldEngine
from backend.api.world import world_bp, init_world_bp

# 启动活世界引擎
city_pois = load_city_pois("shenzhen")
world_engine = WorldEngine(
    city_pois=city_pois,
    city="shenzhen",
    max_concurrent=300,
    base_rate=0.5,       # 每秒平均 0.5 个新订单
    enable_events=True,
)
world_engine.start()

init_world_bp(world_engine)
app.register_blueprint(world_bp)
```

---

## 五、前端适配

### 5.1 核心改动：新建 `useLiveWorld.ts`

这个 hook 替代当前的"加载静态 JSON + cycleDuration 循环"模式：

```typescript
/**
 * useLiveWorld — 活世界数据源
 * 
 * 替代: useCityData 中的轨迹加载 + useUAVAnimation 中的 cycleDuration 循环
 * 
 * 核心区别:
 *   旧: 一次性加载全部轨迹 → mod cycleDuration 循环播放
 *   新: SSE 实时接收新航班/航班结束 → 增量更新 trajectories[]
 *       动画时间 = 服务器墙钟时间 (通过 tick 事件同步)
 */
```

**关键行为**:
1. **首次加载**: `GET /api/world/state` → 拿到当前所有在飞轨迹 + 服务器墙钟
2. **SSE 订阅**: `GET /api/world/stream`
   - 收到 `NEW_FLIGHT`: 把新轨迹 `push` 到 `trajectories[]`, 调用 `precompileTrajectories`
   - 收到 `FLIGHT_DONE`: 从 `trajectories[]` 中移除该 `flight_id`
   - 收到 `tick`: 同步服务器墙钟到 `currentTimeRef`
   - 收到 `WORLD_EVENT`: 推送到告警系统 / 触发因果分析
3. **动画驱动**: `useUAVAnimation` 基本不变，但 `timeRangeRef.max` 不再固定——它等于服务器墙钟

### 5.2 需要修改的现有代码

| 文件 | 改动 | 说明 |
|------|------|------|
| `useUAVAnimation.ts` | 删除 `cycleDuration` 循环逻辑 | `next > max` 时不再归零，而是继续递增 |
| `animation.worker.ts` | 删除 `cycleDuration` 参数 | 不再需要 mod 运算 |
| `useCityData.ts` | 轨迹加载改为调用 `/api/world/state` | 不再加载静态 JSON |
| `MapContainer.tsx` | SSE 切换到 `/api/world/stream` | `fetchActiveTasks` 被 SSE 事件监听替代 |
| `batch_generate.py` | 保留但标记为 legacy | 不再是主力数据源 |

### 5.3 前端动画时间模型的变化

```
旧: currentTime = (currentTime + speed * 0.016) % cycleDuration
    → 到达末尾回绕到 0，幽灵镜像接盘

新: currentTime 由服务器 tick 事件驱动，持续递增
    → 航班有真实的 spawn_time 和 duration
    → 航班飞完就从列表移除，自然消失
    → 不需要 cycleDuration，不需要幽灵镜像
```

**前端只需要做一件事**: 在 `animate()` 中把 `currentTimeRef.current` 与服务器墙钟保持同步，然后现有的二分搜索 + 插值逻辑完全不需要改——因为每条轨迹的 `timestamps` 字段已经是基于墙钟的绝对时间。

---

## 六、关键设计决策

### Q1: A* 规划在 tick 循环里不会太慢吗？

当前 A* `plan()` 单次耗时约 5-50ms。每秒最多新增 2-3 条航线，总规划耗时 < 150ms，完全在 1 秒 tick 内完成。如果未来需要更高吞吐，可以：
- 用 `concurrent.futures.ThreadPoolExecutor` 并行规划
- 或把规划任务放入 Queue，由专门的规划线程池消费

### Q2: 服务器重启后在飞航班丢失怎么办？

两个方案（按复杂度递增）：
1. **接受丢失**: 重启后 0 架在飞，30 秒内自然爬升到稳态 → 最简方案，答辩无影响
2. **持久化**: 每个 tick 把 `active_flights` 快照写入 SQLite/Redis → 重启后恢复

建议用方案 1。演示前确保服务器稳定即可。

### Q3: 前端如何平滑过渡？

可以**双模式共存**——通过 URL 参数或配置切换：
- `/` → 活世界模式 (默认，连接 `/api/world/stream`)
- `/?legacy=1` → 旧循环模式 (加载静态 JSON，保底)

这样开发期间可以随时切回旧模式调试。

### Q4: 300 架同时在飞够不够？

300 架是 Deck.gl 渲染的甜蜜区间——足够看到密集的空域态势，又不会因为过多绘制调用导致帧率下降。可通过 `WorldEngine(max_concurrent=300)` 参数控制。

---

## 七、与"因果推理"和"分层仿真"的协同

活世界引擎是那两个方案的**前置基础设施**：

| 方案 | 在活世界中如何触发 |
|------|-------------------|
| **因果推理** | `EventInjector` 触发 `POI_CLOSED` → 前端收到 `WORLD_EVENT` → 自动调用 `/api/causal/analyze` |
| **分层仿真** | 用户在大屏点击某架活跃 UAV → 调用 `/api/sim/hifi/{flight_id}` 获取多物理场数据 |

---

## 八、文件清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **新建** | `backend/core/world_engine.py` | 活世界引擎核心（~400行） |
| **新建** | `backend/api/world.py` | 活世界 API 蓝图 |
| **新建** | `frontend/src/hooks/useLiveWorld.ts` | 活世界前端数据源 |
| **修改** | `backend/scripts/server.py` | 启动 WorldEngine + 注册路由 |
| **修改** | `frontend/src/hooks/useUAVAnimation.ts` | 删除 cycleDuration 循环逻辑 |
| **修改** | `frontend/src/workers/animation.worker.ts` | 删除 cycleDuration 参数 |
| **修改** | `frontend/src/components/MapContainer.tsx` | SSE 切换 + 使用 useLiveWorld |
| **保留** | `backend/scripts/batch_generate.py` | 标记 legacy，作为兜底 |

---

## 九、工时估算

| 子任务 | 估时 |
|--------|------|
| `WorldEngine` 核心 + DemandScheduler + EventInjector | 1.5 天 |
| `world.py` API 蓝图 + SSE 推送 | 0.5 天 |
| `useLiveWorld.ts` 前端 hook | 1 天 |
| `useUAVAnimation` 改造（删循环逻辑） | 0.5 天 |
| 联调 + 稳态测试（观察 30 分钟运行） | 0.5 天 |
| **合计** | **4 天** |

---

## 十、答辩话术

> *"我们的数字孪生不是在播放一段预录的动画。屏幕上你看到的每一架无人机，都是这一秒钟由系统中 156 个起降点按自身的物流需求实时发起的运输请求，经过 A* 实时避障规划后飞上天的。你现在看到的 287 架在飞——10 秒前这个数字是 291，因为有 4 架已经降落、又有 3 架新起飞，还有 1 个起降点刚刚因为风速超限被系统自动关闭了。**每一秒都是全新的世界状态，没有循环，没有录像，这才是真正的数字孪生。**"*
