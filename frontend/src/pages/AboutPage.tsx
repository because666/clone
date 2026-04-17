/**
 * AboutPage.tsx — AI 技术路径展示 + 地图合规声明 + 团队信息
 *
 * 满足赛规要求：
 *   #10 - AI 工具使用路径的显式化展示（大赛附件4第4条）
 *   #11 - 地图合规性声明（大赛通知第四条第5款）
 *
 * 设计要点：
 *   - 公开页面，无需登录
 *   - 滚动式单页，分段展示
 *   - 与主站一致的设计语言
 */
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Brain, Shield, Code2, Database, Map, Cpu,
    Workflow, ChevronRight, Layers, Zap, Server, Lock, Eye,
    GitBranch, Box, Radio, BarChart3, ArrowDownToLine, Smartphone
} from 'lucide-react';

export default function AboutPage() {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(160deg, #fafafa 0%, #f8fafc 40%, #f1f5f9 100%)',
            fontFamily: '"Inter", -apple-system, "Segoe UI", sans-serif',
        }}>
            {/* 顶部导航 */}
            <nav style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '0 4px 24px rgba(31,38,135,0.06)',
                padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <button onClick={() => navigate('/dashboard')} title="返回大屏" style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#334155', fontSize: 13, fontWeight: 700,
                }}>
                    <ArrowLeft size={16} /> 返回平台
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: '#1e293b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <span style={{ color: 'white', fontSize: 10, fontWeight: 900 }}>AW</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>苍穹织网</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: 1 }}>AETHERWEAVE</span>
                </div>
                <div style={{ width: 80 }} /> {/* 占位平衡 */}
            </nav>

            {/* Hero Section */}
            <section style={{
                textAlign: 'center', padding: '64px 24px 48px',
                maxWidth: 800, margin: '0 auto',
            }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#f1f5f9', border: '1px solid #e2e8f0',
                    borderRadius: 20, padding: '6px 16px', marginBottom: 20,
                    fontSize: 11, fontWeight: 700, color: '#475569',
                }}>
                    <Brain size={14} /> AI 驱动的低空经济平台
                </div>
                <h1 style={{
                    fontSize: 42, fontWeight: 900, color: '#0f172a',
                    letterSpacing: '-1px', lineHeight: 1.2, marginBottom: 16,
                }}>
                    技术架构与 AI 技术路径
                </h1>
                <p style={{
                    fontSize: 16, color: '#64748b', lineHeight: 1.7, maxWidth: 640, margin: '0 auto',
                }}>
                    本平台融合 A* 航路规划、大语言模型风险预审、SoA 高性能渲染管线等核心技术，
                    打造面向城市低空经济的全链路智能化解决方案。
                </p>
            </section>

            {/* AI 工具使用清单 */}
            <SectionContainer>
                <SectionTitle icon={<Brain />} title="AI 工具使用清单" subtitle="依据大赛要求，详细列出本项目中使用的 AI 技术及工具" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    <AiToolCard
                        icon={<Brain size={20} />}
                        name="通义千问 Qwen-Plus"
                        provider="阿里云 · 百炼平台"
                        usage="航线安全风险预审（Preflight AI Check）"
                        detail="接收航线参数（起终点、距离、风速、天气），通过结构化 System Prompt 注入后输出 JSON 格式的风险评估结果 (RED/YELLOW/GREEN)。配合 Shapely 几何引擎进行禁飞区碰撞检测，实现自动化安全拦截。"
                        gradient="from-blue-500 to-indigo-600"
                    />
                    <AiToolCard
                        icon={<Code2 size={20} />}
                        name="DeepSeek"
                        provider="深度求索 · AI 代码辅助"
                        usage="开发阶段代码辅助与架构优化"
                        detail="辅助完成 A* 路径规划算法 v4 版本迭代、SoA 渲染架构设计、SharedArrayBuffer 并行计算方案等核心代码的开发与调试。所有 AI 生成代码均经过人工审核与深度修改。"
                        gradient="from-emerald-500 to-teal-600"
                    />
                    <AiToolCard
                        icon={<Database size={20} />}
                        name="Shapely 几何引擎"
                        provider="Python GIS 生态"
                        usage="禁飞区空间碰撞检测"
                        detail="基于 GeoJSON 格式的敏感区域数据（医院、学校、政府机关），对航线直线投影执行 Point-Line 距离检测，自动拦截穿越禁飞区的危险航线。"
                        gradient="from-amber-500 to-orange-600"
                    />
                    <AiToolCard
                        icon={<Cpu size={20} />}
                        name="Scikit-learn 随机森林"
                        provider="Python ML 生态"
                        usage="无人机能耗预测模型"
                        detail="基于飞行距离、风速、载重等特征训练的回归模型 (energy_rf_model.pkl, 6MB)，为每条航线提供精准的能耗预测值，辅助运营决策。"
                        gradient="from-violet-500 to-purple-600"
                    />
                </div>
            </SectionContainer>

            {/* Prompt Engineering 技术路径 */}
            <SectionContainer>
                <SectionTitle icon={<Workflow />} title="Prompt Engineering 技术路径" subtitle="大语言模型在航线安全预审场景的完整调用链路" />
                <div style={{
                    background: 'white', borderRadius: 20, padding: 32,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)',
                }}>
                    {/* 流程图 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'center' }}>
                        <FlowStep
                            step={1}
                            icon={<Map size={18} />}
                            title="用户交互层"
                            desc="用户在 3D 大屏上选取起/终点 POI，系统自动采集经纬度坐标"
                            color="#4f46e5"
                        />
                        <FlowArrow />
                        <FlowStep
                            step={2}
                            icon={<Database size={18} />}
                            title="参数采集层"
                            desc="聚合航线参数：直线距离 (m)、实时风速 (m/s)、局部天气 + Shapely 禁飞区碰撞检测结果"
                            color="#0ea5e9"
                        />
                        <FlowArrow />
                        <FlowStep
                            step={3}
                            icon={<Brain size={18} />}
                            title="System Prompt 注入"
                            desc="构建结构化系统提示词，嵌入评估规则（风速>10m/s→RED、距离>5000m→YELLOW、禁飞区→RED）和 JSON 输出格式约束"
                            color="#8b5cf6"
                        />
                        <FlowArrow />
                        <FlowStep
                            step={4}
                            icon={<Zap size={18} />}
                            title="LLM 推理层"
                            desc='调用 Qwen-Plus API（阿里云百炼 HTTP 兼容接口），temperature=0.2 保证输出稳定性，response_format=json_object 强制 JSON 输出'
                            color="#f59e0b"
                        />
                        <FlowArrow />
                        <FlowStep
                            step={5}
                            icon={<Shield size={18} />}
                            title="降级兜底策略"
                            desc="API 不可用时启用 Mock 规则引擎（基于风速/距离/禁飞区的确定性判断），确保系统在无网络环境下仍能完成预审闭环"
                            color="#ef4444"
                        />
                        <FlowArrow />
                        <FlowStep
                            step={6}
                            icon={<Eye size={18} />}
                            title="前端可视化渲染"
                            desc="将 risk_level 映射为交通灯 UI（🟢绿/🟡黄/🔴红），在 AI 预审弹窗中展示原因和建议，辅助调度员审批决策"
                            color="#22c55e"
                            isLast
                        />
                    </div>
                </div>
            </SectionContainer>

            {/* 系统架构总览 */}
            <SectionContainer>
                <SectionTitle icon={<Layers />} title="系统架构总览" subtitle="前后端分离、模块化蓝图、多维度性能优化" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    <ArchCard icon={<Box />} title="前端渲染引擎" items={[
                        'SoA 连续内存 + TypedArray 零 GC',
                        'SharedArrayBuffer + Atomics 栅栏无锁同步',
                        'Web Worker 并行插值 + 视距裁剪',
                        'deck.gl WebGL2 + 3D 建筑柱体',
                        '空间哈希网格(0.002°) 冲突检测 O(N²)→O(N)',
                    ]} color="#4f46e5" />
                    <ArchCard icon={<GitBranch />} title="A* v4 路径规划" items={[
                        '0.0005° 网格精度 + 50000 节点上限',
                        '线段碰撞检测 + 贝塞尔路径平滑',
                        '禁飞区 Shapely Point-Line 空间拦截',
                        '路径点空间哈希索引加速探索',
                        '多进程并行批量规划 (multiprocessing)',
                    ]} color="#0ea5e9" />
                    <ArchCard icon={<Server />} title="后端蓝图架构" items={[
                        '7 个 Flask Blueprint 微服务分治',
                        'SQLAlchemy ORM 持久化',
                        'SSE 长连接实时任务推送',
                        'Gunicorn 单 Worker + 多线程并发',
                        'Docker 多阶段构建 + 健康检查',
                    ]} color="#22c55e" />
                    <ArchCard icon={<Lock />} title="安全体系" items={[
                        'JWT 三级角色鉴权 (ADMIN/DISPATCHER/VIEWER)',
                        'AI 预审 Mock 降级保证离线闭环',
                        'Shapely 禁飞区空间安全拦截',
                        'CORS 跨域安全策略',
                        'Token 鉴权覆盖 SSE/REST 双通道',
                    ]} color="#f59e0b" />
                    <ArchCard icon={<Radio />} title="实时通信" items={[
                        'SSE 长连接单向事件推送',
                        '1s 心跳间隔状态同步',
                        '前端 SharedEventSource 单例复用',
                        'EventSource 断线自动重连',
                    ]} color="#8b5cf6" />
                    <ArchCard icon={<BarChart3 />} title="数据分析" items={[
                        '6 城市跨域对比雷达图',
                        '能耗分布 + 载荷分级统计',
                        'A* 算法性能指标面板',
                        '告警态势饼图',
                        '分时段订单调度趋势',
                    ]} color="#ec4899" />
                    <ArchCard icon={<ArrowDownToLine />} title="Binary 传输协议" items={[
                        'struct.pack 自定义紧凑二进制编码',
                        '前端 ArrayBuffer 零拷贝解码',
                        'JSON ~4MB → Binary ~1MB (压缩 75%)',
                        'Float32/Float64 精度分级存储',
                        'Worker 线程异步 JSON 解析兜底',
                    ]} color="#06b6d4" />
                    <ArchCard icon={<Smartphone />} title="移动端适配" items={[
                        '独立 Mobile API Blueprint',
                        'QR Code 扫码快速接入',
                        '轻量化任务看板视图',
                        '移动端专属数据裁剪',
                    ]} color="#f43f5e" />
                </div>
            </SectionContainer>

            {/* 技术栈 */}
            <SectionContainer>
                <SectionTitle icon={<Code2 />} title="核心技术栈" subtitle="全栈自研，零依赖低代码框架" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {[
                        'React 19', 'TypeScript', 'Vite 7', 'deck.gl', 'MapLibre GL',
                        'TailwindCSS 4', 'ECharts 6', 'Flask', 'SQLAlchemy', 'JWT',
                        'Shapely', 'scikit-learn', 'Docker', 'Gunicorn', 'Python 3.11',
                        'SharedArrayBuffer', 'Web Workers', 'SSE',
                    ].map(tech => (
                        <span key={tech} style={{
                            padding: '9px 18px', borderRadius: 10,
                            background: 'white', border: '1px solid #e2e8f0',
                            fontSize: 13, fontWeight: 700, color: '#475569',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            {tech}
                        </span>
                    ))}
                </div>
            </SectionContainer>

            {/* 团队信息 */}
            <SectionContainer>
                <SectionTitle icon={<Layers />} title="开发团队" subtitle="4C 2026 · 软件应用与开发赛道 · Web 应用与开发" />
                <div style={{
                    background: 'white', borderRadius: 20, padding: 32,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)',
                }}>
                    {/* 院校信息 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
                        <img src="/CQU.png" alt="重庆大学" style={{ height: 64, objectFit: 'contain', marginBottom: 8 }} />
                        <p style={{ fontSize: 15, color: '#475569', margin: 0, fontWeight: 700, letterSpacing: 1 }}>大数据与软件学院</p>
                    </div>

                    <div style={{ height: 1, background: '#e2e8f0', margin: '0 40px 24px' }} />

                    {/* 团队成员 */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginBottom: 24, flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, margin: '0 0 6px', letterSpacing: 2, textTransform: 'uppercase' }}>指导老师</p>
                            <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>杨正益</p>
                        </div>
                        <div style={{ width: 1, background: '#e2e8f0' }} />
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, margin: '0 0 6px', letterSpacing: 2, textTransform: 'uppercase' }}>核心开发组</p>
                            <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>应飞扬 · 邓博 · 谢丽欣 · 罗楚瑞</p>
                        </div>
                    </div>

                    <div style={{ height: 1, background: '#f1f5f9', margin: '0 0 16px' }} />
                    <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, margin: 0, textAlign: 'center' }}>
                        本项目由参赛团队独立设计与开发，所有核心算法、架构设计与界面实现均为原创。
                        AI 工具仅用于辅助开发与特定业务场景（详见上方清单），不涉及作品核心创意的生成。
                    </p>
                </div>
            </SectionContainer>

            {/* 地图合规声明 (#11) */}
            <section style={{
                maxWidth: 1400, margin: '0 auto', padding: '0 32px 64px',
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #fefce8, #fef3c7)', borderRadius: 20,
                    padding: 28, border: '1px solid #fde68a',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Shield size={18} style={{ color: '#d97706' }} />
                        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#92400e', margin: 0 }}>地图数据合规声明</h3>
                    </div>
                    <div style={{ fontSize: 12, color: '#78716c', lineHeight: 1.8 }}>
                        <p style={{ margin: '0 0 8px' }}>
                            <strong>底图来源：</strong>本系统使用 CARTO (basemaps.cartocdn.com) 提供的开源 Positron 底图样式,
                            该底图为全球性开源地图服务，基于 OpenStreetMap 数据渲染。
                        </p>
                        <p style={{ margin: '0 0 8px' }}>
                            <strong>使用范围：</strong>本系统仅展示中国境内 6 个城市的局部城区街道与建筑轮廓，用于学术研究与技术展示,
                            不涉及中国国界、省界、行政区域界线等政治敏感地理信息的标注与展示。
                        </p>
                        <p style={{ margin: '0 0 8px' }}>
                            <strong>建筑数据：</strong>建筑轮廓数据来源于 OpenStreetMap 社区贡献的公开 GeoJSON 数据，
                            仅用于 3D 建筑高度渲染，不涉及测绘地理信息的生产与发布。
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong>合规承诺：</strong>本项目严格遵守《中华人民共和国测绘法》及相关规定，
                            如需正式部署运营，将切换至天地图 (www.tianditu.gov.cn) 等具有审图号的持证地图服务。
                        </p>
                    </div>
                </div>
            </section>

            {/* 页脚 */}
            <footer style={{
                textAlign: 'center', padding: '24px', borderTop: '1px solid #e2e8f0',
                background: 'rgba(255,255,255,0.5)',
            }}>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                    苍穹织网 AetherWeave · 低空经济AI数字孪生引擎 · 4C 2026
                </p>
            </footer>
        </div>
    );
}

// ======================== 子组件 ========================

function SectionContainer({ children }: { children: React.ReactNode }) {
    return (
        <section style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px 48px' }}>
            {children}
        </section>
    );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ color: '#334155' }}>{icon}</div>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{title}</h2>
            </div>
            <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500, margin: 0, paddingLeft: 34 }}>{subtitle}</p>
        </div>
    );
}

function AiToolCard({ icon, name, provider, usage, detail, gradient }: {
    icon: React.ReactNode; name: string; provider: string; usage: string; detail: string; gradient: string;
}) {
    return (
        <div style={{
            background: 'white', borderRadius: 18, padding: 24, position: 'relative', overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)',
            transition: 'transform 0.2s, box-shadow 0.2s',
        }}>
            <div style={{
                position: 'absolute', top: -20, right: -20, width: 80, height: 80,
                borderRadius: '50%', background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
                opacity: 0.08, filter: 'blur(10px)',
            }} />
            <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `linear-gradient(135deg, ${gradient.includes('blue') ? '#3b82f6' : gradient.includes('emerald') ? '#10b981' : gradient.includes('amber') ? '#f59e0b' : '#8b5cf6'}, ${gradient.includes('blue') ? '#4f46e5' : gradient.includes('emerald') ? '#0d9488' : gradient.includes('amber') ? '#ea580c' : '#7c3aed'})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', marginBottom: 14,
            }}>
                {icon}
            </div>
            <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>{name}</h4>
            <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, margin: '0 0 10px' }}>{provider}</p>
            <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#f1f5f9', color: '#334155', borderRadius: 6,
                padding: '4px 10px', fontSize: 11, fontWeight: 700, marginBottom: 10,
            }}>
                <ChevronRight size={10} /> {usage}
            </div>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, margin: 0 }}>{detail}</p>
        </div>
    );
}

function FlowStep({ step, icon, title, desc, color, isLast }: {
    step: number; icon: React.ReactNode; title: string; desc: string; color: string; isLast?: boolean;
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 16, width: '100%', maxWidth: 800,
        }}>
            <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: color, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${color}33`,
            }}>
                {icon}
            </div>
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: color, fontFamily: 'monospace' }}>STEP {step}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{title}</span>
                </div>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
        </div>
    );
}

function FlowArrow() {
    return (
        <div style={{
            width: 2, height: 24, background: 'linear-gradient(to bottom, #cbd5e1, #e2e8f0)',
            marginLeft: 17, borderRadius: 1,
        }} />
    );
}

function ArchCard({ icon, title, items, color }: {
    icon: React.ReactNode; title: string; items: string[]; color: string;
}) {
    return (
        <div style={{
            background: 'white', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)',
            borderTop: `3px solid ${color}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ color }}>{icon}</div>
                <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>{title}</h4>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'none' }}>
                {items.map((item, i) => (
                    <li key={i} style={{
                        fontSize: 12, color: '#64748b', lineHeight: 2, fontWeight: 500,
                        position: 'relative', paddingLeft: 8,
                    }}>
                        <span style={{
                            position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)',
                            width: 4, height: 4, borderRadius: '50%', background: color, opacity: 0.5,
                        }} />
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}
