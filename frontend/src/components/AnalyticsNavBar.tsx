import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Map, LogOut, ChevronDown, Info } from 'lucide-react';
import { CITIES } from '../constants/map';
import { useState } from 'react';

interface Props {
    currentCity: string;
    onCityChange: (city: string) => void;
}

/**
 * 全局导航条 —— 用于 Dashboard ↔ Analytics 页面切换
 * 磨砂玻璃风格，与项目整体设计语言一致
 */
export default function AnalyticsNavBar({ currentCity, onCityChange }: Props) {
    const navigate = useNavigate();
    const location = useLocation();
    const [cityOpen, setCityOpen] = useState(false);

    const isAnalytics = location.pathname === '/analytics';
    const isDashboard = location.pathname === '/dashboard';

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const currentCityLabel = CITIES.find(c => c.id === currentCity)?.label || '深圳 · 南山';

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-white/30 backdrop-blur-2xl border-b border-white/40 shadow-[0_4px_24px_rgba(31,38,135,0.08)] flex items-center justify-between px-6">
            {/* 左侧：Logo + 系统名称 */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-md">
                    <span className="text-white text-xs font-black">AW</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-black text-slate-800 tracking-tight leading-none">苍穹织网</span>
                    <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase">AetherWeave</span>
                </div>
            </div>

            {/* 中间：Tab 切换 */}
            <div className="flex items-center gap-1 bg-white/40 rounded-xl p-1 border border-white/60 shadow-sm">
                <button
                    onClick={() => navigate('/dashboard')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                        isDashboard
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 hover:bg-white/60'
                    }`}
                >
                    <Map size={14} />
                    监控大屏
                </button>
                <button
                    onClick={() => navigate('/analytics')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                        isAnalytics
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 hover:bg-white/60'
                    }`}
                >
                    <BarChart3 size={14} />
                    数据分析
                </button>
                <button
                    onClick={() => navigate('/about')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                        location.pathname === '/about'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 hover:bg-white/60'
                    }`}
                >
                    <Info size={14} />
                    技术路径
                </button>
            </div>

            {/* 右侧：城市选择 + 退出 */}
            <div className="flex items-center gap-3">
                {/* 城市选择下拉 */}
                <div className="relative">
                    <button
                        onClick={() => setCityOpen(!cityOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/50 rounded-xl border border-white/60 shadow-sm text-xs font-bold text-slate-700 hover:bg-white/80 transition-all"
                    >
                        {currentCityLabel}
                        <ChevronDown size={12} className={`transition-transform ${cityOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {cityOpen && (
                        <div className="absolute top-full right-0 mt-2 w-44 bg-white/80 backdrop-blur-2xl rounded-xl border border-white/60 shadow-lg overflow-hidden z-50">
                            {CITIES.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { onCityChange(c.id); setCityOpen(false); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${
                                        c.id === currentCity
                                            ? 'bg-indigo-50 text-indigo-700'
                                            : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/40 rounded-xl border border-white/60 shadow-sm text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50/50 transition-all"
                >
                    <LogOut size={12} />
                    退出
                </button>
            </div>
        </nav>
    );
}
