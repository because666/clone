import { memo } from 'react';
import { Eye, Plane, Building2, ShieldAlert } from 'lucide-react';

export type VisionMode = 'default' | 'uav' | 'building' | 'nofly';

interface VisionModeDockProps {
    visionMode: VisionMode;
    setVisionMode: (mode: VisionMode) => void;
}

const VisionModeDock = memo(function VisionModeDock({ visionMode, setVisionMode }: VisionModeDockProps) {
    const modes = [
        {
            id: 'default',
            icon: Eye,
            label: '全局常规视野',
            color: 'text-slate-200',
            bg: 'bg-white/10 hover:bg-white/20',
            border: 'border-white/20',
            glow: 'shadow-[0_0_15px_rgba(255,255,255,0.1)]',
            activeColor: 'text-white',
            activeBg: 'bg-white/30',
            activeBorder: 'border-white/50',
            activeGlow: 'shadow-[0_0_20px_rgba(255,255,255,0.4)]',
        },
        {
            id: 'uav',
            icon: Plane,
            label: '动态目标高光',
            color: 'text-amber-300/70',
            bg: 'bg-amber-500/10 hover:bg-amber-500/20',
            border: 'border-amber-500/20',
            glow: 'shadow-[0_0_15px_rgba(245,158,11,0.1)]',
            activeColor: 'text-amber-400',
            activeBg: 'bg-amber-500/30',
            activeBorder: 'border-amber-400',
            activeGlow: 'shadow-[0_0_25px_rgba(251,191,36,0.6)]',
        },
        {
            id: 'building',
            icon: Building2,
            label: '基建轮廓透视',
            color: 'text-cyan-300/70',
            bg: 'bg-cyan-500/10 hover:bg-cyan-500/20',
            border: 'border-cyan-500/20',
            glow: 'shadow-[0_0_15px_rgba(6,182,212,0.1)]',
            activeColor: 'text-cyan-400',
            activeBg: 'bg-cyan-500/30',
            activeBorder: 'border-cyan-400',
            activeGlow: 'shadow-[0_0_25px_rgba(34,211,238,0.6)]',
        },
        {
            id: 'nofly',
            icon: ShieldAlert,
            label: '禁飞隔离探测',
            color: 'text-rose-300/70',
            bg: 'bg-rose-500/10 hover:bg-rose-500/20',
            border: 'border-rose-500/20',
            glow: 'shadow-[0_0_15px_rgba(225,29,72,0.1)]',
            activeColor: 'text-rose-500',
            activeBg: 'bg-rose-500/30',
            activeBorder: 'border-rose-500',
            activeGlow: 'shadow-[0_0_25px_rgba(244,63,94,0.6)]',
        }
    ];

    return (
        <div className="pointer-events-auto flex items-center p-2 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <div className="flex gap-2">
                {modes.map((mode) => {
                    const isActive = visionMode === mode.id;
                    const Icon = mode.icon;
                    return (
                        <button
                            key={mode.id}
                            onClick={() => setVisionMode(mode.id as VisionMode)}
                            className={`
                                relative group flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border transition-all duration-300
                                ${isActive ? `${mode.activeBg} ${mode.activeBorder} ${mode.activeColor} ${mode.activeGlow}` : `${mode.bg} ${mode.border} ${mode.color}`}
                                hover:border-opacity-50
                            `}
                            title={mode.label}
                        >
                            <Icon size={18} className={`transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-md' : 'group-hover:scale-110'}`} />
                            <span className={`text-xs font-black tracking-widest uppercase transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                                {mode.label}
                            </span>
                            
                            {/* 扫描线动画 (高亮模式独占) */}
                            {isActive && mode.id !== 'default' && (
                                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                                    <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent absolute top-0 animate-[scan_2s_ease-in-out_infinite]"></div>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
            {/* 全息效果干扰纹 */}
            <div className="absolute inset-0 pointer-events-none rounded-2xl mix-blend-overlay opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)' }}></div>
        </div>
    );
});

export default VisionModeDock;
