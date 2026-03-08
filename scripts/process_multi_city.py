"""
process_multi_city.py — 多城市数据批量处理脚本

将 data/raw/ 中各城市的原始 Overpass JSON 转换为标准 GeoJSON 和 CSV
输出到 data/processed/{city}/ 子目录

复用 process_buildings.py 和 process_pois.py 的核心算法
"""
import os
import sys
import json
import hashlib
import logging
import argparse
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("MultiCityProcessor")

# 城市列表 (与 fetch_multi_city_data.py 保持一致)
CITIES = ["shenzhen", "chongqing", "beijing", "shanghai", "guangzhou", "chengdu"]

CITY_NAMES = {
    "shenzhen": "深圳南山", "chongqing": "重庆主城", "beijing": "北京核心",
    "shanghai": "上海核心", "guangzhou": "广州核心", "chengdu": "成都核心"
}

# 建筑高度估算配置 (复用 process_buildings.py 逻辑)
BUILDING_HEIGHT_MAP = {
    'commercial': (20, 80), 'office': (30, 120), 'industrial': (8, 20),
    'residential': (15, 50), 'apartments': (25, 80), 'retail': (5, 15),
    'warehouse': (6, 12), 'hospital': (15, 40), 'church': (10, 30),
    'hotel': (25, 80), 'train_station': (10, 25), 'garage': (4, 8),
    'school': (10, 20), 'university': (15, 35), 'yes': (10, 30),
}
DEFAULT_HEIGHT_RANGE = (10, 30)


def deterministic_height(osm_id: int, min_h: float, max_h: float) -> float:
    """基于 osm_id 的确定性伪随机高度"""
    h = int(hashlib.md5(str(osm_id).encode()).hexdigest()[:8], 16)
    return round(min_h + (h % 10000) / 10000 * (max_h - min_h), 1)


def parse_height(tags: dict, osm_id: int) -> float:
    """从 tags 中提取或估算建筑高度"""
    if 'height' in tags:
        try:
            return float(str(tags['height']).replace('m', '').strip())
        except ValueError:
            pass
    if 'building:levels' in tags:
        try:
            return float(tags['building:levels']) * 3.0
        except ValueError:
            pass
    building_type = tags.get('building', 'yes')
    range_ = BUILDING_HEIGHT_MAP.get(building_type, DEFAULT_HEIGHT_RANGE)
    return deterministic_height(osm_id, range_[0], range_[1])


def build_node_index(elements: list) -> dict:
    """构建 node 索引: {id -> (lat, lon)}"""
    idx = {}
    for e in elements:
        if e.get('type') == 'node':
            idx[e['id']] = (e.get('lat', 0), e.get('lon', 0))
    return idx


def way_to_polygon(way: dict, node_index: dict):
    """将 way 转换为 GeoJSON 坐标环 [[lon, lat], ...]"""
    coords = []
    
    # 新版 out geom; 会直接返回 geometry 数组
    if 'geometry' in way:
        for pt in way['geometry']:
            if pt is not None:
                coords.append([pt['lon'], pt['lat']])
    else:
        # 旧版兼容
        nodes = way.get('nodes', [])
        for nid in nodes:
            if nid in node_index:
                lat, lon = node_index[nid]
                coords.append([lon, lat])
                
    if len(coords) < 3:
        return None
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return coords


def build_way_index(elements: list) -> dict:
    return {e['id']: e for e in elements if e.get('type') == 'way'}


def relation_to_multipolygon(relation, way_index, node_index):
    """将 relation 转换为 MultiPolygon"""
    outers, inners = [], []
    for member in relation.get('members', []):
        if member.get('type') == 'way' and member.get('ref') in way_index:
            coords = way_to_polygon(way_index[member['ref']], node_index)
            if coords:
                if member.get('role') == 'inner':
                    inners.append(coords)
                else:
                    outers.append(coords)
    if not outers:
        return None, None
    if len(outers) == 1 and not inners:
        return "Polygon", [outers[0]]
    polygons = []
    for outer in outers:
        polygons.append([outer] + inners)
    if len(polygons) == 1:
        return "Polygon", polygons[0]
    return "MultiPolygon", polygons


# ===========================================================================
#  建筑处理
# ===========================================================================
def process_city_buildings(city: str, raw_dir: Path, out_dir: Path) -> bool:
    """处理单个城市的建筑数据"""
    # 按优先级查找原始文件 (根目录 > 子目录)
    if city == "shenzhen":
        candidates = [
            raw_dir / "shenzhen_nanshan_buildings_raw.json",
            raw_dir / "shenzhen" / "shenzhen_nanshan_buildings_raw.json",
        ]
    else:
        candidates = [
            raw_dir / f"{city}_buildings_raw.json",
            raw_dir / city / f"{city}_buildings_raw.json",
        ]
    input_file = None
    for c in candidates:
        if c.exists():
            input_file = c
            break
    if input_file is None:
        input_file = candidates[0]  # 用于错误提示

    if not input_file.exists():
        logger.warning(f"  ⚠️  建筑原始数据不存在: {input_file.name}")
        return False

    output_file = out_dir / "buildings_3d.geojson"
    # 可通过命令行 --force 参数控制是否跳过
    # if output_file.exists() and os.path.getsize(output_file) > 1000:
    #     logger.info(f"  ✅ 建筑 GeoJSON 已存在: {output_file.name}")
    #     return True

    logger.info(f"  🔄 处理建筑数据: {input_file.name}")

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    elements = data.get('elements', [])
    node_index = build_node_index(elements)
    way_index = build_way_index(elements)

    features = []
    way_count, rel_count, skip_count = 0, 0, 0

    for el in elements:
        tags = el.get('tags', {})
        if 'building' not in tags:
            continue

        osm_id = el['id']
        height = parse_height(tags, osm_id)
        geom_type, coords = None, None

        if el['type'] == 'way':
            ring = way_to_polygon(el, node_index)
            if ring:
                geom_type, coords = "Polygon", [ring]
                way_count += 1
            else:
                skip_count += 1
                continue
        elif el['type'] == 'relation':
            geom_type, coords = relation_to_multipolygon(el, way_index, node_index)
            if not geom_type:
                skip_count += 1
                continue
            rel_count += 1
        else:
            continue

        feature = {
            "type": "Feature",
            "properties": {
                "osm_id": osm_id,
                "height": height,
                "building_type": tags.get('building', 'yes'),
                "name": tags.get('name', ''),
                "levels": tags.get('building:levels', ''),
            },
            "geometry": {
                "type": geom_type,
                "coordinates": coords
            }
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "total_buildings": len(features),
            "processing": "process_multi_city.py"
        }
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False)

    logger.info(f"  📊 建筑: {len(features)} features (way={way_count}, rel={rel_count}, skip={skip_count})")
    logger.info(f"  ✅ 已保存: {output_file}")
    return True


# ===========================================================================
#  POI 处理
# ===========================================================================
def process_city_pois(city: str, raw_dir: Path, out_dir: Path) -> bool:
    """处理单个城市的 POI 数据"""
    all_ok = True

    for poi_type in ["sensitive", "demand"]:
        # 按优先级查找原始文件 (根目录 > 子目录)
        if city == "shenzhen":
            candidates = [
                raw_dir / f"shenzhen_nanshan_poi_{poi_type}_raw.json",
                raw_dir / "shenzhen" / f"shenzhen_nanshan_poi_{poi_type}_raw.json",
            ]
        else:
            candidates = [
                raw_dir / f"{city}_poi_{poi_type}_raw.json",
                raw_dir / city / f"{city}_poi_{poi_type}_raw.json",
            ]
        input_file = None
        for c in candidates:
            if c.exists():
                input_file = c
                break
        if input_file is None:
            input_file = candidates[0]  # 用于错误提示

        output_file = out_dir / f"poi_{poi_type}.geojson"

        if not input_file.exists():
            logger.warning(f"  ⚠️  {poi_type} POI 原始数据不存在: {input_file.name}")
            all_ok = False
            continue

        # 可通过命令行 --force 参数控制是否跳过
        # if output_file.exists() and os.path.getsize(output_file) > 100:
        #     logger.info(f"  ✅ {poi_type} POI GeoJSON 已存在: {output_file.name}")
        #     continue

        logger.info(f"  🔄 处理 {poi_type} POI: {input_file.name}")

        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        elements = data.get('elements', [])
        features = []

        for el in elements:
            tags = el.get('tags', {})

            # 提取坐标 (新版 out geom; 和旧版兼容)
            lat = el.get('lat') or (el.get('center', {}).get('lat'))
            lon = el.get('lon') or (el.get('center', {}).get('lon'))
            
            # 兼容 out geom; 的中心点近似
            if lat is None or lon is None:
                if 'geometry' in el and len(el['geometry']) > 0:
                    valid_pts = [pt for pt in el['geometry'] if pt is not None]
                    if valid_pts:
                        lat = valid_pts[0]['lat']
                        lon = valid_pts[0]['lon']

            if lat is None or lon is None:
                continue

            # 分类
            amenity = tags.get('amenity', '')
            building = tags.get('building', '')
            shop = tags.get('shop', '')
            category = amenity or building or shop or 'unknown'

            feature = {
                "type": "Feature",
                "properties": {
                    "osm_id": el.get('id', 0),
                    "name": tags.get('name', ''),
                    "category": category,
                    "poi_type": poi_type,
                    "tags": {k: v for k, v in tags.items()
                             if k in ['name', 'amenity', 'building', 'shop',
                                      'name:en', 'name:zh', 'addr:street']}
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat]
                }
            }
            features.append(feature)

        geojson = {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "source": "OpenStreetMap via Overpass API",
                "total_pois": len(features),
                "poi_type": poi_type,
            }
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, ensure_ascii=False)

        logger.info(f"  📊 {poi_type} POI: {len(features)} features")
        logger.info(f"  ✅ 已保存: {output_file}")

    return all_ok


# ===========================================================================
#  主入口
# ===========================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="多城市数据批量处理")
    parser.add_argument("--cities", type=str, default="all",
                        help="处理的城市, 逗号分隔或'all'")
    parser.add_argument("--force", action="store_true", default=False,
                        help="强制重新处理, 覆盖已有文件")
    args = parser.parse_args()

    base = Path(__file__).resolve().parent.parent
    raw_dir = base / "data" / "raw"
    processed_dir = base / "data" / "processed"

    if args.cities.lower() == "all":
        cities = CITIES
    else:
        cities = [c.strip() for c in args.cities.split(",")]

    logger.info("=" * 60)
    logger.info("🔄 多城市数据批量处理")
    logger.info("=" * 60)

    for i, city in enumerate(cities):
        name = CITY_NAMES.get(city, city)
        logger.info(f"\n━━━ [{i+1}/{len(cities)}] {name} ━━━")

        # 深圳数据直接输出到 processed 根目录 (保持兼容)
        if city == "shenzhen":
            city_out = processed_dir
        else:
            city_out = processed_dir / city
            city_out.mkdir(parents=True, exist_ok=True)

        process_city_buildings(city, raw_dir, city_out)
        process_city_pois(city, raw_dir, city_out)

    logger.info("\n" + "=" * 60)
    logger.info("✅ 全部处理完成!")
    logger.info("=" * 60)
