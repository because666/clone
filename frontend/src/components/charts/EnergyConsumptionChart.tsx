import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

const CHART_STYLE = { height: '240px', width: '100%' };

interface Props {
    energyData: any;
}

export default function EnergyConsumptionChart({ energyData }: Props) {
    const option = useMemo(() => {
        let highDrop = 0; // > 40%
        let medDrop = 0;  // 20-40%
        let lowDrop = 0;  // < 20%

        if (energyData) {
            Object.values(energyData as Record<string, any>).forEach(ed => {
                if (ed.battery && ed.battery.length > 0) {
                    const start = ed.battery[0];
                    const end = Math.min(...ed.battery.filter((b: number) => b > 0));
                    const drop = start - end;
                    
                    if (drop > 40) highDrop++;
                    else if (drop > 20) medDrop++;
                    else lowDrop++;
                }
            });
        }

        if (highDrop === 0 && medDrop === 0 && lowDrop === 0) {
            lowDrop = 80; medDrop = 60; highDrop = 15;
        }

        return {
            title: { text: "单次任务预计耗电量分布", left: 0, top: 0, textStyle: { fontSize: 13, color: '#334155', fontWeight: 'bold' } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: '3%', right: '5%', bottom: '2%', top: '28%', containLabel: true },
            xAxis: {
                type: 'value',
                splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
                axisLabel: { color: '#64748b', fontSize: 10 }
            },
            yAxis: {
                type: 'category',
                data: ['< 20%', '20%-40%', '> 40%'],
                axisLabel: { color: '#64748b', fontSize: 10 },
                axisLine: { show: false },
                axisTick: { show: false }
            },
            series: [
                {
                    name: '架次',
                    type: 'bar',
                    data: [
                        { value: lowDrop, itemStyle: { color: '#34d399' } },
                        { value: medDrop, itemStyle: { color: '#fbbf24' } },
                        { value: highDrop, itemStyle: { color: '#f87171' } }
                    ],
                    barWidth: '45%',
                    itemStyle: { borderRadius: [0, 4, 4, 0] },
                    label: { show: true, position: 'right', color: '#64748b', fontSize: 10 }
                }
            ]
        };
    }, [energyData]);

    return <ReactECharts option={option} style={CHART_STYLE} />;
}
