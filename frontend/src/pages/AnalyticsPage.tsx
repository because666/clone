import { useState, useEffect, useCallback } from 'react';
import AnalyticsNavBar from '../components/AnalyticsNavBar';
import FlightVolumeChart from '../components/charts/FlightVolumeChart';
import EnergyConsumptionChart from '../components/charts/EnergyConsumptionChart';
import PayloadDistributionChart from '../components/charts/PayloadDistributionChart';
import CityComparisonRadar from '../components/charts/CityComparisonRadar';
import AlertStatsPieChart from '../components/charts/AlertStatsPieChart';
import AlgorithmPerformanceCard from '../components/charts/AlgorithmPerformanceCard';
import { fetchAnalyticsOverview, fetchCitiesComparison } from '../services/api';
import { useAlerts } from '../components/AlertNotificationProvider';
import { BarChart3, TrendingUp, MapPin, Cpu, Loader2 } from 'lucide-react';

/**
 * 独立全屏数据分析页 /analytics
 * 
 * 六大核心可视化模块：
 * 1. 航线起降点热力统计（轨迹数+距离+能耗指标卡）
 * 2. 分时段订单调度趋势（复用 FlightVolumeChart）
 * 3. 跨城市多维雷达对比
 * 4. 告警类型分布饼图
 * 5. 能耗分布与载荷分析
 * 6. A* v4 算法性能面板
 */
export default function AnalyticsPage() {
    const [currentCity, setCurrentCity] = useState('shenzhen');
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<any>(null);
    const [citiesData, setCitiesData] = useState<any[]>([]);
    const [trajectories, setTrajectories] = useState<any[]>([]);
    const [energyData, setEnergyData] = useState<any>({});

    const { totalCounts } = useAlerts();

    // 加载城市数据
    const loadData = useCallback(async (city: string) => {
        setLoading(true);
        try {
            // 并行请求
            const [overviewRes, comparisonRes] = await Promise.all([
                fetchAnalyticsOverview(city),
                fetchCitiesComparison(),
            ]);

            if (overviewRes.ok) {
                setOverview(overviewRes.data);
                console.log('[Analytics] overview loaded:', overviewRes.data?.trajectoryCount, 'trajs');
                // 用 endpoint 数据构造供图表组件使用的模拟轨迹格式
                const endpoints = overviewRes.data?.endpoints || [];
                const fakeTraj = endpoints
                    .filter((e: any) => e.type === 'start')
                    .map((e: any, i: number) => ({
                        id: `traj_${i}`,
                        timestamps: [i * 100, i * 100 + 300],
                        path: [[e.lon, e.lat, 100]]
                    }));
                setTrajectories(fakeTraj);
            } else {
                console.error('[Analytics] overview failed:', overviewRes);
            }

            if (comparisonRes.ok) {
                setCitiesData(comparisonRes.data || []);
            }

            // 加载能耗数据（路径与 useCityData.ts 一致）
            try {
                const energyRes = await fetch(`/data/processed/${city}_energy_predictions.json`);
                if (energyRes.ok) {
                    setEnergyData(await energyRes.json());
                }
            } catch { /* 可选数据 */ }

        } catch (err) {
            console.error('加载分析数据失败:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData(currentCity);
    }, [currentCity, loadData]);

    const handleCityChange = (city: string) => {
        setCurrentCity(city);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
            <AnalyticsNavBar currentCity={currentCity} onCityChange={handleCityChange} />

            {/* 主内容区（顶部留出导航条空间） */}
            <main className="pt-20 pb-8 px-6 max-w-[1600px] mx-auto">
                {/* 顶部标题 & 指标卡片 */}
                <div className="mb-6">
                    <div className="flex items-end justify-between mb-5">
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                                <BarChart3 className="text-indigo-600" size={26} />
                                全局运行态势分析
                            </h1>
                            <p className="text-xs text-slate-500 mt-1 font-medium">
                                基于实际航线数据的多维度分析 · 数据更新时间 {new Date().toLocaleTimeString()}
                            </p>
                        </div>
                        {loading && (
                            <div className="flex items-center gap-2 text-indigo-500">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-xs font-bold">加载中...</span>
                            </div>
                        )}
                    </div>

                    {/* 四大指标卡 */}
                    <div className="grid grid-cols-4 gap-4">
                        <MetricCard
                            icon={<TrendingUp size={18} className="text-indigo-500" />}
                            label="总航线规模"
                            value={overview?.trajectoryCount?.toLocaleString() || '0'}
                            unit="条"
                            gradient="from-indigo-500/10 to-violet-500/5"
                        />
                        <MetricCard
                            icon={<MapPin size={18} className="text-emerald-500" />}
                            label="平均航线距离"
                            value={overview?.avgDistance ? (overview.avgDistance / 1000).toFixed(2) : '0'}
                            unit="km"
                            gradient="from-emerald-500/10 to-teal-500/5"
                        />
                        <MetricCard
                            icon={<Cpu size={18} className="text-sky-500" />}
                            label="平均能耗"
                            value={overview?.avgEnergy?.toFixed(1) || '0'}
                            unit="Wh"
                            gradient="from-sky-500/10 to-blue-500/5"
                        />
                        <MetricCard
                            icon={<MapPin size={18} className="text-amber-500" />}
                            label="POI 覆盖密度"
                            value={overview?.poiDensity?.toLocaleString() || '0'}
                            unit="个"
                            gradient="from-amber-500/10 to-orange-500/5"
                        />
                    </div>
                </div>

                {/* 六大可视化模块 - 2×3 网格 */}
                <div className="grid grid-cols-3 gap-5">
                    {/* 1. 分时段订单趋势 */}
                    <ChartCard title="分时段订单调度趋势">
                        <FlightVolumeChart trajectories={trajectories} />
                    </ChartCard>

                    {/* 2. 跨城市多维雷达 */}
                    <ChartCard title="跨城市多维度对比">
                        <CityComparisonRadar citiesData={citiesData} />
                    </ChartCard>

                    {/* 3. 告警类型分布 */}
                    <ChartCard title="安全告警态势">
                        <AlertStatsPieChart
                            lowBattery={totalCounts['low-battery']}
                            dangerZone={totalCounts['danger-zone']}
                            conflict={totalCounts['conflict']}
                        />
                    </ChartCard>

                    {/* 4. 能耗分析 */}
                    <ChartCard title="航线能耗趋势">
                        <EnergyConsumptionChart energyData={energyData} />
                    </ChartCard>

                    {/* 5. 载荷分布 */}
                    <ChartCard title="载荷分级分布">
                        <PayloadDistributionChart energyData={energyData} />
                    </ChartCard>

                    {/* 6. 算法性能 */}
                    <ChartCard title="路径规划算法性能">
                        <AlgorithmPerformanceCard
                            metrics={{
                                avgNodesExpanded: overview?.avgNodesExpanded || 0,
                                avgPlanningTimeMs: overview?.avgPlanningTimeMs || 0,
                                nfzViolationRate: overview?.nfzViolationRate || 0,
                                pathSmoothRate: overview?.pathSmoothRate || 0,
                                totalPlanned: overview?.totalPlanned || 0,
                            }}
                        />
                    </ChartCard>
                </div>
            </main>
        </div>
    );
}

/* ==================== 子组件 ==================== */

function MetricCard({ icon, label, value, unit, gradient }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    unit: string;
    gradient: string;
}) {
    return (
        <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-5 border border-white/60 shadow-sm flex flex-col gap-2 relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/20 rounded-full -translate-y-6 translate-x-6 blur-xl"></div>
            <div className="flex items-center gap-2 relative z-10">
                {icon}
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="flex items-baseline gap-1.5 relative z-10">
                <span className="text-3xl font-black text-slate-800 tabular-nums tracking-tight">{value}</span>
                <span className="text-sm font-bold text-slate-400">{unit}</span>
            </div>
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-5 border border-white/60 shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none"></div>
            <div className="relative z-10">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">{title}</h3>
                {children}
            </div>
        </div>
    );
}
