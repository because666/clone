/**
 * 地图骨架屏组件
 * 在数据加载完成前显示占位内容，提升感知速度
 */

import React from 'react';
import { MapPin, Building2, Navigation, Zap } from 'lucide-react';

interface MapSkeletonProps {
    loadingSteps: Array<{ id: string; label: string; status: 'pending' | 'loading' | 'completed' | 'error' }>;
}

/**
 * 地图骨架屏组件
 * @param loadingSteps - 加载步骤列表
 */
export const MapSkeleton: React.FC<MapSkeletonProps> = ({ loadingSteps }) => {
    // 获取各步骤状态
    const buildingsStatus = loadingSteps.find(s => s.id === 'buildings')?.status || 'pending';
    const poiDemandStatus = loadingSteps.find(s => s.id === 'poi_demand')?.status || 'pending';
    const poiSensitiveStatus = loadingSteps.find(s => s.id === 'poi_sensitive')?.status || 'pending';
    const trajectoriesStatus = loadingSteps.find(s => s.id === 'trajectories')?.status || 'pending';
    const energyStatus = loadingSteps.find(s => s.id === 'energy')?.status || 'pending';

    // 计算整体进度
    const completedCount = loadingSteps.filter(s => s.status === 'completed').length;
    const progress = Math.round((completedCount / loadingSteps.length) * 100);

    return (
        <div className="absolute inset-0 z-5 bg-gradient-to-br from-slate-100 to-slate-200">
            {/* 网格背景 */}
            <div 
                className="absolute inset-0 opacity-30"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, #cbd5e1 1px, transparent 1px),
                        linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)
                    `,
                    backgroundSize: '50px 50px'
                }}
            />

            {/* 中心加载指示器 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                {/* 加载动画圆圈 */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                    {/* 外圈旋转 */}
                    <div className="absolute inset-0 rounded-full border-4 border-slate-300 border-t-cyan-500 animate-spin" />
                    {/* 内圈脉冲 */}
                    <div className="absolute inset-4 rounded-full bg-cyan-500/20 animate-pulse" />
                    {/* 中心图标 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <MapPin className="w-8 h-8 text-cyan-600" />
                    </div>
                </div>

                {/* 加载文字 */}
                <h3 className="text-slate-700 text-lg font-medium mb-2">正在加载地图数据</h3>
                <p className="text-slate-500 text-sm mb-4">{progress}% 已完成</p>

                {/* 进度条 */}
                <div className="w-64 h-2 bg-slate-300 rounded-full overflow-hidden mx-auto">
                    <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* 图层加载状态指示器 - 左下角 */}
            <div className="absolute bottom-24 left-4 bg-white/90 backdrop-blur rounded-xl p-4 shadow-lg border border-slate-200/50">
                <h4 className="text-slate-700 text-xs font-medium mb-3 uppercase tracking-wider">图层加载状态</h4>
                <div className="space-y-2">
                    {/* 建筑数据 */}
                    <div className="flex items-center gap-2">
                        <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                            ${buildingsStatus === 'completed' ? 'bg-emerald-100' : 
                              buildingsStatus === 'loading' ? 'bg-cyan-100 animate-pulse' : 'bg-slate-100'}
                        `}>
                            <Building2 className={`w-3.5 h-3.5 ${
                                buildingsStatus === 'completed' ? 'text-emerald-600' :
                                buildingsStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                            }`} />
                        </div>
                        <span className={`text-xs ${
                            buildingsStatus === 'completed' ? 'text-emerald-600' :
                            buildingsStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                        }`}>
                            建筑数据
                        </span>
                        {buildingsStatus === 'completed' && <span className="text-emerald-500 text-xs ml-auto">✓</span>}
                        {buildingsStatus === 'loading' && <span className="text-cyan-500 text-xs ml-auto animate-pulse">...</span>}
                    </div>

                    {/* POI 数据 */}
                    <div className="flex items-center gap-2">
                        <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                            ${poiDemandStatus === 'completed' && poiSensitiveStatus === 'completed' ? 'bg-emerald-100' : 
                              poiDemandStatus === 'loading' || poiSensitiveStatus === 'loading' ? 'bg-cyan-100 animate-pulse' : 'bg-slate-100'}
                        `}>
                            <MapPin className={`w-3.5 h-3.5 ${
                                poiDemandStatus === 'completed' && poiSensitiveStatus === 'completed' ? 'text-emerald-600' :
                                poiDemandStatus === 'loading' || poiSensitiveStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                            }`} />
                        </div>
                        <span className={`text-xs ${
                            poiDemandStatus === 'completed' && poiSensitiveStatus === 'completed' ? 'text-emerald-600' :
                            poiDemandStatus === 'loading' || poiSensitiveStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                        }`}>
                            POI 数据
                        </span>
                        {poiDemandStatus === 'completed' && poiSensitiveStatus === 'completed' && 
                            <span className="text-emerald-500 text-xs ml-auto">✓</span>}
                        {(poiDemandStatus === 'loading' || poiSensitiveStatus === 'loading') && 
                            <span className="text-cyan-500 text-xs ml-auto animate-pulse">...</span>}
                    </div>

                    {/* 轨迹数据 */}
                    <div className="flex items-center gap-2">
                        <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                            ${trajectoriesStatus === 'completed' ? 'bg-emerald-100' : 
                              trajectoriesStatus === 'loading' ? 'bg-cyan-100 animate-pulse' : 'bg-slate-100'}
                        `}>
                            <Navigation className={`w-3.5 h-3.5 ${
                                trajectoriesStatus === 'completed' ? 'text-emerald-600' :
                                trajectoriesStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                            }`} />
                        </div>
                        <span className={`text-xs ${
                            trajectoriesStatus === 'completed' ? 'text-emerald-600' :
                            trajectoriesStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                        }`}>
                            轨迹数据
                        </span>
                        {trajectoriesStatus === 'completed' && <span className="text-emerald-500 text-xs ml-auto">✓</span>}
                        {trajectoriesStatus === 'loading' && <span className="text-cyan-500 text-xs ml-auto animate-pulse">...</span>}
                    </div>

                    {/* 能耗数据 */}
                    <div className="flex items-center gap-2">
                        <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                            ${energyStatus === 'completed' ? 'bg-emerald-100' : 
                              energyStatus === 'loading' ? 'bg-cyan-100 animate-pulse' : 'bg-slate-100'}
                        `}>
                            <Zap className={`w-3.5 h-3.5 ${
                                energyStatus === 'completed' ? 'text-emerald-600' :
                                energyStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                            }`} />
                        </div>
                        <span className={`text-xs ${
                            energyStatus === 'completed' ? 'text-emerald-600' :
                            energyStatus === 'loading' ? 'text-cyan-600' : 'text-slate-400'
                        }`}>
                            能耗数据
                        </span>
                        {energyStatus === 'completed' && <span className="text-emerald-500 text-xs ml-auto">✓</span>}
                        {energyStatus === 'loading' && <span className="text-cyan-500 text-xs ml-auto animate-pulse">...</span>}
                    </div>
                </div>
            </div>

            {/* 装饰性元素 - 模拟地图标记 */}
            <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-cyan-400/30 rounded-full animate-ping" />
            <div className="absolute top-1/3 right-1/3 w-2 h-2 bg-emerald-400/30 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
            <div className="absolute bottom-1/3 left-1/3 w-2.5 h-2.5 bg-blue-400/30 rounded-full animate-ping" style={{ animationDelay: '1s' }} />
        </div>
    );
};

export default MapSkeleton;
