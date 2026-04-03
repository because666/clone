import { Activity, Cpu, AlertTriangle, TrendingDown } from 'lucide-react';

interface AlgoMetrics {
    avgNodesExpanded: number;
    avgPlanningTimeMs: number;
    nfzViolationRate: number;
    pathSmoothRate: number;
    totalPlanned: number;
}

interface Props {
    metrics: AlgoMetrics;
}

/**
 * A* 算法性能指标卡
 * 数据来自后端 /api/analytics/overview 聚合统计
 */
export default function AlgorithmPerformanceCard({ metrics }: Props) {
    const cards = [
        {
            label: '平均扩展节点',
            value: metrics.avgNodesExpanded.toLocaleString(),
            unit: '个',
            icon: <Cpu size={16} className="text-indigo-500" />,
            color: 'from-indigo-500/10 to-indigo-500/5'
        },
        {
            label: '平均规划耗时',
            value: metrics.avgPlanningTimeMs.toFixed(1),
            unit: 'ms',
            icon: <Activity size={16} className="text-emerald-500" />,
            color: 'from-emerald-500/10 to-emerald-500/5'
        },
        {
            label: '禁飞区碰撞率',
            value: (metrics.nfzViolationRate * 100).toFixed(2),
            unit: '%',
            icon: <AlertTriangle size={16} className="text-rose-500" />,
            color: 'from-rose-500/10 to-rose-500/5'
        },
        {
            label: '路径平滑率',
            value: (metrics.pathSmoothRate * 100).toFixed(1),
            unit: '%',
            icon: <TrendingDown size={16} className="text-sky-500" />,
            color: 'from-sky-500/10 to-sky-500/5'
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 tracking-tight">A* v4 算法性能面板</h3>
                <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">
                    共 {metrics.totalPlanned} 条航线
                </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {cards.map(card => (
                    <div
                        key={card.label}
                        className={`bg-gradient-to-br ${card.color} rounded-xl p-3 border border-white/60 shadow-sm flex flex-col gap-1.5`}
                    >
                        <div className="flex items-center gap-2">
                            {card.icon}
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{card.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-slate-800 tabular-nums">{card.value}</span>
                            <span className="text-[10px] font-bold text-slate-400">{card.unit}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
