import { useState, useRef, useCallback } from 'react';
import { createTask } from '../services/api';

interface PickedPoint {
    lat: number;
    lon: number;
    id: string;
    name: string;
}

type ToastFn = (msg: string, type?: 'info' | 'success' | 'error' | 'loading') => void;

interface UseFlightPickingParams {
    currentCity: string;
    isSandboxMode: boolean;
    showToast: ToastFn;
}

export function useFlightPicking({ currentCity, isSandboxMode, showToast }: UseFlightPickingParams) {
    const pickedFromRef = useRef<PickedPoint | null>(null);
    const [pickedFromDisplay, setPickedFromDisplay] = useState<PickedPoint | null>(null);

    /** 处理 POI 点击 */
    const handleDemandPick = useCallback((info: any) => {
        // 沙盘模式下屏蔽正常的 POI 点击
        if (isSandboxMode) return;

        if (!info.object) return;
        const feat = info.object;
        const coords = feat.geometry?.coordinates;
        if (!coords) return;
        const [lon, lat] = coords;
        const props = feat.properties || {};
        const picked: PickedPoint = { lat, lon, id: String(props.poi_id || props.osm_id || ''), name: props.name || '' };

        if (!pickedFromRef.current) {
            // 第一次点击：选起点
            pickedFromRef.current = picked;
            setPickedFromDisplay(picked);
            showToast(`已选择起点：${picked.name || picked.id}，请点击另一个点作为终点`, 'info');
        } else {
            // 第二次点击：选终点，自动调用 API 生成轨迹
            const from = pickedFromRef.current;

            // 如果点击同一个点，则取消选择
            if (from.id === picked.id) {
                pickedFromRef.current = null;
                setPickedFromDisplay(null);
                showToast(`已取消选择`, 'info');
                return;
            }

            pickedFromRef.current = null;
            setPickedFromDisplay(null);

            showToast(`正在提交到 ${picked.name || picked.id} 的任务审批...`, 'loading');

            // 【工程化改进 S1】使用统一 API service 层
            createTask({
                city: currentCity,
                from_lat: from.lat, from_lon: from.lon, from_id: from.id,
                to_lat: picked.lat, to_lon: picked.lon, to_id: picked.id
            })
                .then((resp) => {
                    if (resp.ok) {
                        const taskId = resp.data?.task_id || '';
                        const displayId = typeof taskId === 'string' ? taskId.substring(0, 8) : taskId;
                        showToast(`🚀 任务提交成功！已进入待审批状态 (ID: ${displayId})`, 'success');
                    } else {
                        showToast(`提交失败：${resp.message || '未知错误'}`, 'error');
                    }
                })
                .catch((e) => {
                    showToast(`请求失败：${e.message}`, 'error');
                });
        }
    }, [currentCity, isSandboxMode, showToast]);

    return {
        pickedFromDisplay,
        handleDemandPick,
    };
}
