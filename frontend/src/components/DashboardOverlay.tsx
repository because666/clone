import { memo } from 'react';
import { Activity, Package, Navigation, BarChart3, ListChecks, Target, Wind, Cloud, CloudRain, CloudSnow, CloudLightning, Thermometer, Sun, PieChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RightControlPanel from './RightControlPanel';
import { CITY_CONTROL_CENTER_MAP } from '../constants/map';
import { useEnvironment } from '../contexts/EnvironmentContext';

interface Props {
    onOpenAnalytics: () => void;
    onOpenTasks: () => void;
    onToggleSandbox: () => void;
    isSandboxMode: boolean;
    currentCity?: string;
    isRightPanelOpen: boolean;
    onToggleRightPanel: () => void;
}

/** 天气类型对应的显示标签 */
const WEATHER_LABEL: Record<string, string> = {
    sunny: '晴天', cloudy: '多云', rainy: '小雨', snowy: '降雪', hailing: '冰雹',
};

/** 天气类型对应的图标 */
function WeatherIcon({ type, size = 22 }: { type: string; size?: number }) {
    switch (type) {
        case 'cloudy': return <Cloud size={size} className="text-slate-400" />;
        case 'rainy': return <CloudRain size={size} className="text-blue-400" />;
        case 'snowy': return <CloudSnow size={size} className="text-sky-300" />;
        case 'hailing': return <CloudLightning size={size} className="text-indigo-400" />;
        default: return <Sun size={size} className="text-amber-500" />;
    }
}

/** 根据风速和温度估算续航折损百分比 */
function calcRangeLoss(windSpeed: number, temperature: number): number {
    // 风速惩罚：每 1m/s 约增加 0.7% 损耗
    const windPenalty = windSpeed * 0.7;
    // 温度惩罚：偏离 25°C 越远损耗越大（低温损耗更严重）
    const tempDelta = Math.abs(temperature - 25);
    const tempPenalty = temperature < 10 ? tempDelta * 0.4 : tempDelta * 0.15;
    return Math.min(windPenalty + tempPenalty, 50);
}

const EnvironmentMonitor = memo(function EnvironmentMonitor() {
    const { weather, temperature, windSpeed } = useEnvironment();
    const rangeLoss = calcRangeLoss(windSpeed, temperature);

    return (
        <div className="pointer-events-auto bg-white/40 backdrop-blur-xl border border-white/60 px-6 py-5 rounded-2xl shadow-lg flex flex-col gap-4 overflow-hidden relative w-fit min-w-[300px]">
            <div className="absolute inset-0 bg-gradient-to-bl from-slate-900/10 to-transparent pointer-events-none"></div>

            <div className="relative z-10 w-full">
                <div className="flex justify-between items-center mb-0.5">
                    <h2 className="text-lg font-black tracking-tight text-slate-800 flex items-center gap-1.5">
                        气象与能耗
                    </h2>
                    <div className="flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 shadow-sm ml-4">
                        <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
                        <span className="text-[9px] text-sky-700 font-bold tracking-widest uppercase">Active</span>
                    </div>
                </div>
                <p className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">
                    环境监控
                </p>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-slate-300 via-slate-200 to-transparent relative z-10"></div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-5 relative z-10 w-full">
                {/* 天气 */}
                <div className="flex flex-col gap-1 group">
                    <span className="text-slate-600 text-[10px] font-bold flex items-center gap-1.5 tracking-wide uppercase">
                        <WeatherIcon type={weather} size={14} /> 天气
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5 leading-none">
                        <span className="text-slate-900 text-2xl font-black tracking-tight drop-shadow-sm">{WEATHER_LABEL[weather] || '晴天'}</span>
                    </div>
                </div>

                {/* 温度 */}
                <div className="flex flex-col gap-1 group">
                    <span className="text-slate-600 text-[10px] font-bold flex items-center gap-1.5 tracking-wide uppercase">
                        <Thermometer size={14} className="text-rose-500" /> 温度
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5 leading-none">
                        <span className="text-slate-900 text-2xl font-black tracking-tight drop-shadow-sm">{temperature}</span>
                        <span className="text-slate-500 text-xs font-bold">°C</span>
                    </div>
                </div>

                {/* 风速 */}
                <div className="flex flex-col gap-1 group">
                    <span className="text-slate-600 text-[10px] font-bold flex items-center gap-1.5 tracking-wide uppercase">
                        <Wind size={14} className="text-teal-600" /> 风速
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5 leading-none">
                        <span className="text-slate-900 text-2xl font-black tracking-tight drop-shadow-sm">{windSpeed.toFixed(1)}</span>
                        <span className="text-slate-500 text-xs font-bold">m/s</span>
                    </div>
                </div>

                {/* 续航折损 */}
                <div className="flex flex-col gap-1 group">
                    <span className="text-slate-600 text-[10px] font-bold flex items-center gap-1.5 tracking-wide uppercase">
                        <Activity size={14} className="text-amber-500" /> 续航折损
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5 leading-none">
                        <span className="text-slate-900 text-2xl font-black tracking-tight drop-shadow-sm">-{rangeLoss.toFixed(1)}</span>
                        <span className="text-slate-500 text-xs font-bold">%</span>
                    </div>
                </div>
            </div>
        </div>
    );
});// 【性能优化 P2-F】memo 包裹 EnvironmentMonitor，配合 P0-B Context value 稳定化
const DashboardOverlay = memo(function DashboardOverlay({ onOpenAnalytics, onOpenTasks, onToggleSandbox, isSandboxMode, currentCity = 'shenzhen', isRightPanelOpen, onToggleRightPanel }: Props) {
    const navigate = useNavigate();
    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 p-6 font-sans">
            <RightControlPanel isOpen={isRightPanelOpen} onToggle={onToggleRightPanel} />

            {/* Top Right Environment Monitor */}
            <div className={`absolute top-6 z-[60] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isRightPanelOpen ? 'right-[384px]' : 'right-6'}`}>
                <EnvironmentMonitor />
            </div>

            {/* Top Left Action Buttons */}
            <div className="absolute top-16 left-6 pointer-events-auto z-10 flex flex-col gap-3">
                <button
                    onClick={onOpenAnalytics}
                    className="flex items-center justify-center gap-3 px-6 py-3 bg-white/40 backdrop-blur-xl border border-white/60 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 to-transparent pointer-events-none"></div>
                    <BarChart3 size={20} className="text-indigo-700 relative z-10" />
                    <span className="text-base font-black tracking-tight text-slate-800 relative z-10">
                        全局统计态势
                    </span>
                </button>
                <button
                    onClick={onOpenTasks}
                    className="flex items-center justify-center gap-3 px-6 py-3 bg-white/40 backdrop-blur-xl border border-white/60 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/5 to-transparent pointer-events-none"></div>
                    <ListChecks size={20} className="text-indigo-700 relative z-10" />
                    <span className="text-base font-black tracking-tight text-slate-800 relative z-10">
                        任务调度中心
                    </span>
                </button>
                <button
                    onClick={onToggleSandbox}
                    className={`flex items-center justify-center gap-3 px-6 py-3 backdrop-blur-xl border rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden relative ${isSandboxMode ? 'bg-indigo-600/90 border-indigo-400/50' : 'bg-white/40 border-white/60'
                        }`}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/5 to-transparent pointer-events-none"></div>
                    <Target size={20} className={`relative z-10 ${isSandboxMode ? 'text-white' : 'text-indigo-700'}`} />
                    <span className={`text-base font-black tracking-tight relative z-10 ${isSandboxMode ? 'text-white' : 'text-slate-800'}`}>
                        基建 ROI 沙盘
                    </span>
                </button>
                {/* 数据分析页入口 */}
                <button
                    onClick={() => navigate('/analytics')}
                    className="flex items-center justify-center gap-3 px-6 py-3 bg-white/40 backdrop-blur-xl border border-white/60 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-900/5 to-transparent pointer-events-none"></div>
                    <PieChart size={20} className="text-violet-700 relative z-10" />
                    <span className="text-base font-black tracking-tight text-slate-800 relative z-10">
                        数据深度分析
                    </span>
                </button>
            </div>

            {/* Left Bottom Panel */}
            <div className="absolute bottom-10 left-6 pointer-events-auto bg-white/40 backdrop-blur-xl border border-white/60 px-7 py-6 rounded-2xl shadow-lg min-w-[360px] flex flex-col gap-6 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-1">
                        <h1 className="text-xl font-black tracking-tight text-slate-800">
                            城市低空物流网络
                        </h1>
                        <div className="flex items-center gap-2 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                            <span className="text-[10px] text-emerald-700 font-bold tracking-widest uppercase">Online</span>
                        </div>
                    </div>
                    <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mt-1">
                        {CITY_CONTROL_CENTER_MAP[currentCity] || '运营控制中心'}
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
});

export default DashboardOverlay;
