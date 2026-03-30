/**
 * 统一 API Service 层
 * 
 * 【工程化改进 S1】所有 API 调用收口到此文件，统一处理：
 * - Token 自动注入（从 localStorage 读取）
 * - 响应格式统一解析（兼容 {ok, ...} 和 {code, data, message}）
 * - 401 自动跳转登录
 * - 错误信息标准化
 */

// ======================== 基础请求封装 ========================

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

/** 统一响应格式（将后端新旧格式归一化） */
export interface ApiResponse<T = any> {
    ok: boolean;
    code: number;
    data: T;
    message: string;
    /** 原始响应体（调试用） */
    raw?: any;
}

async function request<T = any>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers = { ...getAuthHeaders(), ...options.headers };
    
    const res = await fetch(url, { ...options, headers });

    // 401 未授权：自动清除登录态
    if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
        throw new Error('登录已过期，请重新登录');
    }

    const text = await res.text();
    let body: any;
    try {
        body = JSON.parse(text);
    } catch {
        if (res.status === 504 || res.status === 502) {
            throw new Error('后台算法服务未启动 (网关超时)，请确保运行了 python server.py');
        }
        throw new Error(`非预期的服务器响应 (状态码 ${res.status})`);
    }

    // 归一化：兼容 {ok: true, ...} 和 {code: 0, data: ..., message: ...} 两种格式
    const isOk = body.ok === true || body.code === 0;
    return {
        ok: isOk,
        code: body.code ?? (isOk ? 0 : -1),
        data: body.data ?? body,
        message: body.message || body.error || '',
        raw: body,
    };
}

// ======================== Task API ========================

export interface TaskItem {
    id: string;
    city: string;
    flight_id: string;
    start_lat: number;
    start_lon: number;
    end_lat: number;
    end_lon: number;
    start_poi_id: string;
    end_poi_id: string;
    status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'REJECTED';
    trajectory_data: { id: string; path: [number, number, number][]; timestamps: number[] } | null;
    creator_username: string;
    created_at: string;
    updated_at: string;
}

/** 获取任务列表 */
export async function fetchTasks(statusFilter?: string): Promise<TaskItem[]> {
    const url = statusFilter
        ? `/api/tasks?status=${statusFilter}`
        : '/api/tasks';
    const resp = await request<{ tasks: TaskItem[] }>(url);
    return resp.data?.tasks || [];
}

/** 创建航线任务 */
export async function createTask(params: {
    city: string;
    from_lat: number; from_lon: number; from_id: string;
    to_lat: number; to_lon: number; to_id: string;
}): Promise<ApiResponse<{ task_id: string; status: string }>> {
    return request('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/** 更新任务状态 */
export async function updateTaskStatus(taskId: string, newStatus: string): Promise<ApiResponse> {
    return request(`/api/tasks/${taskId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
    });
}

// ======================== ROI / Analysis API ========================

export interface RoiResult {
    covered_pois: number;
    commercial_pois: number;
    avg_dist_reduction_pct: number;
    est_daily_orders: number;
    est_capex_w: number;
    est_payback_years: number;
    radius_m: number;
}

/** ROI 沙盘分析 */
export async function analyzeRoi(params: {
    city: string; lat: number; lon: number; radius_m: number;
}): Promise<ApiResponse<RoiResult>> {
    return request('/api/analysis/roi', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

// ======================== Health API ========================

/** 系统健康检查 */
export async function healthCheck(): Promise<ApiResponse<{
    status: string;
    version: string;
    database: string;
    cached_cities: string[];
    uptime_seconds: number;
}>> {
    return request('/api/health');
}
