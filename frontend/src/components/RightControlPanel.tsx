import { useState, memo, type ReactNode } from 'react';
import { 
  Activity, ShieldAlert, Zap, Wind, Sun, Cloud, CloudRain, 
  CloudSnow, CloudLightning, BatteryWarning, AlertTriangle
} from 'lucide-react';
import { useEnvironment } from '../contexts/EnvironmentContext';
import type { WeatherType } from '../contexts/EnvironmentContext';
import { useAlerts } from './AlertNotificationProvider';

const WEATHER_OPTIONS: { type: WeatherType; icon: ReactNode; label: string }[] = [
    { type: 'sunny', icon: <Sun size={14} />, label: '晴天' },
    { type: 'cloudy', icon: <Cloud size={14} />, label: '多云' },
    { type: 'rainy', icon: <CloudRain size={14} />, label: '小雨' },
    { type: 'snowy', icon: <CloudSnow size={14} />, label: '降雪' },
    { type: 'hailing', icon: <CloudLightning size={14} />, label: '冰雹' },
];
// 【性能优化 P1-D】memo 包裹，避免 DashboardOverlay 父组件 re-render 时无条件重建
const RightControlPanel = memo(function RightControlPanel() {
    const { windSpeed, setWindSpeed, weather, setWeather, temperature, setTemperature } = useEnvironment();
    const { alerts, totalCounts } = useAlerts();
    const [isCollapsed, setIsCollapsed] = useState(true);

    const getWeatherIcon = () => {
        switch (weather) {
            case 'sunny': return <Sun size={20} className="text-amber-500" />;
            case 'cloudy': return <Cloud size={20} className="text-slate-400" />;
            case 'rainy': return <CloudRain size={20} className="text-blue-400" />;
            case 'snowy': return <CloudSnow size={20} className="text-sky-200" />;
            case 'hailing': return <CloudLightning size={20} className="text-indigo-400" />;
            default: return <Sun size={20} className="text-amber-500" />;
        }
    };

    const getWeatherLabel = () => WEATHER_OPTIONS.find(o => o.type === weather)?.label || '清晰';

    const sidePanelOffset = isCollapsed ? 'translate-x-[calc(100%-12px)]' : 'translate-x-0 opacity-100';

    return (
        <div className={`fixed top-0 right-0 h-full w-[360px] z-20 pointer-events-none transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidePanelOffset}`}>
            
            {/* 隐藏/显示触发拉手 */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute left-[-26px] top-1/2 -translate-y-1/2 w-10 h-24 bg-indigo-600/80 backdrop-blur-3xl border border-white/40 rounded-l-2xl pointer-events-auto flex items-center justify-center text-white hover:bg-indigo-500 transition-all group shadow-[-8px_0_24px_rgba(99,102,241,0.3)]"
                title={isCollapsed ? "展开面板" : "隐藏面板"}
            >
                <div className={`flex flex-col items-center gap-1 transition-transform duration-500 ${isCollapsed ? 'rotate-180' : ''}`}>
                    <Activity size={16} className="opacity-100" />
                    <div className="w-1 h-8 bg-white/30 rounded-full" />
                </div>
            </button>

            <div className="h-full flex flex-col bg-white/40 backdrop-blur-2xl border-l border-white/50 shadow-[-8px_0_32px_0_rgba(31,38,135,0.15)] pointer-events-auto overflow-hidden">
                
                {/* 1. 顶部状态区域 */}
                <header className="px-6 pt-5 pb-4 border-b border-slate-200/50">
                    <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">当前环境态势</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/50 rounded-xl p-2 border border-white/80 shadow-sm flex flex-col items-center gap-0.5">
                            {getWeatherIcon()}
                            <span className="text-[8px] font-bold text-slate-500 uppercase">{getWeatherLabel()}</span>
                            <span className="text-xs font-black text-slate-800">{temperature}°C</span>
                        </div>
                        <div className="bg-white/50 rounded-xl p-2 border border-white/80 shadow-sm flex flex-col items-center gap-0.5">
                            <Wind size={18} className="text-sky-500" />
                            <span className="text-[8px] font-bold text-slate-500 uppercase">风速</span>
                            <span className="text-xs font-black text-slate-800">{windSpeed.toFixed(1)}</span>
                        </div>
                        <div className="bg-white/50 rounded-xl p-2 border border-white/80 shadow-sm flex flex-col items-center gap-0.5">
                            <Zap size={18} className="text-emerald-500" />
                            <span className="text-[8px] font-bold text-slate-500 uppercase">延迟</span>
                            <span className="text-xs font-black text-slate-800">9ms</span>
                        </div>
                    </div>
                </header>

                {/* 2. 环境调节区域 */}
                <section className="px-6 py-4 border-b border-slate-200/50 scrollbar-hide">
                    <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">环境调节</h2>
                    
                    <div className="space-y-4">
                        {/* 风速调节 */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[11px] font-bold text-slate-600">风速控制 (m/s)</label>
                                <span className="text-[11px] font-black text-indigo-600 tabular-nums">{windSpeed.toFixed(1)}</span>
                            </div>
                            <input
                                type="range" min={0} max={20} step={0.5} value={windSpeed}
                                onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-slate-200"
                                style={{ accentColor: '#6366f1' }}
                            />
                        </div>

                        {/* 气温调节 */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[11px] font-bold text-slate-600">气温调节 (°C)</label>
                                <span className="text-[11px] font-black text-rose-500 tabular-nums">{temperature}</span>
                            </div>
                            <input
                                type="range" min={-20} max={50} step={1} value={temperature}
                                onChange={(e) => setTemperature(parseInt(e.target.value))}
                                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-slate-200"
                                style={{ accentColor: '#f43f5e' }}
                            />
                        </div>

                        {/* 天气切换 */}
                        <div>
                            <label className="text-[11px] font-bold text-slate-600 mb-2 block">气象模拟</label>
                            <div className="flex gap-1.5">
                                {WEATHER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.type}
                                        onClick={() => setWeather(opt.type)}
                                        className={`flex-1 aspect-square rounded-lg flex items-center justify-center transition-all duration-300 border ${
                                            weather === opt.type 
                                            ? 'bg-indigo-500 border-indigo-400 text-white shadow-sm' 
                                            : 'bg-white/60 border-white/80 text-slate-500 hover:bg-white/90'
                                        }`}
                                        title={opt.label}
                                    >
                                        {opt.icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3. 安全事件预警 */}
                <section className="flex-1 px-6 pt-4 flex flex-col min-h-0">
                    <div className="mb-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">安全事件预警</h2>
                             {alerts.length > 0 && (
                                <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full animate-bounce">
                                    {alerts.length}条新预警
                                </span>
                             )}
                        </div>
                        <div className="flex items-center gap-2 bg-white/50 px-2 py-0.5 rounded-full border border-white/80 shadow-xs">
                             <BatteryWarning size={10} className="text-rose-600" />
                             <span className="text-[9px] font-black text-rose-700">{totalCounts['low-battery']}</span>
                             <div className="w-px h-2 bg-slate-300"></div>
                             <ShieldAlert size={10} className="text-amber-600" />
                             <span className="text-[9px] font-black text-amber-700">{totalCounts['danger-zone']}</span>
                             <div className="w-px h-2 bg-slate-300"></div>
                             <AlertTriangle size={10} className="text-orange-600" />
                             <span className="text-[9px] font-black text-orange-700">{totalCounts['conflict']}</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 mb-8 scrollbar-hide">
                        {alerts.length === 0 ? (
                            <div className="h-32 flex flex-col items-center justify-center gap-2 opacity-40">
                                <Activity size={24} className="text-slate-400" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">系统状态正常 · 实时监测中</span>
                            </div>
                        ) : (
                            alerts.map((alert, idx) => (
                                <div 
                                    key={alert.id}
                                    className="relative bg-white/60 border border-white/80 rounded-xl p-3 group animate-[alertSlideIn_0.3s_ease-out]"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${alert.type === 'low-battery' ? 'bg-rose-500' : alert.type === 'conflict' ? 'bg-orange-500' : 'bg-amber-500'}`}></div>
                                    <div className="flex justify-between items-start mb-1 pl-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow-sm ${alert.type === 'low-battery' ? 'text-rose-700 bg-rose-50' : alert.type === 'conflict' ? 'text-orange-700 bg-orange-50' : 'text-amber-700 bg-amber-50'}`}>
                                                {alert.type === 'low-battery' ? '电量警告' : alert.type === 'conflict' ? '空域冲突' : '危险区域'}
                                            </span>
                                        </div>
                                        <span className="text-[8px] text-slate-400 font-bold tabular-nums">
                                            {new Date(alert.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-700 font-bold pl-1 leading-tight">
                                        <span className="text-slate-400 font-medium mr-1">#{alert.flightId.split('_').pop()}</span>
                                        {alert.message.split('} ').pop()}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
});

export default RightControlPanel;
