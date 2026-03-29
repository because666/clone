import os
from PIL import Image, ImageDraw

def process_logo():
    # 原始蓝色毛玻璃 Logo 路径
    input_path = r"C:\Users\22433\.gemini\antigravity\brain\8bf4a0b1-05a4-4d5f-8c2f-21d7163abb56\logo_option_1_blue_1774751227535.png"
    output_path = r"d:\develop\demo\docs\assets\logo.png"

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    print("1. 正在读取图片...")
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size

    print("2. 正在进行精密居中裁切，去除边缘和乱码字...")
    # 取中间 70% 作为主体，且整体上移 5% 防止带到底部多余文字
    crop_size = int(min(w, h) * 0.70)
    left = (w - crop_size) / 2
    top = (h - crop_size) / 2 - (h * 0.05)
    if top < 0: top = 0
    right = left + crop_size
    bottom = top + crop_size
    cropped = img.crop((left, top, right, bottom))
    
    print("3. 正在生成圆角矩形透明遮罩 (生成 Apple 风格 App Icon)...")
    cw, ch = cropped.size
    mask = Image.new('L', (cw, ch), 0)
    draw = ImageDraw.Draw(mask)
    # 取边长的 20% 作为圆角弧度，画高精度圆角矩形
    radius = int(cw * 0.20)
    draw.rounded_rectangle((0, 0, cw, ch), radius=radius, fill=255)

    print("4. 应用遮罩并输出终版透明 PNG...")
    # 把遮罩叠加为 A 通道
    cropped.putalpha(mask)
    cropped.save(output_path, "PNG")
    print(f"成功！去除了背景的标准圆角透明 Logo 已存至: {output_path}")

if __name__ == "__main__":
    process_logo()
