import React from 'react';
import FlightVolumeChart from './charts/FlightVolumeChart';
import EnergyConsumptionChart from './charts/EnergyConsumptionChart';
import PayloadDistributionChart from './charts/PayloadDistributionChart';

interface AnalyticsPanelProps {
    trajectories: any[];
    energyData: any;
    currentTimeRef?: React.MutableRefObject<number>; // Optional
    isVisible: boolean;
    onClose: () => void;
}

const PANEL_SHADOW = { textShadow: '0 1px 3px rgba(255,255,255,0.9)' };

export default function AnalyticsPanel({
    trajectories,
    energyData,
    isVisible,
    onClose
}: AnalyticsPanelProps) {
    if (!isVisible) return null;

    return (
        <div className="absolute top-16 left-6 z-40 w-[960px] max-w-[calc(100vw-380px)] bg-white/30 backdrop-blur-3xl border border-white/40 px-6 py-5 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] text-slate-800 pointer-events-auto transition-all animate-in fade-in slide-in-from-left-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/5 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/30">
                    <h3 className="text-lg font-black text-slate-800 tracking-wider flex items-center gap-3" style={PANEL_SHADOW}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                            <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                        全局运行态势分析
                    </h3>
                    
                    <div className="flex items-center gap-5">
                        {/* 指标卡片 */}
                        <div className="flex gap-3">
                            <div className="bg-white/40 backdrop-blur-md rounded-2xl px-4 py-2 border border-white/60 shadow-sm flex items-center gap-3 relative overflow-hidden">
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest relative z-10">全局计划航班</span>
                                <span className="text-2xl font-black text-indigo-700 relative z-10 drop-shadow-sm">{trajectories.length}<span className="text-xs text-slate-500 ml-1 font-bold">架次</span></span>
                            </div>
                            <div className="bg-white/40 backdrop-blur-md rounded-2xl px-4 py-2 border border-white/60 shadow-sm flex items-center gap-3 relative overflow-hidden">
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest relative z-10">当前运行负荷</span>
                                <span className="text-2xl font-black text-indigo-600 relative z-10 drop-shadow-sm">
                                    {Object.keys(energyData || {}).length > 0 ? Math.min(100, (trajectories.length / Math.max(trajectories.length, 500)) * 100).toFixed(1) : '0.0'}%
                                </span>
                            </div>
                        </div>

                        <div className="h-6 w-px bg-slate-300/50 mx-1"></div>

                        <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition-colors bg-white/40 backdrop-blur p-2 rounded-full hover:bg-white/70 shadow border border-white/60">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-5">
                    {/* 图表 1 */}
                    <div className="bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/60 shadow-sm relative z-10">
                        <FlightVolumeChart trajectories={trajectories} />
                    </div>

                    {/* 图表 2 */}
                    <div className="bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/60 shadow-sm relative z-10">
                        <EnergyConsumptionChart energyData={energyData} />
                    </div>

                    {/* 图表 3 */}
                    <div className="bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/60 shadow-sm relative z-10">
                        <PayloadDistributionChart energyData={energyData} />
                    </div>
                </div>
            </div>
        </div>
    );
}
