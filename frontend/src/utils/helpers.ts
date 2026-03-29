/**
 * 格式化毫秒时间为可读字符串
 * @param ms - 毫秒数
 * @returns 格式化后的时间字符串 (HH:MM:SS 或 MM:SS)
 */
export function formatTime(ms: number): string {
    if (ms < 0 || !isFinite(ms)) {
        return '00:00';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * 格式化秒数为可读字符串
 * @param seconds - 秒数
 * @returns 格式化后的时间字符串 (HH:MM:SS)
 */
export function formatSeconds(seconds: number): string {
    if (seconds < 0 || !isFinite(seconds)) {
        return '00:00:00';
    }

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 将数据转换为 CSV 格式字符串
 * @param data - 要转换的数据数组
 * @param columns - 列定义，包含 key 和 header
 * @returns CSV 格式字符串
 */
export function convertToCSV<T extends Record<string, unknown>>(
    data: T[],
    columns: Array<{ key: keyof T; header: string }>
): string {
    if (!data || data.length === 0) {
        return '';
    }

    const headers = columns.map(col => col.header).join(',');
    const rows = data.map(item => {
        return columns.map(col => {
            const value = item[col.key];
            if (value === null || value === undefined) {
                return '';
            }
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        }).join(',');
    });

    return [headers, ...rows].join('\n');
}

/**
 * 触发浏览器下载 CSV 文件
 * @param csvContent - CSV 内容字符串
 * @param filename - 文件名（不含扩展名）
 */
export function downloadCSV(csvContent: string, filename: string): void {
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * 导出数据为 CSV 文件
 * @param data - 要导出的数据数组
 * @param columns - 列定义
 * @param filename - 文件名
 */
export function exportToCSV<T extends Record<string, unknown>>(
    data: T[],
    columns: Array<{ key: keyof T; header: string }>,
    filename: string
): void {
    const csvContent = convertToCSV(data, columns);
    if (csvContent) {
        downloadCSV(csvContent, filename);
    }
}

/**
 * 本地存储封装对象
 * 提供类型安全的 localStorage 操作方法
 */
export const storage = {
    /**
     * 获取存储项
     * @param key - 存储键名
     * @returns 解析后的值，不存在则返回 null
     */
    get<T>(key: string): T | null {
        try {
            const item = localStorage.getItem(key);
            if (item === null) {
                return null;
            }
            return JSON.parse(item) as T;
        } catch (error) {
            console.error(`[Storage] 读取 ${key} 失败:`, error);
            return null;
        }
    },

    /**
     * 设置存储项
     * @param key - 存储键名
     * @param value - 要存储的值
     */
    set<T>(key: string, value: T): void {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error(`[Storage] 写入 ${key} 失败:`, error);
        }
    },

    /**
     * 移除存储项
     * @param key - 存储键名
     */
    remove(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`[Storage] 移除 ${key} 失败:`, error);
        }
    },

    /**
     * 清空所有存储
     */
    clear(): void {
        try {
            localStorage.clear();
        } catch (error) {
            console.error('[Storage] 清空失败:', error);
        }
    },

    /**
     * 检查存储项是否存在
     * @param key - 存储键名
     * @returns 是否存在
     */
    has(key: string): boolean {
        return localStorage.getItem(key) !== null;
    }
};

/**
 * 防抖函数
 * @param fn - 要防抖的函数
 * @param delay - 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: unknown, ...args: Parameters<T>) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * 节流函数
 * @param fn - 要节流的函数
 * @param limit - 时间限制（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return function (this: unknown, ...args: Parameters<T>) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}

/**
 * 生成唯一 ID
 * @param prefix - ID 前缀
 * @returns 唯一 ID 字符串
 */
export function generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 深拷贝对象
 * 使用浏览器原生 structuredClone，正确处理 Date/Map/Set/循环引用等
 * @param obj - 要拷贝的对象
 * @returns 深拷贝后的对象
 */
export function deepClone<T>(obj: T): T {
    return structuredClone(obj);
}

/**
 * 检查是否为客户端环境
 * @returns 是否为客户端
 */
export function isClient(): boolean {
    return typeof window !== 'undefined';
}

/**
 * 延迟执行
 * @param ms - 延迟毫秒数
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带指数退避的异步重试工具
 * @param fn - 要执行的异步函数，必须返回 Promise
 * @param maxRetries - 最大重试次数（默认 3）
 * @param baseDelay - 基础延迟毫秒数（默认 1000）
 * @returns 函数执行结果
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === maxRetries) break;

            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}
