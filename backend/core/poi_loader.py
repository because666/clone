"""
poi_loader.py — POI 加载与预处理

功能：
  1. 加载 demand / sensitive GeoJSON
  2. 预过滤坐标范围（去除数据噪声）
  3. 【关键】过滤掉被禁飞区覆盖的 demand POI
     ——这些点本身就在限制区内，不应参与轨迹生成
  4. 提供按城市加载的统一接口
"""
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from .no_fly_zones import NoFlyZone, NoFlyZoneIndex

logger = logging.getLogger(__name__)

# 项目根目录（backend 的上一级）
_ROOT = Path(__file__).resolve().parent.parent.parent


@dataclass
class DemandPOI:
    poi_id: str
    name: str
    category: str
    lat: float
    lon: float

    def coords(self) -> tuple[float, float]:
        return self.lat, self.lon


@dataclass
class CityPOIs:
    city: str
    demand_all: list[DemandPOI]          # 所有 demand（含被禁飞区覆盖的）
    demand_clean: list[DemandPOI]        # 净化后的 demand（可安全用于起降）
    demand_blocked: list[DemandPOI]      # 被禁飞区覆盖的 demand（记录备用）
    nfz_index: NoFlyZoneIndex            # 禁飞区空间索引


def _load_geojson(path: Path) -> list[dict]:
    """加载 GeoJSON，返回 feature 列表"""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("features", [])


def _feature_to_latlon(feat: dict) -> tuple[float, float] | None:
    """从 GeoJSON feature 提取 (lat, lon)，支持 Point / Polygon / MultiPolygon"""
    geom = feat.get("geometry", {})
    gtype = geom.get("type", "")
    coords = geom.get("coordinates")
    if not coords:
        return None
    if gtype == "Point":
        return coords[1], coords[0]
    if gtype == "Polygon":
        ring = coords[0]
        mlat = sum(c[1] for c in ring) / len(ring)
        mlon = sum(c[0] for c in ring) / len(ring)
        return mlat, mlon
    if gtype == "MultiPolygon":
        all_pts = [c for poly in coords for c in poly[0]]
        mlat = sum(c[1] for c in all_pts) / len(all_pts)
        mlon = sum(c[0] for c in all_pts) / len(all_pts)
        return mlat, mlon
    return None


def load_city_pois(city: str, buffer_m: float = 0.0) -> CityPOIs:
    """
    加载指定城市的 demand 和 sensitive POI，并净化 demand。

    参数：
        city:     城市标识（如 "shenzhen"）
        buffer_m: 额外安全缓冲（米）。demand 落在禁飞圆半径+buffer 内则视为被覆盖。
                  默认 0 表示仅过滤严格在禁飞圆内的点。

    返回：
        CityPOIs 对象，包含全量/净化/被阻断三类 demand 列表及禁飞区索引。
    """
    base = _ROOT / "data" / "processed" / city
    demand_path = base / "poi_demand.geojson"
    sensitive_path = base / "poi_sensitive.geojson"

    if not demand_path.exists():
        raise FileNotFoundError(f"找不到 demand POI 文件: {demand_path}")
    if not sensitive_path.exists():
        raise FileNotFoundError(f"找不到 sensitive POI 文件: {sensitive_path}")

    # ── 加载 sensitive POI → 构建禁飞区索引 ─────────────────────────
    sensitive_features = _load_geojson(sensitive_path)
    zones: list[NoFlyZone] = []
    for feat in sensitive_features:
        ll = _feature_to_latlon(feat)
        if ll is None:
            continue
        lat, lon = ll
        # 坐标粗筛（中国大陆范围）
        if not (15 < lat < 55 and 73 < lon < 135):
            continue
        props = feat.get("properties", {})
        category = props.get("category") or props.get("type") or "unknown"
        name = props.get("name", "")
        zones.append(NoFlyZone(lat, lon, category, name))

    nfz_index = NoFlyZoneIndex(zones)
    logger.info(f"[{city}] 加载禁飞区: {len(zones)} 个")

    # ── 加载 demand POI ───────────────────────────────────────────────
    demand_features = _load_geojson(demand_path)
    demand_all: list[DemandPOI] = []
    for feat in demand_features:
        ll = _feature_to_latlon(feat)
        if ll is None:
            continue
        lat, lon = ll
        if not (15 < lat < 55 and 73 < lon < 135):
            continue
        props = feat.get("properties", {})
        poi = DemandPOI(
            poi_id=str(props.get("poi_id", props.get("osm_id", ""))),
            name=props.get("name", ""),
            category=props.get("type", props.get("category", "")),
            lat=lat,
            lon=lon,
        )
        demand_all.append(poi)

    logger.info(f"[{city}] 加载 demand POI: {len(demand_all)} 个")

    # ── 净化：过滤被禁飞区覆盖的 demand ─────────────────────────────
    demand_clean: list[DemandPOI] = []
    demand_blocked: list[DemandPOI] = []
    for poi in demand_all:
        if nfz_index.point_in_any(poi.lat, poi.lon, buffer_m):
            demand_blocked.append(poi)
        else:
            demand_clean.append(poi)

    logger.info(
        f"[{city}] demand 净化完成: "
        f"合规 {len(demand_clean)} / 被禁飞区覆盖 {len(demand_blocked)} "
        f"（过滤率 {len(demand_blocked)/max(len(demand_all),1)*100:.1f}%）"
    )

    return CityPOIs(
        city=city,
        demand_all=demand_all,
        demand_clean=demand_clean,
        demand_blocked=demand_blocked,
        nfz_index=nfz_index,
    )


def report_blocked(city_pois: CityPOIs, max_show: int = 20) -> str:
    """生成被覆盖 demand POI 的文字报告"""
    blocked = city_pois.demand_blocked
    lines = [
        f"城市: {city_pois.city}",
        f"demand 总数: {len(city_pois.demand_all)}",
        f"净化后可用: {len(city_pois.demand_clean)}",
        f"被禁飞区覆盖: {len(blocked)} 个",
        "",
    ]
    if blocked:
        lines.append(f"前 {min(max_show, len(blocked))} 个被覆盖 demand:")
        for poi in blocked[:max_show]:
            lines.append(f"  [{poi.poi_id}] {poi.name or '(无名)'} ({poi.lat:.5f}, {poi.lon:.5f})")
    return "\n".join(lines)
