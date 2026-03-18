/**
 * LRU (Least Recently Used) 缓存实现
 * 用于缓存城市数据，避免重复请求
 */

interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

interface LRUCacheOptions {
    maxSize?: number;
    ttl?: number; // 过期时间（毫秒），默认不设置
}

/**
 * LRU 缓存类
 * @template T 缓存值类型
 */
export class LRUCache<T> {
    private cache: Map<string, CacheEntry<T>>;
    private maxSize: number;
    private ttl?: number;

    constructor(options: LRUCacheOptions = {}) {
        this.cache = new Map();
        this.maxSize = options.maxSize ?? 5;
        this.ttl = options.ttl;
    }

    /**
     * 获取缓存值
     * @param key 缓存键
     * @returns 缓存值或 undefined
     */
    get(key: string): T | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // 检查是否过期
        if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        // 更新访问时间（移到最近使用）
        this.cache.delete(key);
        this.cache.set(key, { ...entry, timestamp: Date.now() });

        return entry.value;
    }

    /**
     * 设置缓存值
     * @param key 缓存键
     * @param value 缓存值
     */
    set(key: string, value: T): void {
        // 如果已存在，先删除（以便更新到最新位置）
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // 如果超过最大容量，删除最久未使用的
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    /**
     * 检查是否存在缓存
     * @param key 缓存键
     * @returns 是否存在
     */
    has(key: string): boolean {
        const entry = this.cache.get(key);

        if (!entry) {
            return false;
        }

        // 检查是否过期
        if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 删除缓存
     * @param key 缓存键
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * 获取所有缓存键
     */
    keys(): IterableIterator<string> {
        return this.cache.keys();
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): { size: number; maxSize: number; keys: string[] } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            keys: Array.from(this.cache.keys())
        };
    }
}

/**
 * 带持久化的缓存类
 * 使用 localStorage 持久化缓存数据
 */
export class PersistentLRUCache<T> extends LRUCache<T> {
    private storageKey: string;

    constructor(storageKey: string, options: LRUCacheOptions = {}) {
        super(options);
        this.storageKey = storageKey;
        this.loadFromStorage();
    }

    /**
     * 从 localStorage 加载缓存
     */
    private loadFromStorage(): void {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    parsed.forEach(([key, entry]: [string, CacheEntry<T>]) => {
                        super.set(key, entry.value);
                    });
                }
            }
        } catch (error) {
            console.warn('加载缓存失败:', error);
        }
    }

    /**
     * 保存到 localStorage
     */
    private saveToStorage(): void {
        try {
            const entries = Array.from(this.keys()).map(key => {
                const entry = (this as any).cache.get(key);
                return [key, entry];
            });
            localStorage.setItem(this.storageKey, JSON.stringify(entries));
        } catch (error) {
            console.warn('保存缓存失败:', error);
        }
    }

    set(key: string, value: T): void {
        super.set(key, value);
        this.saveToStorage();
    }

    delete(key: string): void {
        super.delete(key);
        this.saveToStorage();
    }

    clear(): void {
        super.clear();
        localStorage.removeItem(this.storageKey);
    }
}

/**
 * 创建默认的城市数据缓存实例
 */
export const createCityDataCache = <T>() => {
    return new LRUCache<T>({ maxSize: 5 });
};

export default LRUCache;
