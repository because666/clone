<div align="center">
  <!-- 项目专属 Logo (已缩放至最佳展示尺寸) -->
  <img src="docs/assets/logo.png" alt="AetherWeave Logo" width="90" />

  <h1> AetherWeave | 苍穹织网 </h1>
  <p><strong>面向未来城市的低空物流 3D 实时调度与监控中枢</strong></p>

  <!-- 💡 核心技术栈状态徽章 -->
  <p>
    <img src="https://img.shields.io/badge/前端-React_18-61DAFB?logo=react&logoColor=white" alt="React" />
    <img src="https://img.shields.io/badge/语言-TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/渲染引擎-Deck.gl-FFF?logo=uber" alt="Deck.gl" />
    <img src="https://img.shields.io/badge/地图底座-Mapbox-000000?logo=mapbox&logoColor=white" alt="Mapbox" />
    <img src="https://img.shields.io/badge/后端调度-Flask-000000?logo=flask&logoColor=white" alt="Flask" />
    <img src="https://img.shields.io/badge/存储-SQLite_持久化-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
    <img src="https://img.shields.io/badge/算法-A*_避障-FF9800" alt="Algorithm" />
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="License" />
  </p>

  <p>
    <a href="#-核心特性">核心特性</a> •
    <a href="#-视觉震撼">视觉演示</a> •
    <a href="#-系统架构">架构解析</a> •
    <a href="#-快速上手">快速上手</a>
  </p>
</div>

<br>

**苍穹织网 (AetherWeave)** 是一个应用于城市低空物流网络的监控与可视化调度平台。项目基于 WebGL 渲染管线与 SSE 实时数据流架构，实现了对多并发无人机（UAV）轨迹的三维追踪、风险预警以及运力调度。

本系统包含 3D 大屏态势感知、A* 三维空间避障规划、全链路审批节点以及后台数据分析等核心模块，可为低空经济领域的基建规划及日常运营提供直观的技术验证和决策辅助。

---

## 👁‍🗨 视觉

<div align="center">
  <!-- 核心大屏调度全景 -->
  <video src="https://github.com/user-attachments/assets/e57a241b-572e-4588-a407-b7da5a08baae" autoplay loop muted playsinline style="width: 100%;"></video>
</div>

<br>

<div align="center">
  <table>
    <tr>
      <!-- 模块 1：高潮追踪录屏 -->
      <td align="center">
        <video src="https://github.com/user-attachments/assets/20f0dbe0-786d-4130-bfa8-233cb6e646d7" autoplay loop muted playsinline style="width: 100%;"></video><br/>
        <b>👆 镜头绑定与单机深度追踪</b><br/>
        <sub>锁定高危隐患航班，同步呈现三维历史航线与到点预估时间</sub>
      </td>
      <!-- 模块 2：AI 面板（等待开发） -->
      <td align="center">
        <img src="https://via.placeholder.com/600x380/1e293b/0ea5e9?text=[+WIP+]+AI+Dispatch+Module" alt="自然语言指令调度(研发中)" style="width: 100%;"/><br/>
        <b>👆 🚧 预留：AI 智能体大模型联控台</b><br/>
        <sub>解析模糊自然语言意图，触发底盘秒级空域避障调度重播</sub>
      </td>
    </tr>
    <tr>
      <!-- 模块 3：ROI 沙盘 -->
      <td align="center" colspan="2">
        <img src="docs/assets/ROI.png" alt="基建 ROI 沙盘 DSS 决策系统" style="width: 80%; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); margin-top: 10px;"/><br/>
        <br/><b>👆 🗺️ 基建 ROI 沙盘 (DSS 辅助决策引擎)</b><br/>
        <sub>支持双点 A/B 博弈、财务闭环测算与 3D 雷达激波渲染，赋能城市低空基建选址规划</sub>
      </td>
    </tr>
  </table>
</div>

## ✨ 特性与功能

- 🚀 **高密度三维渲染**: 采用 `Deck.gl` 的 Binary 渲染模式与自定义 `TypedArray` 限制内存分配频率，减少 GC 卡顿。配合 LOD 优化限制不可见区域开销，系统可稳定支持 500+ 架并发 UAV 和 10 万+ 轨迹节点的高帧率大屏渲染。
- 🧠 **三维动态避障与寻路**: 后端算法应用 0.0005° 精度网格进行空间建模和线段碰撞检测，实现规避真实建筑群与多边形禁飞区的三维航线规划，支持动态地形高程匹配与路径点平滑过滤。
- ⚡️ **全链路流式调度推送**: 建立后端请求鉴权与状态机流转。通过 `Flask` 搭载 Server-Sent Events (SSE) 协议向下游大盘推送状态流，单向高频数据结合前端双层缓冲区（Double Buffering）合并更新，减少频繁的 DOM 重绘开销。
- 🛡 **环境仿真与异常预警**: 系统集成气温、多种天气及风场等仿真参数联动模型。无人机航线与划定禁飞区产生空间交集，或受气温载重影响导致续航电量不足时，系统会自动计算剩余余量并在界面生成 UI 预警标签。
- 🔐 **权限隔离与持久化审查**: 采用 `JWT` 角色管控架构区分大盘展示与后台派发权限。核心业务流水、飞行轨迹点与操作者派送指令均实时写入 `SQLite/PostgreSQL` 数据库，保障记录不可篡改以备朔源审查。
- 📊 **空域数据聚合与分析**: 内置基于 `ECharts` 构建的统计面板组件。聚合运行时间线内的派送状态等结构化数据，展示分时段起降热力分布、空域运力负载趋势与能耗使用统计，作为非实时情况判断的辅助。

## 🏗 架构


```mermaid
flowchart TD
    %% 样式表 (轻量工业风与柔和对比)
    classDef frontend fill:#E3F2FD,stroke:#1565C0,stroke-width:1.5px,rx:5px,color:#0D47A1
    classDef middleware fill:#FFF3E0,stroke:#EF6C00,stroke-width:1.5px,rx:5px,color:#E65100
    classDef backend fill:#E8F5E9,stroke:#2E7D32,stroke-width:1.5px,rx:5px,color:#1B5E20
    classDef database fill:#ECEFF1,stroke:#455A64,stroke-width:1.5px,color:#263238

    %% ============ 节点实体 ============
    %% 前端层
    UI[🖥️ 监控视图与 AI 调度台]:::frontend
    Hook[📌 交互防抖与状态机]:::frontend
    Pool[⚡ TypedArray 零分配缓冲]:::frontend
    Render[🗺️ MapBox + Deck.gl 引擎]:::frontend

    %% 服务网关层
    API[🔌 Flask 核心业务 API]:::middleware
    Push[📡 SSE 异步单向推送通道]:::middleware

    %% 后端算法底座
    Engine[🧠 中央空域调度与风控中枢]:::backend
    Planner[📍 A* 动态避障与时空解算]:::backend
    DB[(🗄️ PgSQL / SQLite 安全落盘)]:::database

    %% ============ 系统分层图块 ============
    subgraph Client ["「表现层」 大屏视界与高并发管控端"]
        UI -.->|"动作拦截"| Hook
        Pool ===>|"底层指针复用"| Render
    end

    subgraph Gateway ["「服务层」 读写分离分流网关"]
        API
        Push
    end

    subgraph Server ["「底座层」 时空算法引擎与预警研判"]
        Engine <-->|"派单与调拨"| Planner
        Planner <==>|"数据持久化"| DB
    end

    %% ============ 核心数据流转 ============
    %% 1. 上行业务链路 (Action Flow)
    Hook -- "REST 指令流" --> API
    API -- "解包与鉴权" --> Engine

    %% 2. 下行渲染心跳流 (Render Flow)
    Engine =="时空全域状态同步"==> Push
    Push =="流控合并注入免 GC 缓冲"==> Pool
```

## 🚀 快速上手

### 1. 环境预检
- **Node.js**: >= 18.0.0
- **Python**: >= 3.10
- *无需繁杂的环境变量，内置内存数据库模式供 Demo 极速体验*

### 2. 部署运行

**步骤一：启动后端服务**
```bash
git clone https://github.com/TengJiao33/AetherWeave.git
cd AetherWeave

# 推荐使用虚拟环境：
python -m venv venv
# 激活环境 (Windows 用户运行: .\venv\Scripts\activate)
source venv/bin/activate

cd trajectory_lab
# 安装依赖并启动
pip install -r requirements.txt
python scripts/server.py
# 后端服务已运行在 http://localhost:5001
```

**步骤二：启动前端大屏面板**
```bash
# 请开启全新的终端
cd frontend
npm install
npm run dev     
# 访问 http://localhost:5173 查看 3D 面板
```

## 📚 目录结构导览

```text
AetherWeave/
├── frontend/                 # 浏览器 3D 可视化端 (React 19 + TypeScript + Vite)
│   ├── src/
│   │   ├── components/       # UI 与 Deck.gl 图层组件
│   │   ├── contexts/         # 全局状态管理 (认证、环境仿真)
│   │   ├── hooks/            # 数据流向与状态管理 (动画、图层、SSE)
│   │   ├── features/         # 独立功能模块 (引导、加载进度)
│   │   ├── types/            # TypeScript 类型定义
│   │   └── utils/            # ArrayBuffer 性能优化与工具函数
│   └── public/               # 3D 模型、静态纹理及 GeoJSON 数据
├── trajectory_lab/           # 后端服务与算法引擎 (Python + Flask)
│   ├── scripts/server.py     # Flask 主服务 (认证、调度、SSE、ROI 分析)
│   ├── core/                 # A* 空域避障、NFZ 碰撞检测、POI 匹配
│   ├── models/               # SQLAlchemy ORM 模型 (用户、任务)
│   └── tests/                # 后端单元测试
├── scripts/                  # 数据处理工具 (轨迹生成、能耗建模、城市数据获取)
├── data/                     # 原始数据与处理后数据 (GeoJSON, CSV)
└── docs/                     # 技术文档与架构说明
```



## 团队成员

- **指导老师**：杨正益
- **核心开发组**：应飞扬、邓博、谢丽欣、罗楚瑞

## 📜 开源与法律声明

本项目代码基于 [MIT License](./LICENSE) 协议发布。
允许用于非商业和商业性质的学习与二次开发，但对于数据安全与实飞环境的使用，后果需自行承担。

---
<div align="center">
  <sup>© 2026 AetherWeave Team. MIT Licensed.</sup>
</div>
