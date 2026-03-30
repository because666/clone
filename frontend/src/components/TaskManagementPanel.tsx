import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { fetchTasks as fetchTasksApi, updateTaskStatus as updateTaskStatusApi } from '../services/api';
import { CITY_LABEL_MAP } from '../constants/map';
import { RefreshCw, Play, CheckCircle2, XCircle, Activity, LayoutList, ChevronLeft, ChevronRight, Navigation, Search } from 'lucide-react';

interface Task {
    id: string;
    flight_id: string;
    city: string;
    start_lat: number;
    start_lon: number;
    end_lat: number;
    end_lon: number;
    status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'REJECTED';
    creator_username: string;
    created_at: string;
}

interface TaskManagementPanelProps {
    isVisible: boolean;
    onClose: () => void;
    activeUAVCount: number; 
    trajectories: any[]; 
    currentCity?: string;
    onFocusFlight?: (flight: any) => void; 
}



export default function TaskManagementPanel({
    isVisible,
    onClose,
    activeUAVCount,
    trajectories,
    currentCity = 'shenzhen',
    onFocusFlight
}: TaskManagementPanelProps) {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Tab State
    const [activeTab, setActiveTab] = useState<'approval' | 'global'>('approval');
    
    // Global Search State
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300); // 引入防抖防止过滤引发掉帧

    // Pagination State for global flights
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 22; // 增加信息密度，恢复同屏数据量

    const fetchTasks = async () => {
        setLoading(true);
        try {
            // 【工程化改进 S1】统一 API 调用层
            const taskList = await fetchTasksApi();
            setTasks(taskList as Task[]);
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isVisible) return;
        
        // 初始挂载时拉取全量数据
        fetchTasks();
    }, [isVisible]);

    // 【架构优化 P1-2】使用全局单例 SSE 连接，不再独立创建 EventSource
    useSSESubscription(fetchTasks, isVisible);

    // Apply Search Filter First, using debounced value
    const filteredTrajectories = useMemo(() => {
        if (!debouncedSearchQuery.trim()) return trajectories;
        const query = debouncedSearchQuery.toLowerCase();
        return trajectories.filter(t => (t.id || '').toLowerCase().includes(query));
    }, [trajectories, debouncedSearchQuery]);

    // Then Apply Pagination
    const totalPages = Math.ceil(filteredTrajectories.length / PAGE_SIZE) || 1;
    useEffect(() => {
        // Reset to page 1 if search causes current page to exceed total pages
        if (currentPage > totalPages) setCurrentPage(1);
    }, [filteredTrajectories.length, totalPages, currentPage]);

    const paginatedTrajectories = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredTrajectories.slice(startIndex, startIndex + PAGE_SIZE);
    }, [filteredTrajectories, currentPage]);

    // 【性能优化 P2-E】缓存计算结果，避免 JSX 内每帧重新遍历 tasks 数组
    const pendingCount = useMemo(() => tasks.filter(t => t.status === 'PENDING').length, [tasks]);

    const updateTaskStatusFn = async (taskId: string, newStatus: string) => {
        try {
            // 【工程化改进 S1】统一 API 调用层
            const resp = await updateTaskStatusApi(taskId, newStatus);
            if (resp.ok) {
                fetchTasks();
            } else {
                alert(`失败: ${resp.message}`);
            }
        } catch (err: any) {
            alert(`操作失败: ${err.message}`);
        }
    };

    if (!isVisible) return null;

    const hasActionPermissions = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDING': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-yellow-400/20 text-yellow-700 border border-yellow-400/50">待审批</span>;
            case 'APPROVED': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-blue-400/20 text-blue-700 border border-blue-400/50">已准飞</span>;
            case 'EXECUTING': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-indigo-500/20 text-indigo-700 border border-indigo-500/50 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">执行中 🚀</span>;
            case 'COMPLETED': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-emerald-400/20 text-emerald-700 border border-emerald-400/50">已完成</span>;
            case 'REJECTED': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-rose-400/20 text-rose-700 border border-rose-400/50">已拒绝</span>;
            default: return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-slate-400/20 text-slate-700">{status}</span>;
        }
    };

    return (
        <div className="absolute top-16 left-6 z-40 w-[1080px] max-w-[calc(100vw-380px)] max-h-[calc(100vh-120px)] flex flex-col bg-white/40 backdrop-blur-3xl border border-white/60 px-8 py-6 rounded-[2.5rem] shadow-[0_16px_40px_0_rgba(31,38,135,0.2)] text-slate-800 pointer-events-auto transition-all animate-in fade-in slide-in-from-left-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/70 to-white/20 pointer-events-none"></div>

            <div className="relative z-10 flex flex-col h-full overflow-hidden">
                {/* 头部标题与统计卡片 */}
                <div className="flex justify-between items-center mb-5 pb-4 border-b-2 border-white/50 shrink-0">
                    <h3 className="text-xl font-black text-slate-800 tracking-wider flex items-center gap-3" style={{ textShadow: '0 2px 5px rgba(255,255,255,0.9)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                        航线调度中心
                    </h3>

                    <div className="flex items-center gap-4">
                        <div className="flex gap-4">
                            <div className="bg-white/70 rounded-2xl px-5 py-2 border border-white shadow-sm flex items-center gap-3 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 to-transparent"></div>
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest relative z-10 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                                    {CITY_LABEL_MAP[currentCity] || currentCity}全域在飞
                                </span>
                                <span className="text-2xl font-black text-emerald-600 relative z-10 drop-shadow-sm">{activeUAVCount}</span>
                            </div>
                            
                            <div className="bg-white/70 rounded-2xl px-5 py-2 border border-white shadow-sm flex items-center gap-3 relative overflow-hidden">
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-widest relative z-10">排队待审批</span>
                                <span className="text-2xl font-black text-slate-700 relative z-10 drop-shadow-sm">{pendingCount}</span>
                            </div>
                        </div>

                        <div className="h-8 w-px bg-slate-300/80 mx-2"></div>

                        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors bg-white/70 p-2.5 rounded-full hover:bg-white shadow border border-white">
                            <XCircle size={20} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* 任务表格主体 */}
                <div className="flex-1 bg-white/70 rounded-[1.5rem] border border-white shadow-[inset_0_2px_15px_rgba(255,255,255,0.7)] overflow-hidden flex flex-col min-h-[440px]">
                    <div className="px-5 py-3 border-b-2 border-white/80 flex justify-between items-center bg-white/50">
                        <div className="flex gap-3 bg-slate-200/50 p-1.5 rounded-xl shadow-inner">
                            <button 
                                onClick={() => setActiveTab('approval')} 
                                className={`flex items-center gap-2 px-5 py-1.5 rounded-lg text-[13px] font-bold transition-all ${activeTab === 'approval' ? 'bg-white text-indigo-700 shadow-sm border border-white' : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'}`}
                            >
                                <LayoutList size={16} /> 业务航线审批流
                            </button>
                            <button 
                                onClick={() => setActiveTab('global')} 
                                className={`flex items-center gap-2 px-5 py-1.5 rounded-lg text-[13px] font-bold transition-all ${activeTab === 'global' ? 'bg-white text-emerald-700 shadow-sm border border-white' : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'}`}
                            >
                                <Activity size={16} /> 实时全域监控
                            </button>
                        </div>

                        {/* 搜索框与刷新按钮区域 */}
                        <div className="flex items-center gap-3">
                            {activeTab === 'global' && (
                                <div className="relative flex items-center">
                                    <div className="absolute left-3 text-slate-400">
                                        <Search size={14} strokeWidth={2.5} />
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="搜索航班序列号..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 pr-4 py-1.5 bg-white/80 border border-white shadow-sm rounded-lg text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all w-56"
                                    />
                                    {searchQuery && (
                                        <button 
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                                        >
                                            <XCircle size={14} />
                                        </button>
                                    )}
                                </div>
                            )}
                            {activeTab === 'approval' && (
                                <button onClick={fetchTasks} className="text-slate-500 hover:text-indigo-700 transition-colors p-2 bg-white/50 rounded-lg shadow-sm border border-white" title="刷新列表">
                                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto soft-scrollbar relative bg-slate-50/40">
                        {/* 修正透视问题：完全不透明的白色表头背景。同时把 padding 压实提升密度 */}
                        <table className="w-full text-left border-collapse cursor-default">
                            <thead className="sticky top-0 bg-[#ffffff] border-b-2 border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] z-20">
                                {activeTab === 'approval' ? (
                                    <tr className="text-[11px] uppercase font-extrabold tracking-widest text-slate-500">
                                        <th className="px-5 py-3.5">任务编号</th>
                                        <th className="px-5 py-3.5">起降点坐标</th>
                                        <th className="px-5 py-3.5">发起人</th>
                                        <th className="px-5 py-3.5">状态</th>
                                        <th className="px-5 py-3.5">创建时间</th>
                                        <th className="px-5 py-3.5 text-right">管理操作</th>
                                    </tr>
                                ) : (
                                    <tr className="text-[11px] uppercase font-extrabold tracking-widest text-slate-500">
                                        <th className="px-5 py-3.5">航班序列号</th>
                                        <th className="px-5 py-3.5">起降点坐标</th>
                                        <th className="px-5 py-3.5">航迹与耗时</th>
                                        <th className="px-5 py-3.5">实时状态</th>
                                        <th className="px-5 py-3.5 text-right">视觉控制</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-slate-200/60">
                                {activeTab === 'approval' ? (
                                    // ================== APPROVAL TAB ==================
                                    <>
                                        {tasks.length === 0 && !loading && (
                                            <tr>
                                                <td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                                                    暂无任务，请在大屏上点击绿色的起降建筑创建飞行需求。
                                                </td>
                                            </tr>
                                        )}
                                        {tasks.map(task => (
                                            <tr key={task.id} className="hover:bg-indigo-50/50 transition-colors group">
                                                <td className="px-5 py-3.5">
                                                    <span className="font-mono text-[13px] font-bold text-slate-700 bg-slate-200/80 px-2.5 py-1 rounded-md border border-slate-300">
                                                        {task.flight_id || task.id.substring(0, 8)}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="font-mono text-[11px] text-slate-600 space-y-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-3.5 h-3.5 rounded bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-[8px]">起</span>
                                                            {task.start_lat.toFixed(4)}, {task.start_lon.toFixed(4)}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black text-[8px]">终</span>
                                                            {task.end_lat.toFixed(4)}, {task.end_lon.toFixed(4)}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-[13px] font-bold text-slate-800">{task.creator_username}</td>
                                                <td className="px-5 py-3.5">{getStatusBadge(task.status)}</td>
                                                <td className="px-5 py-3.5 text-[11px] text-slate-600 font-semibold">
                                                    {new Date(task.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td className="px-5 py-3.5 text-right">
                                                    {hasActionPermissions ? (
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {task.status === 'PENDING' && (
                                                                <>
                                                                    <button onClick={() => updateTaskStatusFn(task.id, 'APPROVED')} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg transition-all shadow-sm border border-emerald-200" title="批准">
                                                                        <CheckCircle2 size={16} />
                                                                    </button>
                                                                    <button onClick={() => updateTaskStatusFn(task.id, 'REJECTED')} className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm border border-rose-200" title="驳回">
                                                                        <XCircle size={16} />
                                                                    </button>
                                                                </>
                                                            )}
                                                            {task.status === 'APPROVED' && (
                                                                <button onClick={() => updateTaskStatusFn(task.id, 'EXECUTING')} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg transition-all shadow-sm border border-indigo-200 text-[11px] font-black tracking-wide" title="派发执行">
                                                                    <Play size={12} fill="currentColor" /> 执行
                                                                </button>
                                                            )}
                                                            {task.status === 'EXECUTING' && (
                                                                <button onClick={() => updateTaskStatusFn(task.id, 'COMPLETED')} className="px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-300 rounded-lg transition-all border border-slate-300 text-[11px] font-black shadow-sm" title="标记完成">
                                                                    结束
                                                                </button>
                                                            )}
                                                            {['COMPLETED', 'REJECTED'].includes(task.status) && (
                                                                <span className="text-[10px] text-slate-400 font-medium italic">无操作</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400">无权限</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                ) : (
                                    // ================== GLOBAL TAB ==================
                                    <>
                                        {paginatedTrajectories.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                                                    {searchQuery ? '未找到匹配的航班序列号' : '当前全局无活跃航班'}
                                                </td>
                                            </tr>
                                        )}
                                        {paginatedTrajectories.map((traj, idx) => (
                                            <tr 
                                                key={traj.id || idx} 
                                                onClick={() => onFocusFlight?.(traj)}
                                                className="hover:bg-emerald-50/70 transition-colors group cursor-pointer"
                                            >
                                                <td className="px-5 py-3.5">
                                                    <span className="font-mono text-[13px] font-bold text-emerald-900 bg-[#e0f2fe]/60 px-2 py-1 rounded-md border border-[#bae6fd]">
                                                        {traj.id || `UAV-${(Math.random()*10000).toFixed(0)}`}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="font-mono text-[11px] text-slate-600 space-y-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-3.5 h-3.5 rounded bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-[8px]">起</span>
                                                            {traj.path?.[0]?.[1]?.toFixed(4) ?? '---'}, {traj.path?.[0]?.[0]?.toFixed(4) ?? '---'}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black text-[8px]">终</span>
                                                            {traj.path?.[traj.path.length - 1]?.[1]?.toFixed(4) ?? '---'}, {traj.path?.[traj.path.length - 1]?.[0]?.toFixed(4) ?? '---'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-[12px] font-bold text-slate-600">
                                                    {traj.path?.length || 0} 个三维节点<br/>
                                                    <span className="font-mono text-[11px] font-semibold text-slate-500 mt-1 inline-block bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                        {traj.timestamps && traj.timestamps.length > 1 
                                                            ? `耗时 ${((traj.timestamps[traj.timestamps.length - 1] - traj.timestamps[0]) / 60).toFixed(1)} mins`
                                                            : '未知时长'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className="inline-flex items-center px-2 py-1.5 rounded text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></div>
                                                        实时运行中
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-right">
                                                    <div className="flex justify-end items-center gap-1.5 text-slate-400 font-bold text-[11px] opacity-0 group-hover:opacity-100 group-hover:text-amber-600 transition-all">
                                                        <Navigation size={14} className="group-hover:translate-x-1 transition-transform" /> 
                                                        <span>追踪并高亮</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls for Global Tab */}
                    {activeTab === 'global' && totalPages > 1 && (
                        <div className="px-6 py-3 border-t-2 border-white/80 bg-white flex justify-between items-center text-[13px] font-bold text-slate-600">
                            <div>
                                显示 {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, filteredTrajectories.length)}，共 {filteredTrajectories.length} 架 {searchQuery && '(搜索结果)'}
                            </div>
                            <div className="flex gap-1.5">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded-md bg-white border border-slate-300 disabled:opacity-50 hover:bg-slate-50 hover:shadow-sm transition-all text-slate-700"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="px-3 py-1 font-black font-mono bg-slate-50 shadow-inner rounded-md border border-slate-200">
                                    {currentPage} / {totalPages}
                                </span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded-md bg-white border border-slate-300 disabled:opacity-50 hover:bg-slate-50 hover:shadow-sm transition-all text-slate-700"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            

        </div>
    );
}
