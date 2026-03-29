"""
migrate_json_to_db.py — 一次性迁移脚本

将现有 6 个城市的静态 JSON 轨迹文件导入 SQLite 数据库 (flight_logs 表)。
跳过 _ghost 后缀的镜像记录（查询时动态计算）。

用法:
    python scripts/migrate_json_to_db.py
"""
import sys
import json
import uuid
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from trajectory_lab.scripts.server import app
from trajectory_lab.models.user import db, FlightLog

CITIES = ["shenzhen", "beijing", "shanghai", "guangzhou", "chengdu", "chongqing"]
TRAJ_DIR = ROOT / "frontend" / "public" / "data" / "processed" / "trajectories"


def migrate():
    total_inserted = 0
    total_skipped = 0

    with app.app_context():
        # 确保表结构已创建
        db.create_all()

        for city in CITIES:
            json_path = TRAJ_DIR / f"{city}_uav_trajectories.json"
            if not json_path.exists():
                print(f"  ⚠️  {city}: JSON 文件不存在，跳过")
                continue

            print(f"  📦 {city}: 正在读取 {json_path.name} ...")
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            trajectories = data.get("trajectories", [])
            algo = data.get("_meta", {}).get("algo", "unknown")
            batch_id = str(uuid.uuid4())

            # 清理该城市已有数据（幂等迁移）
            existing = FlightLog.query.filter_by(city=city).count()
            if existing > 0:
                FlightLog.query.filter_by(city=city).delete()
                print(f"       ↻ 已清理 {existing} 条旧记录")

            city_count = 0
            city_skipped = 0
            for traj in trajectories:
                fid = traj.get("id", "")
                if fid.endswith("_ghost"):
                    city_skipped += 1
                    continue

                log = FlightLog(
                    city=city,
                    flight_id=fid,
                    path_data=json.dumps(traj["path"]),
                    timestamps_data=json.dumps(traj["timestamps"]),
                    start_offset=traj.get("start_offset", 0.0),
                    algo=algo,
                    batch_id=batch_id,
                )
                db.session.add(log)
                city_count += 1

            db.session.commit()
            total_inserted += city_count
            total_skipped += city_skipped
            print(f"       ✅ {city}: 导入 {city_count} 条, 跳过 ghost {city_skipped} 条 (batch_id: {batch_id[:8]}...)")

    print(f"\n{'='*50}")
    print(f"✅ 迁移完成！共导入 {total_inserted} 条记录, 跳过 ghost {total_skipped} 条")
    print(f"   数据库: instance/aetherweave.db → flight_logs 表")


if __name__ == "__main__":
    t0 = time.time()
    print(f"{'='*50}")
    print("🚀 飞行轨迹 JSON → SQLite 迁移工具")
    print(f"{'='*50}")
    migrate()
    print(f"   耗时: {time.time() - t0:.2f}s")
