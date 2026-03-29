"""
api/analysis.py — 分析蓝图

处理 ROI 沙盘分析、POI 查询、系统状态等分析类 API。
"""
import time
import logging

from flask import Blueprint, request, jsonify

from trajectory_lab.core.geo_utils import haversine_m

logger = logging.getLogger("TrajServer")

analysis_bp = Blueprint('analysis', __name__, url_prefix='/api')

# 城市 POI 缓存引用（由 server.py 注入）
_get_city_pois = None
_poi_cache = None


def init_analysis_bp(get_city_pois_fn, poi_cache_ref):
    """初始化蓝图依赖"""
    global _get_city_pois, _poi_cache
    _get_city_pois = get_city_pois_fn
    _poi_cache = poi_cache_ref


@analysis_bp.route("/status")
def status():
    return jsonify({
        "code": 0,
        "data": {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "cached_cities": list(_poi_cache.keys()) if _poi_cache else [],
        },
        "message": "success"
    })


@analysis_bp.route("/pois")
def get_pois():
    city = request.args.get("city", "shenzhen")
    buffer_m = float(request.args.get("buffer", 0))
    max_n = int(request.args.get("max", 2000))
    try:
        city_pois = _get_city_pois(city, buffer_m)
    except FileNotFoundError as e:
        return jsonify({"code": 40400, "data": None, "message": str(e)}), 404

    clean = city_pois.demand_clean[:max_n]
    return jsonify({
        "code": 0,
        "data": {
            "city": city,
            "total_demand": len(city_pois.demand_all),
            "clean_demand": len(city_pois.demand_clean),
            "blocked_demand": len(city_pois.demand_blocked),
            "pois": [
                {
                    "poi_id": p.poi_id,
                    "name": p.name,
                    "category": p.category,
                    "lat": p.lat,
                    "lon": p.lon,
                }
                for p in clean
            ],
        },
        "message": "success"
    })


@analysis_bp.route("/analysis/roi", methods=["POST"])
def analyze_roi():
    body = request.get_json(force=True, silent=True) or {}
    city = body.get("city", "shenzhen")
    lat = float(body.get("lat", 0))
    lon = float(body.get("lon", 0))
    radius_m = float(body.get("radius_m", 3000))

    if lat == 0 and lon == 0:
        return jsonify({"code": 40001, "data": None, "message": "缺少坐标参数"}), 400

    t0 = time.time()
    try:
        city_pois = _get_city_pois(city, 0)
    except FileNotFoundError as e:
        return jsonify({"code": 40400, "data": None, "message": str(e)}), 404

    clean_pois = city_pois.demand_clean
    covered_pois = []
    commercial_categories = {'mall', 'commercial', 'supermarket', 'fast_food', 'restaurant', 'cafe'}

    for p in clean_pois:
        dist = haversine_m(lat, lon, p.lat, p.lon)
        if dist <= radius_m:
            covered_pois.append(p)

    covered_count = len(covered_pois)
    commercial_count = sum(1 for p in covered_pois if p.category in commercial_categories)

    if commercial_count == 0 and covered_count > 0:
        commercial_count = int(covered_count * 0.4)

    # 业务公式模拟
    if covered_count > 0:
        base_efficiency = 12.0
        density_factor = (covered_count ** 0.5) * 1.8
        radius_penalty = (radius_m / 1000.0) * 1.5
        avg_dist_reduction_pct = min(base_efficiency + density_factor - radius_penalty, 48.5)
        avg_dist_reduction_pct = max(avg_dist_reduction_pct, 5.0)
    else:
        avg_dist_reduction_pct = 0.0

    est_daily_orders = int((covered_count - commercial_count) * 1.5 + commercial_count * 4.5)

    # 财务模型
    base_capex = 180 + (radius_m / 1000.0) * 150.0
    est_capex_w = base_capex + (commercial_count * 2.5)
    est_capex_w = max(est_capex_w, 200.0)

    annual_profit_w = (est_daily_orders * 4.5 * 365) / 10000.0
    if annual_profit_w > 0:
        est_payback_years = est_capex_w / annual_profit_w
    else:
        est_payback_years = 99.9
    est_payback_years = min(max(est_payback_years, 0.8), 20.0)

    elapsed = time.time() - t0
    logger.info(f"[ROI] city={city} center=({lat:.4f},{lon:.4f}) radius={radius_m}m -> covered={covered_count} elapsed={elapsed:.3f}s")

    return jsonify({
        "code": 0,
        "data": {
            "covered_pois": covered_count,
            "commercial_pois": commercial_count,
            "avg_dist_reduction_pct": round(avg_dist_reduction_pct, 1),
            "est_daily_orders": est_daily_orders,
            "est_capex_w": round(est_capex_w, 1),
            "est_payback_years": round(est_payback_years, 1),
            "radius_m": radius_m
        },
        "message": "ROI 分析完成"
    })
