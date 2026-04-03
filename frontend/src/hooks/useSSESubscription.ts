/**
 * 【架构优化 P1-2】全局单例 SSE 订阅 Hook
 * 
 * 问题：MapContainer 和 TaskManagementPanel 各自独立创建 EventSource 连接，
 * 导致同一个浏览器 Tab 同时维护 2 条到 /api/tasks/stream 的 SSE 长连接。
 * 
 * 解法：模块级单例 —— 整个应用只维护一条 SSE 连接。
 * 多个组件通过 useSSESubscription(callback) 注册监听回调。
 * 当连接收到 "update" 消息时，所有已注册的回调函数被依次调用。
 */

import { useEffect, useRef } from 'react';

type SSECallback = () => void;

// ======================== 模块级单例管理器 ========================
const subscribers = new Set<SSECallback>();
let sharedEventSource: EventSource | null = null;
let refCount = 0;
// 【性能优化 OPT-C2】指数退避重连参数
let retryDelay = 1000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function connectSSE() {
    if (sharedEventSource) return; // 已连接

    const token = localStorage.getItem('token') || '';
    const es = new EventSource(`/api/tasks/stream?token=${token}`);

    es.onopen = () => {
        retryDelay = 1000; // 连接成功后重置退避延迟
        console.log('[SSE Singleton] Stream Connected.');
    };

    es.onmessage = (e) => {
        if (e.data === 'update') {
            // 广播到所有订阅者
            subscribers.forEach(cb => {
                try { cb(); } catch (err) {
                    console.warn('[SSE Singleton] Subscriber error:', err);
                }
            });
        }
    };

    // 【OPT-C2】断线自动指数退避重连：延迟 1s→2s→4s→...→30s 上限
    es.onerror = () => {
        console.warn(`[SSE Singleton] Connection Error. Reconnecting in ${retryDelay}ms...`);
        disconnectSSE();
        if (refCount > 0) {
            retryTimer = setTimeout(() => {
                retryTimer = null;
                connectSSE();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
        }
    };

    sharedEventSource = es;
}

function disconnectSSE() {
    if (sharedEventSource) {
        sharedEventSource.close();
        sharedEventSource = null;
    }
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}

// ======================== React Hook ========================

/**
 * 订阅全局 SSE 更新事件
 * 
 * @param onUpdate - 当收到 SSE "update" 消息时的回调函数
 * @param enabled - 是否启用订阅（用于条件渲染场景）
 * 
 * @example
 * ```tsx
 * useSSESubscription(() => {
 *     fetchActiveTasks(); // 收到更新时刷新数据
 * });
 * ```
 */
export function useSSESubscription(onUpdate: SSECallback, enabled: boolean = true) {
    const callbackRef = useRef(onUpdate);
    callbackRef.current = onUpdate; // 始终引用最新的回调，避免闭包陈旧

    useEffect(() => {
        if (!enabled) return;

        // 创建一个稳定的代理函数，内部转发到最新回调
        const stableCallback: SSECallback = () => callbackRef.current();

        subscribers.add(stableCallback);
        refCount++;

        // 首个订阅者负责建立连接
        if (refCount === 1) {
            connectSSE();
        }

        return () => {
            subscribers.delete(stableCallback);
            refCount--;

            // 最后一个订阅者离开时关闭连接
            if (refCount === 0) {
                disconnectSSE();
            }
        };
    }, [enabled]);
}
