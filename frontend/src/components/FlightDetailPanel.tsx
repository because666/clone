import { useMemo } from 'react';
import { useWindSpeed } from '../contexts/WindSpeedContext';
import { calcWindFactor, binarySearchTimestamp } from '../utils/physics';

interface FlightDetailPanelProps {
    selectedFlight: any;
    energyData: any;
    currentTimeRef: React.MutableRefObject<number>;
    setSelectedFlight: (flight: any) => void;
}

export default function FlightDetailPanel({
    selectedFlight,
    energyData,
    currentTimeRef,
    setSelectedFlight
}: FlightDetailPanelProps) {
    const { windSpeed } = useWindSpeed();

    // 【性能优化 P0-4】预计降落电量缓存：对同一架无人机的 battery 数组只遍历一次
    // 使用 for 循环替代 filter() + Math.min(...spread)，消除每帧 GC 压力和大数组 stack overflow 风险
    const rawMinBat = useMemo(() => {
        if (!selectedFlight || !energyData) return 0;
        const ed = energyData[selectedFlight.id];
        if (!ed?.battery?.length) return 0;
        const bat = ed.battery;
        let min = Infinity;
        for (let i = 0; i < bat.length; i++) {
            const b = bat[i];
            if (b > 0 && b < min) min = b;
        }
        return min === Infinity ? 0 : min;
    }, [selectedFlight?.id, energyData]);

    if (!selectedFlight) return null;

    const windFactor = calcWindFactor(windSpeed);

    return (
        <div className="absolute top-28 left-8 z-30 w-80 bg-white/40 backdrop-blur-2xl border border-white/50 rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] text-slate-800 p-6 pointer-events-auto transition-all animate-in fade-in slide-in-from-left-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 to-transparent pointer-events-none"></div>
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-300/50">
                    <h3 className="text-sm font-black text-slate-700 tracking-wider flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                        </svg>
                        无人机档案: {selectedFlight.id}
                    </h3>
                    <button onClick={() => setSelectedFlight(null)} className="text-slate-400 hover:text-slate-600 transition-colors bg-white/50 p-1 rounded-full">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                {energyData && energyData[selectedFlight.id] ? (() => {
                    const ed = energyData[selectedFlight.id];
                    const timestamps = selectedFlight.timestamps;
                    // 【性能优化】使用 O(logN) 二分搜索替代 O(N) findIndex
                    let idx = binarySearchTimestamp(timestamps, currentTimeRef.current);
                    if (idx < 0) idx = 0;

                    // 原始数据
                    const rawBat = ed.battery[idx];
                    const rawPwr = ed.power[idx];
                    const startBat = ed.battery[0];

                    // 风速修正：消耗量 = (startBat - rawBat)，乘以 windFactor
                    const adjustedBat = Math.max(0, startBat - (startBat - rawBat) * windFactor);
                    const adjustedPwr = rawPwr * windFactor;

                    const adjustedMinBat = Math.max(0, startBat - (startBat - rawMinBat) * windFactor);

                    return (
                        <div className="flex flex-col gap-3.5 text-sm">
                            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-white/80 shadow-sm">
                                <span className="text-slate-600 font-bold tracking-wide text-xs">当前负荷功率</span>
                                <span className="font-mono text-indigo-700 font-black tracking-wider">{adjustedPwr.toFixed(1)} W</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-white/80 shadow-sm">
                                <span className="text-slate-600 font-bold tracking-wide text-xs">出发时电量</span>
                                <span className="font-mono font-black tracking-wider text-emerald-600">
                                    {startBat.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-white/80 shadow-sm">
                                <span className="text-slate-600 font-bold tracking-wide text-xs">实时流失电量</span>
                                <span className="font-mono font-black tracking-wider" style={{ color: adjustedBat < 30 ? '#e11d48' : adjustedBat < 60 ? '#d97706' : '#059669' }}>
                                    {adjustedBat.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-white/80 shadow-sm">
                                <span className="text-slate-600 font-bold tracking-wide text-xs">预计降落电量</span>
                                <span className="font-mono font-black tracking-wider" style={{ color: adjustedMinBat < 30 ? '#e11d48' : adjustedMinBat < 60 ? '#d97706' : '#059669' }}>
                                    {adjustedMinBat.toFixed(1)}%
                                </span>
                            </div>
                            {/* 风速影响因子提示 */}
                            {windFactor > 1.01 && (
                                <div className="flex justify-between items-center bg-sky-50/60 p-3 rounded-xl border border-sky-200/60 shadow-sm">
                                    <span className="text-sky-700 font-bold tracking-wide text-xs">风速影响因子</span>
                                    <span className="font-mono text-sky-700 font-black tracking-wider">×{windFactor.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-white/80 shadow-sm">
                                <span className="text-slate-600 font-bold tracking-wide text-xs">载重状态</span>
                                <span className="font-mono text-slate-700 font-black tracking-wider bg-slate-200/50 px-2 py-0.5 rounded shadow-inner">{ed.payload} kg</span>
                            </div>
                        </div>
                    );
                })() : (
                    <div className="py-6 text-center text-slate-500 font-bold animate-pulse border border-dashed border-slate-300 rounded-xl bg-white/30">
                        正在接入AirLab能耗模型计算...
                    </div>
                )}
            </div>
        </div>
    );
}
