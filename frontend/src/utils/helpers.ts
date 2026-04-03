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
