<div align="center">
  <!-- 💡 占位符：项目精美 Logo -->
  <img src="docs/assets/logo.png" alt="AetherWeave Logo" width="200" />

  <h1>苍穹织网 (AetherWeave)</h1>
  <p><strong>面向未来城市的低空物流 3D 实时调度与监控中枢</strong></p>

  <!-- 💡 占位符：各类状态徽章，可以根据实际情况在 shields.io 调整 -->
  <p>
    <img src="https://img.shields.io/badge/前端-React_18-61DAFB?logo=react&logoColor=white" alt="React" />
    <img src="https://img.shields.io/badge/渲染引擎-Deck.gl-FFF?logo=uber" alt="Deck.gl" />
    <img src="https://img.shields.io/badge/后端调度-FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/数据流-SSE-FF4500" alt="SSE" />
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

**苍穹织网 (AetherWeave)** 是一个为城市群级低空物流网络打造的高性能监控平台。通过深度优化的 WebGL 二进制渲染管线与 SSE 实时数据流架构，平台突破了传统 B/S 架构的性能瓶颈，实现了对十万级无人机（UAV）轨迹的高精度 4D 动态追踪、自然语言智能调度与运力分布的微观可视化。

本项目致力于打造企业级的高可用交互体验，兼具大盘宏观视界与单机微观追踪能力，完全满足甚至超越国家级赛事的严苛技术指标要求。

---

## 👁‍🗨 视觉震撼 (Visual Highlights)

> 💡 **占位提示**: 下方请替换为高质量的 `.webp` 动图或 `视频`，这是整个 README 最抓眼球的地方。
> **推荐录制内容**：在深色底图下，满屏带尾迹（Trail）泛光效果的无人机群在 3D 楼宇间穿梭；左侧是科技感十足的毛玻璃（Glassmorphism）数据面板，数字实时跳动。

<div align="center">
  <!-- 💡 占位符：主核心运行录屏动图 -->
  <img src="docs/assets/demo_main.webp" alt="核心调度中枢 3D 演示" width="100%" />
</div>

<br>

<div align="center">
  <table>
    <tr>
      <!-- 💡 占位符：子功能演示图 1：聚焦某个无人机 -->
      <td align="center">
        <img src="docs/assets/demo_tracking.webp" alt="单机聚焦与轨迹回溯"/><br/>
        <b>👆 电影级镜头锁定与轨迹追踪</b><br/>
        <sub>点击无人机，镜头平滑锁定，呈现 4D 历史航线与预估到达时间</sub>
      </td>
      <!-- 💡 占位符：子功能演示图 2：用自然语言框打字交互 -->
      <td align="center">
        <img src="docs/assets/demo_nlp_dispatch.webp" alt="自然语言指令调度"/><br/>
        <b>👆 AI 驱动的自然语言调度面板</b><br/>
        <sub>通过大语言模型解析操作意图，完成无代码级的秒级动态运力调配</sub>
      </td>
    </tr>
  </table>
</div>

## ✨ 核心特性 (Key Features)

- 🚀 **极致渲染性能**: 基于 `Deck.gl` 的 Native Binary 渲染模式与自定义 TypedArray 零分配内存管理。全面消融 Garbage Collection (GC) 导致的掉帧，即使在 10 万+ 的高并发渲染场景下，依然保持 60 FPS 的丝滑滚动与缩放。
- ⚡️ **毫秒级实时心跳**: 彻底摒弃高延迟的 HTTP 轮询模式。全量采用 Server-Sent Events (SSE) 协议，配以无锁化双缓冲（Double Buffering）数据注入策略，实现从算法后端到 3D 前端的“零时差”状态触达。
- 🧠 **决策与 AI 调度**: 不仅仅是“能看”，更是“能控”。内置自研调度流，加持自然语言指令层（NLP），可完成如“调拨 5 架无人机前往科技园”的语义级操作与 4D 动态航线重铺。
- 🛡 **空域碰撞演算**: 依托时空交集算法，支持复杂多边形的禁飞区（No-Fly Zone）智能规避。前置算法规避碰撞，加上精细的 UI 警示渲染，保证物流脉络的高效与绝对安全。

## 🏗 系统架构 (Architecture)

> 💡 **架构图提示**: 以下是由 Mermaid 驱动的架构图，能够直观展示我们全栈的流转闭环。您可以在本地将其导出为图片后替换，或直接保留在 Markdown 中由 Git 平台原生接管渲染。

```mermaid
graph TD
    subgraph 前端渲染管线 "3D 渲染与交互网关层 (React + Deck.gl)"
        A[MapBox 3D 底图引擎] --> B(Deck.gl 可视化管线)
        B <==>|原生二进制流转| C{TypedArray 零分配内存池}
        D[操作员面板 / NLP 输入] -.->|防抖与指令生成| E(Hook 状态机)
    end

    subgraph 实时微服务总线 "事件与调度桥接"
        F((SSE 推送集群)) ===>|单向百万级事件推送| C
        E -.->|REST / WebSocket| G[FastAPI 核心网关]
    end

    subgraph 算法中枢与数据底座 "后端系统"
        G --> H{核心调度器引擎}
        H <--> I[AI 语义解析模型]
        H <--> J[4D 轨迹规划算法层]
        J <===> K[(PostgreSQL / 内存级 DuckDB)]
    end
```

## 🚀 快速上手 (Quick Start)

> 我们深知时间宝贵，因此遵循严格的 **“三分内跑通”** 原则。

### 1. 环境预检
- **Node.js**: >= 18.0.0
- **Python**: >= 3.10
- *无需繁杂的环境变量，内置内存数据库模式供 Demo 极速体验*

### 2. 部署运行

**步骤 一：点燃后端中枢**
```bash
git clone https://github.com/TengJiao33/AetherWeave.git
cd AetherWeave

# 我们建议您隔离使用环境：
python -m venv venv
# 激活环境 (Windows 用户运行: .\venv\Scripts\activate)
source venv/bin/activate

cd backend
# 挂载依赖并启动
pip install -r requirements.txt
python main.py  
# 此时，实时推送核心已驻守于 [http://localhost:8000]
```

**步骤 二：唤醒视觉网关**
```bash
# 请开启全新的终端
cd frontend
npm install
npm run dev     
# 登舰！请访问 [http://localhost:3000] 享受您的 3D 物流世界
```

## 📚 目录结构导览

```text
AetherWeave/
├── frontend/             # ✨ 浏览器 3D 可视化端 (React + Typescript)
│   ├── src/
│   │   ├── components/   # 高维抽象的 UI 与 Deck.gl 底层图层组件
│   │   ├── hooks/        # 管控数据流向与动画播放状态的核心 Hooks
│   │   └── utils/        # 面向二进制性能优化的 ArrayBuffer 算子
│   └── public/           # 静态纹理及回放模型数据
├── backend/              # ⚙️ 强实时调度引擎 (Python + FastAPI)
│   ├── core/             # 4D 动态航线、禁飞区计算与碰撞检测算法
│   └── api/              # 高性能 SSE 推送路由与管理面 API
├── trajectory_lab/       # 🔬 算法实验室 (环境模拟验证脚本、批量产生器)
└── docs/                 # 📖 协议定案、架构决策（ADR）与深度解析
```

## 🛠 国奖冲刺与开发路线图 (Roadmap)

我们正处于向国家级大奖发起冲刺的高速迭代期。
每一项突破性特性的研发轨距，均记录在 [国奖冲刺路线图 (`national_award_roadmap.md`)](./national_award_roadmap.md) 中。

如果您有意以代码形式参与“苍穹织网”的演进，请遵循：
1. 提交前确保通过所有的 `lint` 静态检验。
2. 切记：在处理前端海量点阵数据时，**始终保持对大量内存分配引发 GC 造成的卡顿的绝对敏感**。

## 荣誉与团队成员

> 💡 **占位提示**: 这里请写入各位团队成员的名字、主要负责模块、指导老师姓名以及已获奖项。
- **项目指导**：[老师姓名]
- **核心开发组**：
  - [张三]：架构设层与渲染管线优化
  - [李四]：实时调度引擎与算法
  - [王五]：UI/UX 设计交互

## 📜 开源与法律声明 (License)

本项目代码基于 [MIT License](./LICENSE) 协议发布。
允许用于非商业和商业性质的学习与二次开发，但对于数据安全与实飞环境的使用，后果需自行承担。

---
<div align="center">
  <sub>在星云般的数据流中，我们重塑城市低空的秩序。</sub><br/>
  <sup>Built with passion in 2026.</sup>
</div>
