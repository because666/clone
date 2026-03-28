/**
 * Worker 获取工具
 * 将大型 JSON 的 fetch + parse 移至 Worker 线程
 * 自动回退到主线程 fetch（如 Worker 不可用）
 */

let worker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<string, {
    resolve: (data: unknown) => void;
    reject: (error: Error) => void;
}>();

/**
 * 初始化 Worker（懒加载，首次调用时创建）
 */
function getWorker(): Worker | null {
    if (worker) return worker;
    try {
        worker = new Worker(
            new URL('../workers/jsonWorker.ts', import.meta.url),
            { type: 'module' }
        );
        worker.onmessage = (e: MessageEvent<{ id: string; data: unknown; error: string | null }>) => {
            const { id, data, error } = e.data;
            const pending = pendingRequests.get(id);
            if (!pending) return;
            pendingRequests.delete(id);
            if (error) {
                pending.reject(new Error(error));
            } else {
                pending.resolve(data);
            }
        };
        worker.onerror = () => {
            // Worker 出错时回退
            worker = null;
        };
        return worker;
    } catch {
        // Worker 创建失败（如 Safari 私密模式），静默回退
        return null;
    }
}

/**
 * 使用 Worker 获取并解析 JSON
 * 如果 Worker 不可用则自动回退到主线程 fetch
 * @param url - 资源 URL
 * @param signal - AbortSignal（可选）
 * @returns 解析后的 JSON 数据
 */
export function fetchJsonWithWorker<T>(url: string, signal?: AbortSignal): Promise<T> {
    const w = getWorker();

    // 回退到主线程
    if (!w) {
        return fetch(url, { signal }).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
            return r.json() as Promise<T>;
        });
    }

    const id = `req_${++requestId}`;

    return new Promise<T>((resolve, reject) => {
        pendingRequests.set(id, { resolve: resolve as (data: unknown) => void, reject });
        w.postMessage({ url, id });

        // 支持 AbortSignal
        if (signal) {
            const onAbort = () => {
                pendingRequests.delete(id);
                reject(new DOMException('请求已取消', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}
