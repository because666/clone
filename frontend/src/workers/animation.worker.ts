import { updateActiveUAVsBuffer } from '../utils/animation';

let trajectories: any[] = [];
let cycleDuration = 0;

// 【性能优化 P2-9】缓存 TypedArray 视图，避免每帧 new
let posView: Float32Array | null = null;
let oriView: Float32Array | null = null;
let idxView: Int32Array | null = null;

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            // 接收主线程传递的静态轨迹数据及设置
            trajectories = payload.trajectories;
            cycleDuration = payload.cycleDuration;
            // 重置视图缓存，下次 UPDATE 时重新创建
            posView = null;
            oriView = null;
            idxView = null;
            break;
        case 'UPDATE':
            const currentGlobalTime = payload.currentGlobalTime;

            // 首次或 SAB 变更时创建视图，后续帧直接复用
            if (!posView) posView = new Float32Array(payload.sabPositions);
            if (!oriView) oriView = new Float32Array(payload.sabOrientations);
            if (!idxView) idxView = new Int32Array(payload.sabActiveTrajectoryIndices);

            // 执行高度并行的动画帧计算
            const count = updateActiveUAVsBuffer(
                trajectories,
                currentGlobalTime,
                cycleDuration,
                posView,
                oriView,
                idxView
            );

            // 返回计算完成信号及活跃数量
            self.postMessage({ type: 'UPDATE_DONE', payload: { count, currentGlobalTime } });
            break;
    }
};
