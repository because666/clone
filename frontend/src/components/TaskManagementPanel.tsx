import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { fetchTasks as fetchTasksApi, updateTaskStatus as updateTaskStatusApi } from '../services/api';
import { CITY_LABEL_MAP } from '../constants/map';
import { RefreshCw, CheckCircle2, XCircle, Activity, LayoutList, ChevronLeft, ChevronRight, Navigation, Search, Eye } from 'lucide-react';

interface Task {
    id: string;
    flight_id: string;
    city: string;
    start_lat: number;
    start_lon: number;
    end_lat: number;
    end_lon: number;
    status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'REJECTED';
    creator_username: string;
    created_at: string;
    trajectory_data?: {
        id: string;
        path: [number, number, number][];
        timestamps: number[];
        explored_nodes?: [number, number][];
    } | null;
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
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    // Pagination State for global flights
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 22;

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const taskList = await fetchTasksApi();
            setTasks(taskList as Task[]);
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    }, [setTasks, setLoading]);

    useEffect(() => {
        if (!isVisible) return;
        fetchTasks();
    }, [isVisible, fetchTasks]);

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
        if (currentPage > totalPages) setCurrentPage(1);
    }, [filteredTrajectories.length, totalPages, currentPage]);

    const paginatedTrajectories = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredTrajectories.slice(startIndex, startIndex + PAGE_SIZE);
    }, [filteredTrajectories, currentPage]);

    const pendingCount = useMemo(() => tasks.filter(t => t.status === 'PENDING').length, [tasks]);

    // 【简化】批准即执行：调用后端状态流转为 EXECUTING
    const handleTaskApprove = useCallback(async (taskId: string) => {
        try {
            const resp = await updateTaskStatusApi(taskId, 'EXECUTING');
            if (resp.ok) {
                fetchTasks();
            } else {
                alert(`失败: ${resp.message}`);
            }
        } catch (err: any) {
            alert(`操作失败: ${err.message}`);
        }
    }, [fetchTasks]);

    const handleTaskReject = useCallback(async (taskId: string) => {
        try {
            const resp = await updateTaskStatusApi(taskId, 'REJECTED');
            if (resp.ok) {
                fetchTasks();
            } else {
                alert(`失败: ${resp.message}`);
            }
        } catch (err: any) {
            alert(`操作失败: ${err.message}`);
        }
    }, [fetchTasks]);

    // 审批 Tab 的点击跟踪：将任务的 trajectory_data 传给 onFocusFlight
    const handleTaskFocus = useCallback((task: Task) => {
        if (!onFocusFlight || !task.trajectory_data) return;
        onFocusFlight(task.trajectory_data);
    }, [onFocusFlight]);

    const handleTabApproval = useCallback(() => setActiveTab('approval'), []);
    const handleTabGlobal = useCallback(() => setActiveTab('global'), []);
    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value), []);
    const handleSearchClear = useCallback(() => setSearchQuery(''), []);
    const handlePagePrev = useCallback(() => setCurrentPage(p => Math.max(1, p - 1)), []);
    const handlePageNext = useCallback(() => setCurrentPage(p => Math.min(totalPages, p + 1)), [totalPages]);



    if (!isVisible) return null;

    const hasActionPermissions = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDING': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-yellow-400/20 text-yellow-700 border border-yellow-400/50">待审批</span>;
            case 'EXECUTING': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-indigo-500/20 text-indigo-700 border border-indigo-500/50 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">飞行中 🚀</span>;
            case 'COMPLETED': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-emerald-400/20 text-emerald-700 border border-emerald-400/50">已完成</span>;
            case 'REJECTED': return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-rose-400/20 text-rose-700 border border-rose-400/50">已拒绝</span>;
            default: return <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-extrabold bg-slate-400/20 text-slate-700">{status}</span>;
        }
    };

    return (
        <div className="absolute top-16 left-6 z-40 w-[780px] max-w-[calc(100vw-380px)] max-h-[calc(100vh-120px)] flex flex-col bg-white/40 backdrop-blur-3xl border border-white/60 px-6 py-5 rounded-[2.5rem] shadow-[0_16px_40px_0_rgba(31,38,135,0.2)] text-slate-800 pointer-events-auto transition-all animate-in fade-in slide-in-from-left-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/70 to-white/20 pointer-events-none"></div>

            <div className="relative z-10 flex flex-col h-full overflow-hidden">
                {/* 头部标题与统计卡片 */}
                <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-white/50 shrink-0">
                    <h3 className="text-lg font-black text-slate-800 tracking-wider flex items-center gap-2.5 drop-shadow-sm">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                        航线调度中心
                    </h3>

                    <div className="flex items-center gap-3">
                        <div className="flex gap-3">
                            <div className="bg-white/70 rounded-2xl px-4 py-1.5 border border-white shadow-sm flex items-center gap-2.5 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 to-transparent"></div>
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest relative z-10 flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                                    {CITY_LABEL_MAP[currentCity] || currentCity}在飞
                                </span>
                                <span className="text-xl font-black text-emerald-600 relative z-10 drop-shadow-sm">{activeUAVCount}</span>
                            </div>
                            
                            <div className="bg-white/70 rounded-2xl px-4 py-1.5 border border-white shadow-sm flex items-center gap-2.5 relative overflow-hidden">
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest relative z-10">待审批</span>
                                <span className="text-xl font-black text-slate-700 relative z-10 drop-shadow-sm">{pendingCount}</span>
                            </div>
                        </div>

                        <div className="h-7 w-px bg-slate-300/80"></div>

                        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors bg-white/70 p-2 rounded-full hover:bg-white shadow border border-white">
                            <XCircle size={18} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* 任务表格主体 */}
                <div className="flex-1 bg-white/70 rounded-[1.5rem] border border-white shadow-[inset_0_2px_15px_rgba(255,255,255,0.7)] overflow-hidden flex flex-col min-h-[440px]">
                    <div className="px-4 py-2.5 border-b-2 border-white/80 flex justify-between items-center bg-white/50">
                        <div className="flex gap-2.5 bg-slate-200/50 p-1 rounded-xl shadow-inner">
                            <button 
                                onClick={handleTabApproval} 
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${activeTab === 'approval' ? 'bg-white text-indigo-700 shadow-sm border border-white' : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'}`}
                            >
                                <LayoutList size={14} /> 航线审批
                            </button>
                            <button 
                                onClick={handleTabGlobal} 
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${activeTab === 'global' ? 'bg-white text-emerald-700 shadow-sm border border-white' : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'}`}
                            >
                                <Activity size={14} /> 全域监控
                            </button>
                        </div>

                        {/* 搜索框与刷新按钮区域 */}
                        <div className="flex items-center gap-2.5">
                            {activeTab === 'global' && (
                                <div className="relative flex items-center">
                                    <div className="absolute left-2.5 text-slate-400">
                                        <Search size={13} strokeWidth={2.5} />
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="搜索航班..." 
                                        value={searchQuery}
                                        onChange={handleSearchChange}
                                        className="pl-8 pr-3 py-1.5 bg-white/80 border border-white shadow-sm rounded-lg text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all w-44"
                                    />
                                    {searchQuery && (
                                        <button 
                                            onClick={handleSearchClear}
                                            className="absolute right-2 text-slate-400 hover:text-slate-600"
                                        >
                                            <XCircle size={13} />
                                        </button>
                                    )}
                                </div>
                            )}
                            {activeTab === 'approval' && (
                                <button onClick={fetchTasks} className="text-slate-500 hover:text-indigo-700 transition-colors p-1.5 bg-white/50 rounded-lg shadow-sm border border-white" title="刷新列表">
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto soft-scrollbar relative bg-slate-50/40">
                        <table className="w-full text-left border-collapse cursor-default">
                            <thead className="sticky top-0 bg-[#ffffff] border-b-2 border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] z-20">
                                {activeTab === 'approval' ? (
                                    <tr className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500">
                                        <th className="px-4 py-3">任务编号</th>
                                        <th className="px-4 py-3">起降坐标</th>
                                        <th className="px-4 py-3">发起人</th>
                                        <th className="px-4 py-3">状态</th>
                                        <th className="px-4 py-3 text-right">操作</th>
                                    </tr>
                                ) : (
                                    <tr className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500">
                                        <th className="px-4 py-3">航班序列号</th>
                                        <th className="px-4 py-3">起降坐标</th>
                                        <th className="px-4 py-3">航迹信息</th>
                                        <th className="px-4 py-3">状态</th>
                                        <th className="px-4 py-3 text-right">控制</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-slate-200/60">
                                {activeTab === 'approval' ? (
                                    // ================== APPROVAL TAB ==================
                                    <>
                                        {tasks.length === 0 && !loading && (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-slate-500">
                                                    暂无任务，请在大屏上点击绿色的起降建筑创建飞行需求。
                                                </td>
                                            </tr>
                                        )}
                                        {tasks.map(task => (
                                            <tr 
                                                key={task.id} 
                                                className={`hover:bg-indigo-50/50 transition-colors group ${task.trajectory_data ? 'cursor-pointer' : ''}`}
                                                onClick={() => handleTaskFocus(task)}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-[12px] font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md border border-slate-300">
                                                            {task.flight_id || task.id.substring(0, 8)}
                                                        </span>
                                                        {task.trajectory_data?.explored_nodes?.length ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-sm" title="含 A* 寻路可视化">
                                                                A✦
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-mono text-[10px] text-slate-600 space-y-0.5">
                                                        <div className="flex items-center gap-1">
                                                            <span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-[7px]">起</span>
                                                            {task.start_lat.toFixed(4)}, {task.start_lon.toFixed(4)}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black text-[7px]">终</span>
                                                            {task.end_lat.toFixed(4)}, {task.end_lon.toFixed(4)}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-[12px] font-bold text-slate-800">{task.creator_username}</td>
                                                <td className="px-4 py-3">{getStatusBadge(task.status)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-1.5 items-center">
                                                        {/* 有轨迹数据时显示查看按钮 */}
                                                        {task.trajectory_data && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleTaskFocus(task); }}
                                                                className="p-1 bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white rounded-lg transition-all shadow-sm border border-sky-200"
                                                                title="查看航线 & A*"
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                        )}
                                                        {hasActionPermissions && task.status === 'PENDING' && (
                                                            <>
                                                                <button onClick={(e) => { e.stopPropagation(); handleTaskApprove(task.id); }} className="p-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg transition-all shadow-sm border border-emerald-200" title="批准起飞">
                                                                    <CheckCircle2 size={14} />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleTaskReject(task.id); }} className="p-1 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm border border-rose-200" title="驳回">
                                                                    <XCircle size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {task.status === 'EXECUTING' && (
                                                            <span className="text-[10px] text-indigo-500 font-bold italic animate-pulse">飞行中...</span>
                                                        )}
                                                        {['COMPLETED', 'REJECTED'].includes(task.status) && (
                                                            <span className="text-[10px] text-slate-400 font-medium italic">已结束</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                ) : (
                                    // ================== GLOBAL TAB ==================
                                    <>
                                        {paginatedTrajectories.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-slate-500">
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
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-[12px] font-bold text-emerald-900 bg-[#e0f2fe]/60 px-1.5 py-0.5 rounded-md border border-[#bae6fd]">
                                                        {traj.id || `UAV-${(Math.random()*10000).toFixed(0)}`}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-mono text-[10px] text-slate-600 space-y-0.5">
                                                        <div className="flex items-center gap-1">
                                                            <span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-[7px]">起</span>
                                                            {traj.path?.[0]?.[1]?.toFixed(4) ?? '---'}, {traj.path?.[0]?.[0]?.toFixed(4) ?? '---'}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black text-[7px]">终</span>
                                                            {traj.path?.[traj.path.length - 1]?.[1]?.toFixed(4) ?? '---'}, {traj.path?.[traj.path.length - 1]?.[0]?.toFixed(4) ?? '---'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-[11px] font-bold text-slate-600">
                                                    {traj.path?.length || 0} 节点 · 
                                                    <span className="font-mono text-[10px] font-semibold text-slate-500 ml-1">
                                                        {traj.timestamps && traj.timestamps.length > 1 
                                                            ? `${((traj.timestamps[traj.timestamps.length - 1] - traj.timestamps[0]) / 60).toFixed(1)}min`
                                                            : '未知'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center px-1.5 py-1 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></div>
                                                        运行中
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end items-center gap-1 text-slate-400 font-bold text-[10px] opacity-0 group-hover:opacity-100 group-hover:text-amber-600 transition-all">
                                                        <Navigation size={12} className="group-hover:translate-x-0.5 transition-transform" /> 
                                                        <span>追踪</span>
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
                        <div className="px-4 py-2.5 border-t-2 border-white/80 bg-white flex justify-between items-center text-[12px] font-bold text-slate-600">
                            <div>
                                {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredTrajectories.length)} / {filteredTrajectories.length} 架 {searchQuery && '(搜索)'}
                            </div>
                            <div className="flex gap-1">
                                <button 
                                    onClick={handlePagePrev}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded-md bg-white border border-slate-300 disabled:opacity-50 hover:bg-slate-50 hover:shadow-sm transition-all text-slate-700"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-2.5 py-0.5 font-black font-mono bg-slate-50 shadow-inner rounded-md border border-slate-200 text-[11px]">
                                    {currentPage}/{totalPages}
                                </span>
                                <button 
                                    onClick={handlePageNext}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded-md bg-white border border-slate-300 disabled:opacity-50 hover:bg-slate-50 hover:shadow-sm transition-all text-slate-700"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            

        </div>
    );
}
