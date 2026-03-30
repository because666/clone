import { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Shield, Loader, Zap, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

interface PointInfo {
    name: string;
    lat: number;
    lon: number;
}

interface AiPreflightModalProps {
    isOpen: boolean;
    fromPoint: PointInfo | null;
    toPoint: PointInfo | null;
    city: string;
    // 环境数据暂时随机或Mock注入，后期可从全局状态接入
    weather?: { desc: string; windSpeed: number };
    onClose: () => void;
    onConfirm: () => void;
}

interface AiResponse {
    risk_level: 'GREEN' | 'YELLOW' | 'RED';
    reason: string;
    suggestion: string;
}

// 基于真实起降点坐标的简易距离估算功能 (单位: 米)
function estimateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.floor(R * c);
}

export default function AiPreflightModal({
    isOpen,
    fromPoint,
    toPoint,
    weather = { desc: "多云", windSpeed: 4.5 },
    onClose,
    onConfirm
}: AiPreflightModalProps) {
    const [loading, setLoading] = useState(true);
    const [result, setResult] = useState<AiResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [autoConfirming, setAutoConfirming] = useState(false);

    useEffect(() => {
        if (isOpen && fromPoint && toPoint) {
            setLoading(true);
            setResult(null);
            setError(null);
            setAutoConfirming(false);

            const distance = estimateDistance(fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon);

            // 发起请求给后端真实接口（或Mock兜底）
            fetch('/api/ai/preflight-check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 如果系统由登录接口统一接管，这里可能需要补充 JWT 通用头部
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                },
                body: JSON.stringify({
                    start_point: fromPoint.name,
                    start_lat: fromPoint.lat,
                    start_lon: fromPoint.lon,
                    end_point: toPoint.name,
                    end_lat: toPoint.lat,
                    end_lon: toPoint.lon,
                    distance: distance,
                    wind_speed: weather.windSpeed,
                    weather: weather.desc
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.code === 0) {
                        const res = data.data as AiResponse;
                        setResult(res);
                        // 绿色低风险：直接走绿色通道自动授权放行
                        if (res.risk_level === 'GREEN') {
                            setAutoConfirming(true);
                            setTimeout(() => {
                                onConfirm();
                            }, 2000);
                        }
                    } else {
                        setError(data.message || 'AI 预审服务返回异常');
                    }
                })
                .catch(err => {
                    setError(`网络或系统错误: ${err.message}`);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [isOpen, fromPoint, toPoint, weather.desc, weather.windSpeed]);

    if (!isOpen) return null;

    const renderIcon = () => {
        if (loading) return <Shield className="w-12 h-12 text-blue-500 animate-pulse" />;
        if (error) return <AlertCircle className="w-12 h-12 text-slate-400" />;

        switch (result?.risk_level) {
            case 'GREEN': return <ShieldCheck className="w-12 h-12 text-emerald-500" />;
            case 'YELLOW': return <ShieldAlert className="w-12 h-12 text-amber-500" />;
            case 'RED': return <AlertTriangle className="w-12 h-12 text-rose-500 animate-bounce" />;
            default: return <Shield className="w-12 h-12 text-slate-400" />;
        }
    };

    const getColors = () => {
        if (loading) return 'from-blue-500/10 to-indigo-500/5 border-blue-200/50';
        if (error) return 'from-slate-500/10 to-slate-400/5 border-slate-200/50';

        switch (result?.risk_level) {
            case 'GREEN': return 'from-emerald-500/10 to-emerald-400/5 border-emerald-200/50';
            case 'YELLOW': return 'from-amber-500/10 to-orange-400/5 border-amber-200/50';
            case 'RED': return 'from-rose-500/10 to-red-500/5 border-rose-300';
            default: return 'from-slate-500/10 to-slate-400/5 border-slate-200/50';
        }
    };

    return (
        <div className="fixed top-24 right-8 z-[100] pointer-events-none flex flex-col items-end">
            {/* 弹窗主体 */}
            <div className={`relative w-[480px] pointer-events-auto overflow-hidden rounded-[2rem] bg-white/85 backdrop-blur-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border ${getColors()} transition-all duration-500 animate-in slide-in-from-right-8 ease-out`}>

                {/* 顶部流光动画 (如果还在加载中) */}
                {loading && (
                    <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden z-10">
                        <div className="w-1/3 h-full bg-blue-500 rounded-full animate-[progress_1.5s_ease-in-out_infinite]"></div>
                    </div>
                )}

                <div className="p-7">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 flex items-center justify-center w-[72px] h-[72px] rounded-2xl bg-white shadow-inner border border-white relative">
                            {renderIcon()}
                            {loading && (
                                <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-blue-500 animate-spin opacity-50"></div>
                            )}
                        </div>

                        <div className="flex-1">
                            <h2 className="text-xl font-black text-slate-800 tracking-wide mb-1.5 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-indigo-500" />
                                AI 智能预审
                            </h2>
                            <p className="text-xs font-semibold text-slate-500 leading-tight">
                                自 <span className="text-slate-700">{fromPoint?.name || '起点'}</span> 至 <span className="text-slate-700">{toPoint?.name || '终点'}</span>
                            </p>

                            <div className="mt-4 flex gap-3 text-xs font-bold font-mono">
                                <div className="bg-slate-100/80 px-2.5 py-1 rounded text-slate-600 border border-slate-200">
                                    风速: {weather.windSpeed}m/s
                                </div>
                                <div className="bg-slate-100/80 px-2.5 py-1 rounded text-slate-600 border border-slate-200">
                                    气象: {weather.desc}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5">
                        {loading && (
                            <div className="p-4 rounded-2xl bg-white/50 border border-white border-dashed space-y-2.5">
                                <div className="h-2.5 bg-slate-200/50 rounded-full w-3/4 animate-pulse"></div>
                                <div className="h-2.5 bg-slate-200/50 rounded-full w-full animate-pulse"></div>
                                <div className="h-2.5 bg-slate-200/50 rounded-full w-5/6 animate-pulse"></div>
                                <div className="mt-3 text-[11px] font-bold text-center text-indigo-400 animate-pulse flex items-center justify-center gap-2">
                                    <Loader className="w-3 h-3 animate-spin" /> 通义千问 Qwen-Plus 推理中...
                                </div>
                            </div>
                        )}

                        {error && !loading && (
                            <div className="p-3.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 text-xs font-semibold">
                                {error}
                            </div>
                        )}

                        {result && !loading && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="p-5 rounded-3xl bg-white/70 border border-white shadow-sm hover:shadow-md transition-shadow">
                                    <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                                        综合评估
                                        {result.risk_level === 'GREEN' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md ml-1 uppercase tracking-wideset font-bold border border-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.3)]">低风险放行准则</span>}
                                        {result.risk_level === 'YELLOW' && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md ml-1 uppercase tracking-wideset font-bold border border-amber-200">中等隐患风险</span>}
                                        {result.risk_level === 'RED' && <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md ml-1 uppercase tracking-wideset font-bold border border-rose-200 animate-pulse">高风险禁飞警告</span>}
                                    </h3>
                                    <p className="text-[13px] text-slate-600 leading-relaxed font-semibold">
                                        {result.reason}
                                    </p>
                                </div>

                                <div className={`p-4 rounded-2xl text-[13px] font-bold border ${result.risk_level === 'RED' ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-inner' :
                                    result.risk_level === 'YELLOW' ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-inner' :
                                        'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-inner'
                                    }`}>
                                    <span className="opacity-70 mr-2 border-r border-current pr-2 py-0.5">专家建议</span>
                                    {result.suggestion}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 底部按钮栏 */}
                <div className="px-7 py-5 bg-slate-50/50 backdrop-blur-sm border-t border-slate-200/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={autoConfirming}
                        className={`px-4 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 bg-white hover:bg-slate-100 hover:text-slate-900 transition-colors border border-slate-200 shadow-sm ${autoConfirming ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                        {autoConfirming ? '锁定' : '撤销航线'}
                    </button>
                    {(error || loading) ? (
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2.5 rounded-xl text-[13px] font-black text-white transition-all shadow-[0_2px_10px_rgba(79,70,229,0.2)] bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 flex items-center gap-1.5"
                        >
                            强制跳过评估创建 <CheckCircle className="w-4 h-4 opacity-70" />
                        </button>
                    ) : (
                        <button
                            onClick={onConfirm}
                            disabled={autoConfirming}
                            className={`px-5 py-2.5 rounded-xl text-[13px] font-black text-white transition-all shadow-md group border ${result?.risk_level === 'GREEN' ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 shadow-[0_2px_15px_rgba(16,185,129,0.4)] px-6' :
                                result?.risk_level === 'RED' ? 'bg-rose-600 hover:bg-rose-700 border-rose-700 shadow-[0_2px_10px_rgba(225,29,72,0.2)]' :
                                    'bg-indigo-600 hover:bg-indigo-700 border-indigo-700 shadow-[0_2px_10px_rgba(79,70,229,0.2)]'
                                } ${autoConfirming ? 'scale-[1.02] bg-emerald-500 ring-2 ring-emerald-300 ring-offset-1 pointer-events-none' : ''}`}
                        >
                            <span className="flex items-center gap-2">
                                {result?.risk_level === 'RED' ? (
                                    <>强行提交工单 <AlertTriangle className="w-4 h-4 opacity-70 group-hover:animate-ping" /></>
                                ) : result?.risk_level === 'GREEN' ? (
                                    <>
                                        {autoConfirming ? (
                                            <>准予放飞，正在下发机组...</>
                                        ) : (
                                            <>确认起飞 <CheckCircle className="w-4 h-4 opacity-70" /></>
                                        )}
                                        {autoConfirming && <Loader className="w-4 h-4 animate-spin ml-1" />}
                                    </>
                                ) : (
                                    <>人工介入授权起飞 <ShieldAlert className="w-4 h-4 opacity-70" /></>
                                )}
                            </span>
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
            `}</style>
        </div>
    );
}
