/**
 * 【架构优化 P3-2】航线双点选取与任务提交 Hook
 *
 * 从 MapContainer.tsx 中提取 POI 双点选取逻辑：
 * - 第一次点击选取起点
 * - 第二次点击选取终点并自动提交任务审批
 * - 点击同一点取消选择
 */

import { useState, useRef, useCallback } from 'react';

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

            // 异步调用 tasks API 提交调度任务
            const token = localStorage.getItem('token');
            fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    city: currentCity,
                    from_lat: from.lat, from_lon: from.lon, from_id: from.id,
                    to_lat: picked.lat, to_lon: picked.lon, to_id: picked.id
                }),
            })
                .then(async r => {
                    const text = await r.text();
                    try {
                        const data = JSON.parse(text);
                        return { data };
                    } catch {
                        if (r.status === 504 || r.status === 502) {
                            throw new Error("后台算法服务未启动 (网关超时)，请确保运行了 python server.py");
                        }
                        throw new Error(`非预期的服务器响应 (状态码 ${r.status})`);
                    }
                })
                .then(({ data }) => {
                    // 兼容新旧格式
                    if (data.ok || data.code === 0) {
                        const taskId = data.task_id || data.data?.task_id || '';
                        const displayId = typeof taskId === 'string' ? taskId.substring(0, 8) : taskId;
                        showToast(`🚀 任务提交成功！已进入待审批状态 (ID: ${displayId})`, 'success');
                    } else {
                        showToast(`提交失败：${data.error || data.message || '未知错误'}`, 'error');
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
