import type { UAVPath } from '../types/map';

/** 
 * 【架构设计】：基于 SoA (Structure of Arrays) 的零内存分配渲染架构
 * 通过预先分配连续内存，将所有无人机的属性平铺为 Float32Array 数组。
 * 这使得每帧动画更新时，我们只修改内存指针中的数值，彻底避免了 `new Object()`
 * 从而实现了渲染层的 0 GC（垃圾回收），消除了大屏可视化中常见的周期性卡顿。
 */
const MAX_UAVS = 20000;

const getBuffer = (size: number) => {
    if (typeof SharedArrayBuffer !== 'undefined') {
        return new SharedArrayBuffer(size);
    }
    return new ArrayBuffer(size);
};

export const sabPositions = getBuffer(MAX_UAVS * 3 * 4); // 4 bytes/float
export const sabOrientations = getBuffer(MAX_UAVS * 3 * 4);
export const sabActiveTrajectoryIndices = getBuffer(MAX_UAVS * 4); // 4 bytes/int

// 扁平化主缓存视图（主线程使用）
export const uavPositionsBuffer = new Float32Array(sabPositions);
export const uavOrientationsBuffer = new Float32Array(sabOrientations);
export const uavActiveIndicesBuffer = new Int32Array(sabActiveTrajectoryIndices);

// 维持一个对象引用表，专门用于主线程处理鼠标悬停 (Hover) / 点击 (Click) 时的回溯映射
export const activeUAVTrajectories: any[] = new Array(MAX_UAVS);

export let activeUAVCount = 0;
export function setActiveUAVCount(count: number) {
    activeUAVCount = count;
}

// ======================== 4D 时空冲突检测缓冲区 ========================
// 存储冲突 UAV 对的起终点 3D 坐标，供 ArcLayer 实时渲染红色冲突弧线
const MAX_CONFLICT_PAIRS = 200;
export const conflictPairsBuffer = new Float32Array(MAX_CONFLICT_PAIRS * 6); // [srcLon, srcLat, srcAlt, dstLon, dstLat, dstAlt] × N
export let conflictPairCount = 0;
export function setConflictPairCount(count: number) {
    conflictPairCount = count;
}

// 预计算常量，消除热路径中的除法运算
const RAD2DEG = 180 / Math.PI;
// 查表法：预生成 00-99 的两位数字符串，消除 padStart 的每帧字符串分配
const DIGITS: string[] = [];
for (let i = 0; i < 100; i++) DIGITS[i] = i < 10 ? '0' + i : '' + i;

const getSegAngle = (path: [number, number, number][], seg: number) => {
    const a = path[seg];
    const b = path[seg + 1];
    return Math.atan2(b[0] - a[0], b[1] - a[1]) * RAD2DEG;
};

// 【OPT-1】扁平化连续内存的角度计算，利用 CPU 缓存行顺序读取
const getSegAngleSoA = (lon: Float32Array, lat: Float32Array, seg: number) => {
    return Math.atan2(lon[seg + 1] - lon[seg], lat[seg + 1] - lat[seg]) * RAD2DEG;
};

// 【性能优化】确定性角度插值：用数学公式替代 while 循环，消除不可预测的分支跳转
const lerpAngle = (a: number, b: number, t: number) => {
    const diff = ((b - a) % 360 + 540) % 360 - 180;
    return a + diff * t;
};

/**
 * 核心渲染驱动引擎：将最新的时间片投影到缓冲内存中
 * 这个函数每秒执行 60 次 (60FPS)，必须保持极度的高效：无解构、无闭包、无高阶函数遍历。
 * 支持传入目标缓冲（Web Worker复用），若未传则使用全局主线程缓冲
 */
export function updateActiveUAVsBuffer(
    trajectories: UAVPath[],
    currentGlobalTime: number,
    cycleDuration: number,
    posView: Float32Array = uavPositionsBuffer,
    oriView: Float32Array = uavOrientationsBuffer,
    idxView: Int32Array = uavActiveIndicesBuffer
): number {
    if (!trajectories?.length || !cycleDuration) {
        return 0;
    }

    let activeCount = 0;

    for (let i = 0; i < trajectories.length; i++) {
        const traj = trajectories[i];
        
        // 优先使用预编译的 Float64Array
        const times = traj.timestampsF64 || traj.timestamps;
        const path = traj.path;
        if (!times || !path || times.length < 2) continue;

        const hasSoA = !!(traj.pathLon && traj.pathLat && traj.pathAlt);
        const pLon = traj.pathLon;
        const pLat = traj.pathLat;
        const pAlt = traj.pathAlt;

        const t0_absolute = times[0];
        const tEnd_absolute = times[times.length - 1];
        const flightDuration = tEnd_absolute - t0_absolute;

        // 计算局部时间轴边界，映射到 [0, cycleDuration) 的无限循环轨道
        const localT = (currentGlobalTime - t0_absolute) % cycleDuration;
        const boundedLocalT = (localT + cycleDuration) % cycleDuration;
        const trailLength = 100; // 拖尾渲染冗余时间，保证渐隐彻底完成才卸载模型

        // 如果无人机在当前局部周期内应处于“现身”状态
        if (boundedLocalT >= 0 && boundedLocalT <= flightDuration + trailLength) {
            if (activeCount >= MAX_UAVS) break; // 性能兜底防御机制

            // 限制预期时间不超过其终点时间
            const expectedT = Math.min(t0_absolute + boundedLocalT, tEnd_absolute);

            // 时间轴 O(logN) 极速定位算法：找到包含当前时间期望的路径时间段 (segment)
            let segIdx = 0;
            let left = 0;
            let right = times.length - 2;
            while (left <= right) {
                const mid = (left + right) >> 1; // 位运算替代 Math.floor
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

            let p0_0, p0_1, p0_2: number;
            let p1_0, p1_1, p1_2: number;

            // 【OPT-1】使用 SoA 极速读取，消除间接对象访问寻址开销
            if (hasSoA) {
                p0_0 = pLon![segIdx]; p0_1 = pLat![segIdx]; p0_2 = pAlt![segIdx];
                p1_0 = pLon![segIdx + 1]; p1_1 = pLat![segIdx + 1]; p1_2 = pAlt![segIdx + 1];
            } else {
                const p0 = path[segIdx];
                const p1 = path[segIdx + 1];
                p0_0 = p0[0]; p0_1 = p0[1]; p0_2 = p0[2];
                p1_0 = p1[0]; p1_1 = p1[1]; p1_2 = p1[2];
            }

            // 特殊情况防御：如果是静止状态（首尾时间重叠）直接写入初始位元
            if (t1 === t0) {
                posView[activeCount * 3 + 0] = p0_0;
                posView[activeCount * 3 + 1] = p0_1;
                posView[activeCount * 3 + 2] = p0_2;

                // 强制给定朝向 [pitch, yaw, roll]，roll=90 使得大疆模型机臂冲上
                oriView[activeCount * 3 + 0] = 0;
                oriView[activeCount * 3 + 1] = 0;
                oriView[activeCount * 3 + 2] = 90;

                idxView[activeCount] = i;
                if (posView === uavPositionsBuffer) activeUAVTrajectories[activeCount] = traj;
                activeCount++;
                continue;
            }

            // 高精度平滑插值运算
            const progress = (expectedT - t0) / (t1 - t0);

            // 通过两段切线方向预判计算，让模型转弯具有真实的自然弧度
            let curAngle = hasSoA ? getSegAngleSoA(pLon!, pLat!, segIdx) : getSegAngle(path, segIdx);
            let yawDeg: number;

            if (segIdx < path.length - 2) {
                const nextAngle = hasSoA ? getSegAngleSoA(pLon!, pLat!, segIdx + 1) : getSegAngle(path, segIdx + 1);
                yawDeg = lerpAngle(curAngle, nextAngle, progress);
            } else if (segIdx > 0) {
                const prevAngle = hasSoA ? getSegAngleSoA(pLon!, pLat!, segIdx - 1) : getSegAngle(path, segIdx - 1);
                yawDeg = lerpAngle(prevAngle, curAngle, progress);
            } else {
                yawDeg = curAngle;
            }

            // [性能攸关] 无闭包、无对象的连续内存覆盖。DeckGL 渲染器只需以此指针直接映射给显卡。
            posView[activeCount * 3 + 0] = p0_0 + (p1_0 - p0_0) * progress;
            posView[activeCount * 3 + 1] = p0_1 + (p1_1 - p0_1) * progress;
            posView[activeCount * 3 + 2] = p0_2 + (p1_2 - p0_2) * progress;

            oriView[activeCount * 3 + 0] = 0;
            // 抵消坐标系转换差异，且大疆 dji_spark.glb 模型的轴心默认是横置的，需要 Roll 90度立起
            oriView[activeCount * 3 + 1] = -yawDeg + 90;
            oriView[activeCount * 3 + 2] = 90;

            idxView[activeCount] = i;
            if (posView === uavPositionsBuffer) activeUAVTrajectories[activeCount] = traj;
            activeCount++;
        }
    }

    if (posView === uavPositionsBuffer) activeUAVCount = activeCount;
    return activeCount;
}

// 【性能优化】查表法格式化：消除 padStart 每帧创建的临时字符串对象
export function formatElapsed(seconds: number): string {
    const h = (seconds / 3600) | 0;
    const m = ((seconds % 3600) / 60) | 0;
    const s = (seconds % 60) | 0;
    return DIGITS[h] + ':' + DIGITS[m] + ':' + DIGITS[s];
}
