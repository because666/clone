import { updateActiveUAVsBuffer } from '../utils/animation';

let trajectories: any[] = [];
let cycleDuration = 0;

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            // 接收主线程传递的静态轨迹数据及设置
            trajectories = payload.trajectories;
            cycleDuration = payload.cycleDuration;
            break;
        case 'UPDATE':
            const currentGlobalTime = payload.currentGlobalTime;
            const sabPositions = payload.sabPositions;
            const sabOrientations = payload.sabOrientations;
            const sabActiveTrajectoryIndices = payload.sabActiveTrajectoryIndices;
            
            // 构建视图 （如果传入的是 SharedArrayBuffer 或 ArrayBuffer 返回的都是对应的 TypedArray）
            const posView = new Float32Array(sabPositions);
            const oriView = new Float32Array(sabOrientations);
            const idxView = new Int32Array(sabActiveTrajectoryIndices);

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
