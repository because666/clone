import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const CHART_STYLE = { height: '240px', width: '100%' };
const CHART_STYLE_LG = { height: '320px', width: '100%' };

interface Props {
    lowBattery: number;
    dangerZone: number;
    conflict: number;
}

/**
 * 告警统计环形饼图
 * 展示三类告警（电量/禁飞区/空域冲突）的累计占比
 */
export default function AlertStatsPieChart({ lowBattery, dangerZone, conflict }: Props) {
    const option = useMemo(() => {
        const total = lowBattery + dangerZone + conflict;

        return {
            title: {
                text: '告警类型分布',
                left: 0, top: 0,
                textStyle: { fontSize: 13, color: '#334155', fontWeight: 'bold' }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderColor: '#e2e8f0',
                textStyle: { color: '#334155' },
                formatter: '{b}: {c}次 ({d}%)'
            },
            legend: {
                bottom: 0,
                itemWidth: 10,
                itemHeight: 10,
                textStyle: { fontSize: 10, color: '#64748b' }
            },
            series: [{
                type: 'pie',
                radius: ['40%', '65%'],
                center: ['50%', '48%'],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                label: {
                    show: total > 0,
                    formatter: '{b}\n{d}%',
                    fontSize: 10,
                    color: '#475569'
                },
                emphasis: {
                    label: { show: true, fontSize: 12, fontWeight: 'bold' }
                },
                data: total > 0 ? [
                    { value: lowBattery, name: '电量警告', itemStyle: { color: '#f43f5e' } },
                    { value: dangerZone, name: '禁飞区入侵', itemStyle: { color: '#f59e0b' } },
                    { value: conflict, name: '空域冲突', itemStyle: { color: '#f97316' } },
                ] : [
                    { value: 1, name: '暂无告警', itemStyle: { color: '#e2e8f0' } }
                ]
            }]
        };
    }, [lowBattery, dangerZone, conflict]);

    return <ReactECharts option={option} style={CHART_STYLE_LG} />;
}
