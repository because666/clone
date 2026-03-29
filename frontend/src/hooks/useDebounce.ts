import { useState, useEffect } from 'react';

/**
 * 通用防抖 Hook：在指定延迟窗口内阻挡过频的状态更新，常用于输入框搜索以释放主线程压力。
 * @param value 原始的实时状态（如搜寻栏文字）
 * @param delay 延迟毫秒数 (默认 300)
 * @returns 经过防抖处理后的最终输出状态
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // 在值变化后，设定一个定时器，在延迟时间后更新最终防抖状态
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // 如果在延迟期间再次发生变化，清理旧计时器，从头开始等待（防抖核心思想）
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}
