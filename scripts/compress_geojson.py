import json
import os
import argparse

def compress_coordinates(coords, precision=5):
    """递归处理坐标并保留指定小数位"""
    if isinstance(coords, list):
        if len(coords) > 0 and isinstance(coords[0], (int, float)):
            # 到底层坐标对
            return [round(c, precision) for c in coords]
        else:
            return [compress_coordinates(c, precision) for c in coords]
    return coords

def main():
    parser = argparse.ArgumentParser(description="压缩 GeoJSON 的坐标精度，减小文件体积。(OPT-4)")
    parser.add_argument('input', help="输入文件路径")
    parser.add_argument('-o', '--output', help="输出文件路径，若不指定则在同目录下加 _compressed 后缀", default=None)
    parser.add_argument('-p', '--precision', type=int, default=5, help="小数精度（默认 5位，约1.1m）")
    
    args = parser.parse_args()
    
    if args.output is None:
        base, ext = os.path.splitext(args.input)
        args.output = f"{base}_compressed{ext}"

    print(f"正在读取 {args.input}...")
    with open(args.input, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    if 'features' in data:
        for feature in data['features']:
            if 'geometry' in feature and 'coordinates' in feature['geometry']:
                feature['geometry']['coordinates'] = compress_coordinates(feature['geometry']['coordinates'], args.precision)
                
    print(f"正在写入 {args.output}...")
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':')) # 移除多余空格以最大化压缩率
        
    in_size = os.path.getsize(args.input)
    out_size = os.path.getsize(args.output)
    print(f"压缩完成: {in_size / 1024 / 1024:.2f} MB => {out_size / 1024 / 1024:.2f} MB ({(out_size/in_size)*100:.1f}%)")

if __name__ == "__main__":
    main()
