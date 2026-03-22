import { Activity, Package, Navigation, BarChart3 } from 'lucide-react';
import RightControlPanel from './RightControlPanel';

interface Props {
    onOpenAnalytics: () => void;
}

export default function DashboardOverlay({ onOpenAnalytics }: Props) {
    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 p-6 font-sans">
            <RightControlPanel />

            {/* Top Left Analytics Button */}
            <div className="absolute top-16 left-6 pointer-events-auto z-10">
                <button 
                    onClick={onOpenAnalytics}
                    className="flex items-center justify-center gap-3 px-6 py-3 bg-white/40 backdrop-blur-2xl border border-white/50 rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] transition-all transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 to-transparent pointer-events-none"></div>
                    <BarChart3 size={20} className="text-indigo-700 relative z-10" />
                    <span className="text-base font-bold tracking-wide text-slate-800 relative z-10" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                        统计面板
                    </span>
                </button>
            </div>

            {/* Left Bottom Panel */}
            <div className="absolute bottom-10 left-6 pointer-events-auto bg-white/40 backdrop-blur-2xl border border-white/50 px-7 py-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] min-w-[360px] flex flex-col gap-6 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-1">
                        <h1 className="text-xl font-bold tracking-wide text-slate-800" style={{ textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>
                            城市低空物流网络
                        </h1>
                        <div className="flex items-center gap-2 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                            <span className="text-[10px] text-emerald-700 font-bold tracking-wider">ONLINE</span>
                        </div>
                    </div>
                    <p className="text-slate-600 text-xs font-medium tracking-wider" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.8)' }}>
                        深圳南山运营控制中心
                    </p>
                </div>
                <div className="h-px w-full bg-gradient-to-r from-slate-300 via-slate-200 to-transparent relative z-10"></div>
                <div className="flex flex-col gap-5 relative z-10">
                    <div className="flex flex-col gap-1.5 group">
                        <span className="text-slate-600 text-[11px] font-bold flex items-center gap-2 tracking-wide uppercase">
                            <Navigation size={14} className="text-blue-600" /> 活跃无人机阵列
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span id="dashboard-active-drones" className="text-slate-800 text-3xl font-black tracking-tight drop-shadow-sm">0</span>
                            <span className="text-slate-500 text-xs font-bold">架次</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 group">
                        <span className="text-slate-600 text-[11px] font-bold flex items-center gap-2 tracking-wide uppercase">
                            <Package size={14} className="text-indigo-600" /> 今日累计起飞
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span id="dashboard-cumulative-flights" className="text-slate-800 text-3xl font-black tracking-tight drop-shadow-sm">0</span>
                            <span className="text-slate-500 text-xs font-bold">架次</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 group">
                        <span className="text-slate-600 text-[11px] font-bold flex items-center gap-2 tracking-wide uppercase">
                            <Activity size={14} className="text-rose-600" /> 当前空域负载率
                        </span>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-slate-200/80 rounded-full overflow-hidden shadow-inner border border-slate-300/50">
                                <div id="dashboard-airspace-bar" className="h-full w-[0%] bg-gradient-to-r from-rose-400 to-rose-500 rounded-full shadow-sm transition-all duration-300 ease-out"></div>
                            </div>
                            <span id="dashboard-airspace-load" className="text-slate-800 text-lg font-black drop-shadow-sm w-12 text-right">0%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
