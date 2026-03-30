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
    const [pendingAiTask, setPendingAiTask] = useState<{ fromPoint: PickedPoint, toPoint: PickedPoint } | null>(null);

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
        const nameFallback = `坐标(${lat.toFixed(4)}, ${lon.toFixed(4)})`;
        const picked: PickedPoint = { lat, lon, id: String(props.poi_id || props.osm_id || ''), name: props.name || nameFallback };

        if (!pickedFromRef.current) {
            // 第一次点击：选起点
            pickedFromRef.current = picked;
            setPickedFromDisplay(picked);
            showToast(`已选择起点：${picked.name || picked.id}，请点击另一个点作为终点`, 'info');
        } else {
            // 第二次点击：选终点，拦截并展示 AI 预审 Modal
            const from = pickedFromRef.current;

            // 如果点击同一个点，则取消选择
            if (from.id === picked.id) {
                pickedFromRef.current = null;
                setPickedFromDisplay(null);
                setPendingAiTask(null);
                showToast(`已取消选择`, 'info');
                return;
            }

            pickedFromRef.current = null;
            setPickedFromDisplay(null);

            // 触发 AI 预审拦截弹窗
            setPendingAiTask({ fromPoint: from, toPoint: picked });
        }
    }, [isSandboxMode, showToast]);

    // 用户确认起飞后的实际建单逻辑
    const confirmCreateTask = useCallback(async () => {
        if (!pendingAiTask) return;
        const { fromPoint, toPoint } = pendingAiTask;

        showToast(`正在提交到 ${toPoint.name || toPoint.id} 的任务审批...`, 'loading');
        setPendingAiTask(null);

        try {
            const resp = await createTask({
                city: currentCity,
                from_lat: fromPoint.lat, from_lon: fromPoint.lon, from_id: fromPoint.id,
                to_lat: toPoint.lat, to_lon: toPoint.lon, to_id: toPoint.id
            });

            if (resp.ok) {
                const taskId = resp.data?.task_id || '';
                const displayId = typeof taskId === 'string' ? taskId.substring(0, 8) : taskId;
                showToast(`任务提交成功！已进入待审批状态 (ID: ${displayId})`, 'success');
            } else {
                showToast(`提交失败：${resp.message || '未知错误'}`, 'error');
            }
        } catch (e: any) {
            showToast(`请求失败：${e.message}`, 'error');
        }
    }, [pendingAiTask, currentCity, showToast]);

    const cancelPendingTask = useCallback(() => {
        setPendingAiTask(null);
        showToast(`已取消航线任务创建`, 'info');
    }, [showToast]);

    return {
        pickedFromDisplay,
        handleDemandPick,
        pendingAiTask,
        confirmCreateTask,
        cancelPendingTask
    };
}
