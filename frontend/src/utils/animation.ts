import type { UAVPath } from '../types/map';

export let uavModelBuffer: any[] = [];

/** 当前活跃的 UAV 数量（由 updateActiveUAVsBuffer 维护） */
let activeUAVCount = 0;
/** 持久引用数组：仅在活跃数量变化时才重新 slice，避免每帧分配 GC 压力 */
let activeSlice: any[] = [];
let lastSlicedCount = -1;

/** 获取活跃 UAV 列表（零分配：仅在数量变化时才重新切片） */
export function getActiveUAVs(): any[] {
    if (lastSlicedCount !== activeUAVCount) {
        activeSlice = uavModelBuffer.slice(0, activeUAVCount);
        lastSlicedCount = activeUAVCount;
    }
    return activeSlice;
}


const getSegAngle = (path: [number, number, number][], seg: number) => {
    const a = path[seg];
    const b = path[seg + 1];
    return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
};

const lerpAngle = (a: number, b: number, t: number) => {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
};

export function updateActiveUAVsBuffer(trajectories: UAVPath[], currentGlobalTime: number, cycleDuration: number, buffer: any[]) {
    if (!trajectories?.length || !cycleDuration) return;

    while (buffer.length < trajectories.length) {
        buffer.push({
            id: `dummy-${buffer.length}`,
            position: [0, 0, -1000] as [number, number, number],
            orientation: [0, 0, 90] as [number, number, number],
            trajectory: null as any,
            isActive: false
        });
    }

    let activeCount = 0;

    for (let i = 0; i < trajectories.length; i++) {
        const traj = trajectories[i];
        const times = traj.timestamps;
        const path = traj.path;
        if (!times || !path || times.length < 2) continue;

        const t0_absolute = times[0];
        const tEnd_absolute = times[times.length - 1];
        const flightDuration = tEnd_absolute - t0_absolute;

        const localT = (currentGlobalTime - t0_absolute) % cycleDuration;
        const boundedLocalT = (localT + cycleDuration) % cycleDuration;
        const trailLength = 100;

        if (boundedLocalT >= 0 && boundedLocalT <= flightDuration + trailLength) {
            const expectedT = Math.min(t0_absolute + boundedLocalT, tEnd_absolute);

            let segIdx = 0;
            let left = 0;
            let right = times.length - 2;
            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                if (expectedT >= times[mid] && expectedT <= times[mid + 1]) {
                    segIdx = mid;
                    break;
                } else if (expectedT < times[mid]) {
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }

            const t0 = times[segIdx];
            const t1 = times[segIdx + 1];
            const p0 = path[segIdx];
            const p1 = path[segIdx + 1];

            const cell = buffer[activeCount];

            if (t1 === t0) {
                cell.id = traj.id;
                cell.position = [p0[0], p0[1], p0[2]];
                cell.orientation = [0, 0, 90];
                cell.trajectory = traj;
                cell.isActive = true;
                activeCount++;
                continue;
            }

            const progress = (expectedT - t0) / (t1 - t0);

            const curAngle = getSegAngle(path, segIdx);
            let yawDeg: number;

            if (segIdx < path.length - 2) {
                const nextAngle = getSegAngle(path, segIdx + 1);
                yawDeg = lerpAngle(curAngle, nextAngle, progress);
            } else if (segIdx > 0) {
                const prevAngle = getSegAngle(path, segIdx - 1);
                yawDeg = lerpAngle(prevAngle, curAngle, progress);
            } else {
                yawDeg = curAngle;
            }

            cell.id = traj.id;
            cell.position = [
                p0[0] + (p1[0] - p0[0]) * progress,
                p0[1] + (p1[1] - p0[1]) * progress,
                p0[2] + (p1[2] - p0[2]) * progress
            ];

            cell.orientation = [0, -yawDeg + 90, 90];
            cell.trajectory = traj;
            cell.isActive = true;



            activeCount++;
        }
    }

    for (let i = activeCount; i < buffer.length; i++) {
        const cell = buffer[i];
        if (!cell.isActive) continue;
        cell.position = [0, 0, -1000];
        cell.isActive = false;
        cell.trajectory = null;
    }

    // 记录活跃数量供 getActiveUAVs() 使用，并强制缓存失效
    activeUAVCount = activeCount;
    lastSlicedCount = -1; // 数据内容已变更，强制下次 getActiveUAVs() 重新切片
}

export function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
