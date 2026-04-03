import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const CHART_STYLE_LG = { height: '320px', width: '100%' };
import { CITIES } from '../../constants/map';

interface CityStats {
    city: string;
    trajectoryCount: number;
    avgDistance: number;
    avgEnergy: number;
    poiDensity: number;
}

interface Props {
    citiesData: CityStats[];
}

/**
 * 跨城市对比雷达图
 * 四维度对比：航线数 / 平均距离 / 平均能耗 / POI 密度
 */
export default function CityComparisonRadar({ citiesData }: Props) {
    const option = useMemo(() => {
        if (!citiesData || citiesData.length === 0) {
            return {
                title: { text: '跨城市多维对比雷达', left: 0, top: 0, textStyle: { fontSize: 13, color: '#334155', fontWeight: 'bold' } },
                radar: { indicator: [] },
                series: []
            };
        }

        // 计算各维度的最大值用于归一化
        const maxTraj = Math.max(...citiesData.map(c => c.trajectoryCount), 1);
        const maxDist = Math.max(...citiesData.map(c => c.avgDistance), 1);
        const maxEnergy = Math.max(...citiesData.map(c => c.avgEnergy), 1);
        const maxPoi = Math.max(...citiesData.map(c => c.poiDensity), 1);

        const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

        return {
            title: {
                text: '跨城市多维对比雷达',
                left: 0, top: 0,
                textStyle: { fontSize: 13, color: '#334155', fontWeight: 'bold' }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderColor: '#e2e8f0',
                textStyle: { color: '#334155', fontSize: 11 }
            },
            legend: {
                bottom: 0,
                itemWidth: 12,
                itemHeight: 8,
                textStyle: { fontSize: 10, color: '#64748b' },
                data: citiesData.map(c => CITIES.find(ci => ci.id === c.city)?.label || c.city)
            },
            radar: {
                center: ['50%', '48%'],
                radius: '58%',
                indicator: [
                    { name: '航线规模', max: maxTraj * 1.2 },
                    { name: '平均距离', max: maxDist * 1.2 },
                    { name: '平均能耗', max: maxEnergy * 1.2 },
                    { name: 'POI 密度', max: maxPoi * 1.2 },
                ],
                axisName: { color: '#64748b', fontSize: 10 },
                splitArea: { areaStyle: { color: ['rgba(99,102,241,0.02)', 'rgba(99,102,241,0.06)'] } },
                splitLine: { lineStyle: { color: '#e2e8f0' } }
            },
            series: [{
                type: 'radar',
                data: citiesData.map((c, i) => ({
                    name: CITIES.find(ci => ci.id === c.city)?.label || c.city,
                    value: [c.trajectoryCount, c.avgDistance, c.avgEnergy, c.poiDensity],
                    lineStyle: { color: colors[i % colors.length], width: 2 },
                    areaStyle: { color: colors[i % colors.length], opacity: 0.08 },
                    itemStyle: { color: colors[i % colors.length] },
                    symbol: 'circle',
                    symbolSize: 5
                }))
            }]
        };
    }, [citiesData]);

    return <ReactECharts option={option} style={CHART_STYLE_LG} />;
}
