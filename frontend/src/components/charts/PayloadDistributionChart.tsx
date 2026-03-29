import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

interface Props {
    energyData: any;
}

export default function PayloadDistributionChart({ energyData }: Props) {
    const option = useMemo(() => {
        let heavy = 0; // > 2kg
        let medium = 0; // 1-2kg
        let light = 0; // < 1kg

        if (energyData) {
            Object.values(energyData as Record<string, any>).forEach(ed => {
                if (ed.payload > 2.0) heavy++;
                else if (ed.payload >= 1.0) medium++;
                else light++;
            });
        }

        // 如果没有数据给个默认视觉呈现
        if (heavy === 0 && medium === 0 && light === 0) {
            light = 100; medium = 50; heavy = 20;
        }

        return {
            title: { text: "当前空域运载负荷占比", left: 0, top: 0, textStyle: { fontSize: 13, color: '#334155', fontWeight: 'bold' } },
            tooltip: { trigger: 'item', backgroundColor: 'rgba(255, 255, 255, 0.9)' },
            legend: { top: 'bottom', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11, color: '#475569' } },
            series: [
                {
                    name: '载重类别',
                    type: 'pie',
                    radius: ['50%', '70%'],
                    center: ['50%', '52%'],
                    avoidLabelOverlap: false,
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    label: { show: false, position: 'center' },
                    emphasis: {
                        label: { show: true, fontSize: 12, fontWeight: 'bold', color: '#334155' }
                    },
                    labelLine: { show: false },
                    data: [
                        { value: heavy, name: '重载 (>2kg)', itemStyle: { color: '#f59e0b' } },
                        { value: medium, name: '中载 (1-2kg)', itemStyle: { color: '#10b981' } },
                        { value: light, name: '轻载 (<1kg)', itemStyle: { color: '#0ea5e9' } }
                    ]
                }
            ]
        };
    }, [energyData]);

    return <ReactECharts option={option} style={{ height: '240px', width: '100%' }} />;
}
