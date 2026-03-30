import { memo } from 'react';
import { Target, Layers, TrendingUp, Package, X, Loader2, DollarSign, Clock } from 'lucide-react';

interface RoiData {
  covered_pois: number;
  commercial_pois: number;
  avg_dist_reduction_pct: number;
  est_daily_orders: number;
  est_capex_w: number;
  est_payback_years: number;
  radius_m: number;
}

interface Props {
  data: RoiData[];
  isLoading: boolean;
  error: string | null;
  radius: number;
  isCompareMode: boolean;
  isRightPanelOpen?: boolean;
  onToggleCompareMode: (val: boolean) => void;
  onRadiusChange: (r: number) => void;
  onClose: () => void;
}

export default memo(function RoiSandboxCard({ data, isLoading, error, radius, isCompareMode, isRightPanelOpen, onToggleCompareMode, onRadiusChange, onClose }: Props) {
  const isComparing = data && data.length > 1;
  const cardWidth = isComparing ? 'w-[36rem]' : 'w-[24rem]';

  // 用于比较胜负
  const bestPayback = isComparing ? Math.min(data[0].est_payback_years, data[1].est_payback_years) : -1;

  return (
    <div className={`absolute ${isRightPanelOpen ? 'right-[384px]' : 'right-6'} top-[280px] ${cardWidth} bg-white/75 backdrop-blur-2xl border border-white/90 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-slate-900/5 overflow-hidden flex flex-col pointer-events-auto z-[60] animate-in fade-in duration-500 transition-all`}>
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/5 to-transparent pointer-events-none"></div>
      
      {/* Header */}
      <div className="relative px-6 py-4 border-b border-white/40 flex justify-between items-center bg-white/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-200">
            <Target size={16} />
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black tracking-wide text-slate-800 uppercase">
              基建 ROI 沙盘
            </h2>
            <div className="flex bg-slate-200/50 p-1 rounded-lg border border-slate-300/30">
              <button onClick={() => onToggleCompareMode(false)} className={`px-4 py-1.5 text-sm font-bold rounded shadow-sm transition-all ${!isCompareMode ? 'bg-white text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>单点分析</button>
              <button onClick={() => onToggleCompareMode(true)} className={`px-4 py-1.5 text-sm font-bold rounded shadow-sm transition-all ${isCompareMode ? 'bg-white text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}>A/B对比</button>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="relative p-6 flex flex-col gap-5">
        
        {/* Radius Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-base font-bold text-slate-500 uppercase tracking-wider">辐射半径 (km)</span>
          <div className="flex bg-slate-200/50 p-1 rounded-xl shadow-inner border border-slate-300/30">
            {[1000, 3000, 5000].map((r) => (
              <button
                key={r}
                onClick={() => onRadiusChange(r)}
                className={`flex-1 text-base font-bold py-2 rounded-lg transition-all ${
                  radius === r 
                    ? 'bg-white text-indigo-600 shadow-sm border-white/80' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
                }`}
              >
                {r / 1000} km
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 size={28} className="text-indigo-500 animate-spin" />
            <span className="text-xs font-bold text-slate-500 animate-pulse">正在推演空间经济模型...</span>
          </div>
        ) : error ? (
          <div className="py-6 px-4 bg-rose-50 border border-rose-100 rounded-xl text-center">
            <p className="text-xs text-rose-600 font-medium">{error}</p>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-8 px-4 border border-dashed border-slate-300 rounded-xl text-center flex flex-col items-center gap-3 bg-slate-50/50">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Target size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500 leading-relaxed">
              请点击地图侧任意区域进行选址推演<br/>
              <span className="text-xs text-slate-400">({isCompareMode ? '即将进入双点对比模式' : '当前为单点模式'})</span>
            </p>
          </div>
        ) : (
          <div className={`grid gap-4 animate-in fade-in zoom-in-95 duration-300 ${isComparing ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {data.map((item, idx) => {
              const theme = idx === 0 
                ? { label: '站点 A', text: 'text-blue-700', border: 'border-blue-200', bg: 'bg-blue-50/60' }
                : { label: '站点 B', text: 'text-amber-700', border: 'border-amber-200', bg: 'bg-amber-50/60' };
              
              const isBest = isComparing && item.est_payback_years === bestPayback;

              return (
                <div key={idx} className={`flex flex-col gap-3 p-4 rounded-2xl border ${theme.border} ${theme.bg} relative overflow-hidden transition-all shadow-sm hover:shadow-md`}>
                  {/* Title */}
                  <div className="flex items-center justify-between pb-2 border-b border-black/5">
                     <span className={`text-base font-black ${theme.text}`}>{theme.label}</span>
                     {isBest && <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded ring-1 ring-emerald-200">最佳投资</span>}
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers size={16} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-600">规模覆盖</span>
                    </div>
                    <span className="text-lg font-black text-slate-700">{item.covered_pois} <span className="text-xs text-slate-400 font-normal">POI</span></span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-600">效率提升</span>
                    </div>
                    <span className="text-lg font-black text-emerald-600">+{item.avg_dist_reduction_pct}%</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Package size={16} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-600">日均架次</span>
                    </div>
                    <span className="text-lg font-black text-orange-600">{item.est_daily_orders}</span>
                  </div>

                  {/* Financial Divider */}
                  <div className="h-px bg-gradient-to-r from-transparent via-slate-300/50 to-transparent my-1"></div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DollarSign size={16} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-600">初期造价</span>
                    </div>
                    <span className="text-lg font-black text-rose-600">{item.est_capex_w} <span className="text-xs font-normal">万元</span></span>
                  </div>

                  <div className={`flex items-center justify-between p-1.5 rounded-lg ${isBest ? 'bg-emerald-100/50' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Clock size={16} className={isBest ? 'text-emerald-500' : 'text-slate-400'} />
                        <span className={`text-sm font-bold ${isBest ? 'text-emerald-700' : 'text-slate-600'}`}>静态回收</span>
                    </div>
                    <span className={`text-xl font-black ${isBest ? 'text-emerald-600' : 'text-slate-700'}`}>{item.est_payback_years} <span className="text-xs font-normal">年</span></span>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
