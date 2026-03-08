import os
import json
import argparse
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIRLAB_CSV = os.path.join(BASE_DIR, 'data', 'processed', 'airlab_energy', 'flights_detail.csv')

def train_model():
    print(f"Loading AirLab dataset from {AIRLAB_CSV}...")
    try:
        df = pd.read_csv(AIRLAB_CSV)
    except FileNotFoundError:
        print("Data not found.")
        return None
    
    # We use airspeed, vertspd, diffalt, payload as features
    features = ['airspeed', 'vertspd', 'diffalt', 'payload']
    target = 'power'
    
    df = df.dropna(subset=features + [target])
    
    X = df[features]
    y = df[target]
    
    print("Training RandomForestRegressor for power prediction...")
    model = RandomForestRegressor(n_estimators=20, max_depth=10, random_state=42, n_jobs=-1)
    model.fit(X, y)
    print("Model trained successfully.")
    return model

def predict_energy(model, traj_csv, out_json):
    print(f"Loading generated UAV trajectories from {traj_csv} in chunks...")
    
    # 用分块读取以节约内存
    chunksize = 100000
    results = {}
    
    # 为了保证同一架飞机的轨迹点都在一起计算能量，我们需要缓存跨块的未完成飞机数据
    flight_buffer = pd.DataFrame()
    np.random.seed(42)
    # 为每个 fid 固定一个伪随机生成的 payload 
    flight_payloads = {}
    
    def process_flights(df_group, is_last_chunk=False):
        # 识别完整的 flight_ids（如果不是最后一个块，最后一个 flight_id 可能被截断）
        if df_group.empty:
            return pd.DataFrame()
            
        unique_fids = df_group['flight_id'].unique()
        if not is_last_chunk and len(unique_fids) > 1:
            # 最后一个 fid 留在 buffer 等下一个 chunk
            complete_fids = unique_fids[:-1]
            next_buffer = df_group[df_group['flight_id'] == unique_fids[-1]].copy()
            process_df = df_group[df_group['flight_id'].isin(complete_fids)].copy()
        else:
            process_df = df_group.copy()
            next_buffer = pd.DataFrame()
            
        if process_df.empty:
            return next_buffer
            
        process_df = process_df.sort_values(by=['flight_id', 'timestamp'])
        
        # Approximate 2D airspeed 
        process_df['airspeed'] = np.sqrt(process_df['speed_x']**2 + process_df['speed_y']**2)
        process_df['vertspd'] = process_df['speed_z']
        process_df['diffalt'] = process_df['alt_rel']
        
        # 动态分配 payload，已有的直接用，没有的用随机分配
        for fid in process_df['flight_id'].unique():
            if fid not in flight_payloads:
                flight_payloads[fid] = np.random.choice([0.0, 0.25, 0.5, 0.75, 1.0])
        
        process_df['payload'] = process_df['flight_id'].map(flight_payloads)
        
        features = ['airspeed', 'vertspd', 'diffalt', 'payload']
        process_df['power_pred_W'] = model.predict(process_df[features])
        
        process_df['dt'] = process_df.groupby('flight_id')['timestamp'].diff().fillna(0.1)
        process_df['energy_J'] = process_df['power_pred_W'] * process_df['dt']
        process_df['cumulative_energy_J'] = process_df.groupby('flight_id')['energy_J'].cumsum()
        
        for fid, group in process_df.groupby('flight_id'):
            total_energy = group['cumulative_energy_J'].max()
            
            consumption_ratio = np.random.uniform(0.2, 0.5)
            battery_capacity = max(total_energy / consumption_ratio, 1.0)
            
            battery_pct = 100.0 - (group['cumulative_energy_J'] / battery_capacity) * 100.0
            battery_pct = np.clip(battery_pct, 0, 100)
            
            # 使用 step=5 因为 generate_logistics_trajectories 的 SAMPLE_RATE_HZ 被调整成了 1.0 (原先是 5.0， 步长是25)
            step = 5
            
            results[fid] = {
                "power": group['power_pred_W'].iloc[::step].round(1).tolist(),
                "battery": battery_pct.iloc[::step].round(1).tolist(),
                "payload": float(flight_payloads[fid])
            }
        
        return next_buffer

    try:
        for chunk in pd.read_csv(traj_csv, chunksize=chunksize):
            combined_df = pd.concat([flight_buffer, chunk], ignore_index=True)
            flight_buffer = process_flights(combined_df, is_last_chunk=False)
            print(f"  Processed a chunk, accumulated {len(results)} completed flights...")
            
        if not flight_buffer.empty:
            process_flights(flight_buffer, is_last_chunk=True)
    except FileNotFoundError:
        print(f"Error: Could not read {traj_csv}")
        return
    
    # Write to target directory
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, 'w') as f:
        json.dump(results, f)
        
    print(f"Energy predictions generated and saved to {out_json}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="能耗预测模型")
    parser.add_argument("--city", type=str, default="shenzhen", help="目标城市")
    args = parser.parse_args()
    
    traj_csv = os.path.join(BASE_DIR, 'data', 'processed', 'trajectories', f'{args.city}_uav_trajectories.csv')
    out_json = os.path.join(BASE_DIR, 'data', 'processed', f'{args.city}_energy_predictions.json')

    mdl = train_model()
    if mdl is not None:
        predict_energy(mdl, traj_csv, out_json)
