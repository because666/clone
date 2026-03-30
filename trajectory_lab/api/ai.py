import os
import json
import logging
import requests

from flask import Blueprint, request, jsonify
from trajectory_lab.middleware.auth import role_required
from shapely.geometry import Point, LineString

logger = logging.getLogger("TrajServer")

def check_nofly_zones(slon, slat, elon, elat):
    try:
        current_dir = os.path.dirname(__file__)
        geojson_path = os.path.normpath(os.path.join(current_dir, "../../data/processed/geojson/poi_sensitive.geojson"))
        if not os.path.exists(geojson_path):
            return []
            
        with open(geojson_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        line = LineString([(slon, slat), (elon, elat)])
        intersected = []
        for feat in data.get('features', []):
            coords = feat['geometry']['coordinates']
            pt = Point(coords[0], coords[1])
            # EPSG:4326 到米的极简投影估算
            dist_m = line.distance(pt) * 111320
            
            props = feat.get('properties', {})
            cat = props.get('category', '')
            name = props.get('name', '敏感区域')
            
            # 各类禁飞区安全半径
            radius = 200
            if cat in ['hospital', 'school']: radius = 300
            elif cat in ['clinic', 'kindergarten']: radius = 250
            elif cat == 'police': radius = 150
            
            if dist_m < radius:
                intersected.append(name)
        return intersected
    except Exception as e:
        logger.error(f"测算禁飞区报错: {e}")
        return []

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')

# 通义千问 兼容 API 默认配置
DEFAULT_LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
DEFAULT_LLM_MODEL = "qwen-plus"

@ai_bp.route("/preflight-check", methods=["POST"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def preflight_check():
    """
    航线飞行前 AI 风险预审接口
    """
    body = request.get_json(force=True, silent=True) or {}
    
    start_point = body.get("start_point", "未知起点")
    end_point = body.get("end_point", "未知终点")
    distance = body.get("distance", 0)
    wind_speed = body.get("wind_speed", 0)
    weather_desc = body.get("weather", "晴朗")
    
    slon = body.get("start_lon", 0)
    slat = body.get("start_lat", 0)
    elon = body.get("end_lon", 0)
    elat = body.get("end_lat", 0)
    
    nofly_zones = []
    if slon and slat and elon and elat:
        nofly_zones = check_nofly_zones(float(slon), float(slat), float(elon), float(elat))
    
    # 尝试从环境变量获取 API Key
    api_key = os.environ.get("LLM_API_KEY", "")
    base_url = os.environ.get("LLM_BASE_URL", DEFAULT_LLM_BASE_URL)
    model_name = os.environ.get("LLM_MODEL", DEFAULT_LLM_MODEL)
    
    system_prompt = f"""你是一个专业的“城市级低空物流航线安全评估专家”。
请根据以下航班的参数，判断允许起飞的风险等级（LOW, MEDIUM, HIGH），并给出理由和建议。
以JSON格式返回结果，必须严格遵循以下格式，不要包含任何额外的markdown代码块包裹或其他文本：
{{"risk_level": "RED/YELLOW/GREEN", "reason": "...", "suggestion": "..."}}

规则：
- 风速 > 10m/s -> RED (高风险)
- 距离 > 5000m -> YELLOW (中风险)
- 出现雨雪等恶劣天气 -> RED (高风险)
- 若检测到途径禁飞区/敏感单位 -> 坚决 RED (高风险)，并在理由中列出具体单位！
- 其他情况视具体输入评估
"""

    user_prompt = f"""
航班评估请求：
- 起点：{start_point}
- 终点：{end_point}
- 预计直线距离：{distance} 米
- 实时风速：{wind_speed} m/s
- 局部天气：{weather_desc}
"""
    if nofly_zones:
        user_prompt += f"\n【⚠️ 严重安全隐患警报 ⚠️】\n根据雷达地形扫描，此航线直线投影将穿越极地禁飞区或敏感建筑：{', '.join(nofly_zones)}。法规严格禁止！！请务必进行 RED 驳回！\n"

    # 如果没有配置真实的 API_KEY，则使用 Mock 数据保证演示闭环
    if not api_key:
        logger.warning("未配置 LLM_API_KEY，使用 Mock 风险评估数据！")
        # 简单 Mock 逻辑
        if nofly_zones:
            mock_res = {
                "risk_level": "RED",
                "reason": f"航线投影穿越禁飞区管控范围（{', '.join(nofly_zones)}），极大概率产生公共安全隐患。",
                "suggestion": "禁止起飞，请使用规避航线或申请特批。"
            }
        elif float(wind_speed) > 10 or ("雨" in weather_desc or "雪" in weather_desc):
            mock_res = {
                "risk_level": "RED",
                "reason": f"当前风速达到 {wind_speed}m/s 或存在恶劣天气（{weather_desc}），容易导致无人机姿态失控与偏航，引发坠毁事故。",
                "suggestion": "强烈建议驳回或延误起飞，直至气象条件好转。"
            }
        elif float(distance) > 5000:
            mock_res = {
                "risk_level": "YELLOW",
                "reason": f"航线距离 {distance}m 较长，存在一定的电池续航压力与不可控突发异常风险。",
                "suggestion": "建议关注电池余量，并在系统中分配备降点备用。"
            }
        else:
            mock_res = {
                "risk_level": "GREEN",
                "reason": f"目标距离 {distance}m 在安全范围内，起降区域气象平稳（风速 {wind_speed}m/s，{weather_desc}），无明显空中管制与微型障碍物隐患。",
                "suggestion": "气象与空域条件优良，建议立即放行。"
            }
            
        return jsonify({
            "code": 0,
            "data": mock_res,
            "message": "success (mock)"
        })

    # 调用真实的大模型 API (OpenAI 兼容模式)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2, # 较低温度以保证JSON格式更稳定
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = requests.post(base_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        res_json = response.json()
        content = res_json["choices"][0]["message"]["content"]
        
        # 尝试反序列化 JSON
        parsed_content = json.loads(content)
        # 容错处理返回值
        if "risk_level" not in parsed_content:
            parsed_content["risk_level"] = "GREEN"
        if parsed_content["risk_level"] not in ["RED", "YELLOW", "GREEN"]:
            parsed_content["risk_level"] = "GREEN"
            
        return jsonify({
            "code": 0,
            "data": parsed_content,
            "message": "success"
        })
        
    except Exception as e:
        logger.error(f"AI API 请求失败: {str(e)}")
        # 失败降级策略
        return jsonify({
            "code": 50000,
            "data": {
                "risk_level": "YELLOW",
                "reason": "AI 预审服务超时或不可用，系统启动安全降级策略。",
                "suggestion": "请调度员人工介入核查天气及航线状态。"
            },
            "message": f"AI请求异常: {str(e)}"
        })
