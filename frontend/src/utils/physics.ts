/**
 * 物理计算工具函数
 * 集中管理无人机能耗相关的物理公式，避免重复定义
 */

/**
 * 风速影响因子：以 3 m/s 为基准，偏离越大消耗越高
 * @param windSpeed - 当前风速 (m/s)
 * @returns 能耗倍率因子 (≥ 1.0)
 */
export function calcWindFactor(windSpeed: number): number {
    const delta = windSpeed - 3;
    return 1 + 0.03 * delta * delta;
}

/**
 * 二分搜索时间戳索引
 * 在有序 timestamps 数组中找到第一个 >= targetTime 的索引
 * @param timestamps - 有序时间戳数组
 * @param targetTime - 目标时间
 * @returns 匹配的索引
 */
export function binarySearchTimestamp(timestamps: number[], targetTime: number): number {
    let left = 0;
    let right = timestamps.length - 1;
    let idx = right;
    while (left <= right) {
        const mid = (left + right) >> 1;
        if (timestamps[mid] >= targetTime) {
            idx = mid;
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    return idx;
}
