/**
 * MobilePage.tsx — C 端移动端 H5 下单页面
 *
 * 设计语言：严格复用 PC 端毛玻璃 + Tailwind 样式体系
 * 布局：顶部品牌栏 → 主内容区 → 底部 TabBar
 * 流程：选城市 → 选取/收件点 → 确认下单 → 订单追踪
 */
import { useState, useEffect, useCallback } from 'react';
import { CITIES, CITY_LABEL_MAP } from '../constants/map';
import {
    MapPin, Send, Package, Clock, CheckCircle2,
    ChevronRight, Loader2, RefreshCw, Navigation, ArrowLeft,
} from 'lucide-react';

// ======================== 类型 ========================

interface MobileOrder {
    id: string;
    city: string;
    flight_id: string;
    start_lat: number;
    start_lon: number;
    end_lat: number;
    end_lon: number;
    status: string;
    created_at: string;
    updated_at: string;
}

type TabType = 'order' | 'track';
type OrderStep = 'city' | 'points' | 'confirm';

// ======================== API ========================

function getMobileToken(): string | null {
    return localStorage.getItem('mobile_token');
}

async function mobileRequest<T = any>(url: string, options: RequestInit = {}): Promise<{ ok: boolean; data: T; message: string }> {
    const token = getMobileToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    const body = await res.json();
    return { ok: body.code === 0, data: body.data, message: body.message || '' };
}

async function quickLogin(nickname: string) {
    return mobileRequest('/api/mobile/quick-login', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
    });
}

async function createOrder(params: {
    city: string; from_lat: number; from_lon: number; from_id: string;
    to_lat: number; to_lon: number; to_id: string;
}) {
    return mobileRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

async function fetchMyOrders() {
    return mobileRequest<{ orders: MobileOrder[] }>('/api/mobile/my-orders');
}

// ======================== 预设 POI ========================

interface PoiItem { name: string; lat: number; lon: number; category: string }

const PRESET_POIS: Record<string, PoiItem[]> = {
    shenzhen: [
        { name: '科技园地铁站', lat: 22.5420, lon: 113.9510, category: '交通枢纽' },
        { name: '深圳湾万象城', lat: 22.5170, lon: 113.9380, category: '商业综合体' },
        { name: '南山医院', lat: 22.5310, lon: 113.9210, category: '医疗机构' },
        { name: '蛇口码头', lat: 22.4850, lon: 113.9170, category: '交通枢纽' },
        { name: '深圳大学', lat: 22.5325, lon: 113.9345, category: '教育机构' },
        { name: '海岸城购物中心', lat: 22.5180, lon: 113.9330, category: '商业综合体' },
    ],
    beijing: [
        { name: '国贸 CBD', lat: 39.9087, lon: 116.4605, category: '商务区' },
        { name: '三里屯太古里', lat: 39.9350, lon: 116.4540, category: '商业综合体' },
        { name: '北京协和医院', lat: 39.9070, lon: 116.4160, category: '医疗机构' },
        { name: '中关村软件园', lat: 39.9820, lon: 116.3100, category: '科技园区' },
    ],
    shanghai: [
        { name: '陆家嘴金融城', lat: 31.2350, lon: 121.5050, category: '商务区' },
        { name: '南京路步行街', lat: 31.2340, lon: 121.4750, category: '商业综合体' },
        { name: '瑞金医院', lat: 31.2150, lon: 121.4680, category: '医疗机构' },
        { name: '张江高科园', lat: 31.2050, lon: 121.5910, category: '科技园区' },
    ],
    guangzhou: [
        { name: '珠江新城', lat: 23.1190, lon: 113.3210, category: '商务区' },
        { name: '天河城', lat: 23.1380, lon: 113.3250, category: '商业综合体' },
        { name: '中山一院', lat: 23.1310, lon: 113.2800, category: '医疗机构' },
    ],
    chengdu: [
        { name: '春熙路', lat: 30.6570, lon: 104.0820, category: '商业综合体' },
        { name: '天府广场', lat: 30.6570, lon: 104.0660, category: '城市核心' },
        { name: '华西医院', lat: 30.6420, lon: 104.0650, category: '医疗机构' },
    ],
    chongqing: [
        { name: '解放碑', lat: 29.5580, lon: 106.5780, category: '商业综合体' },
        { name: '江北嘴 CBD', lat: 29.5700, lon: 106.5740, category: '商务区' },
        { name: '观音桥', lat: 29.5720, lon: 106.5490, category: '商业综合体' },
    ],
};

// ======================== 主组件 ========================

export default function MobilePage() {
    const [isLoggedIn, setIsLoggedIn] = useState(!!getMobileToken());
    const [nickname, setNickname] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const [activeTab, setActiveTab] = useState<TabType>('order');
    const [step, setStep] = useState<OrderStep>('city');
    const [selectedCity, setSelectedCity] = useState('shenzhen');
    const [fromPoi, setFromPoi] = useState<PoiItem | null>(null);
    const [toPoi, setToPoi] = useState<PoiItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);

    const [orders, setOrders] = useState<MobileOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);

    // URL token 自动登录
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
            localStorage.setItem('mobile_token', urlToken);
            setIsLoggedIn(true);
        }
    }, []);

    const handleQuickLogin = async () => {
        setIsLoggingIn(true);
        try {
            const res = await quickLogin(nickname || '访客');
            if (res.ok) {
                localStorage.setItem('mobile_token', res.data.token);
                setIsLoggedIn(true);
            }
        } catch { /* ignore */ } finally {
            setIsLoggingIn(false);
        }
    };

    const loadOrders = useCallback(async () => {
        setOrdersLoading(true);
        try {
            const res = await fetchMyOrders();
            if (res.ok) setOrders(res.data.orders || []);
        } catch { /* ignore */ } finally {
            setOrdersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn && activeTab === 'track') loadOrders();
    }, [isLoggedIn, activeTab, loadOrders]);

    const handleSubmitOrder = async () => {
        if (!fromPoi || !toPoi) return;
        setIsSubmitting(true);
        setSubmitResult(null);
        try {
            const res = await createOrder({
                city: selectedCity,
                from_lat: fromPoi.lat, from_lon: fromPoi.lon, from_id: fromPoi.name,
                to_lat: toPoi.lat, to_lon: toPoi.lon, to_id: toPoi.name,
            });
            setSubmitResult({
                ok: res.ok,
                message: res.ok ? '任务已提交至调度中心，等待审批' : res.message,
            });
            if (res.ok) {
                setTimeout(() => {
                    setActiveTab('track');
                    setStep('city');
                    setFromPoi(null);
                    setToPoi(null);
                    setSubmitResult(null);
                }, 2000);
            }
        } catch {
            setSubmitResult({ ok: false, message: '网络错误' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ==================== 登录页 ====================
    if (!isLoggedIn) {
        return (
            <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center px-6">
                {/* 品牌 */}
                <div className="flex flex-col items-center mb-10">
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center shadow-lg mb-4">
                        <Navigation size={24} className="text-white" />
                    </div>
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">苍穹织网</h1>
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-1">AetherWeave · C-Terminal</p>
                </div>

                {/* 登录卡片 */}
                <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <h2 className="text-base font-bold text-slate-800 mb-1">快速进入</h2>
                    <p className="text-xs text-slate-400 mb-5">输入昵称以开始使用配送服务</p>
                    <input
                        type="text"
                        placeholder="您的昵称"
                        value={nickname}
                        onChange={e => setNickname(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg text-sm text-slate-800 bg-slate-50 border border-slate-200 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-100 mb-4"
                    />
                    <button
                        onClick={handleQuickLogin}
                        disabled={isLoggingIn}
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-900 disabled:opacity-50 transition-colors"
                    >
                        {isLoggingIn ? '连接中...' : '进入系统'}
                    </button>
                </div>

                <p className="text-[10px] text-slate-300 mt-8">低空经济AI数字孪生引擎 · 用户终端</p>
            </div>
        );
    }

    // ==================== 主界面 ====================
    const cityPois = PRESET_POIS[selectedCity] || PRESET_POIS.shenzhen;

    return (
        <div className="min-h-dvh bg-slate-50" style={{ fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
            {/* 顶栏 */}
            <header className="bg-white/80 backdrop-blur-xl border-b border-slate-100 px-5 pt-12 pb-4 sticky top-0 z-50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center">
                            <span className="text-white text-[9px] font-black">AW</span>
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-slate-800 tracking-tight leading-none">苍穹织网</h1>
                            <p className="text-[8px] font-bold text-slate-400 tracking-widest uppercase">AetherWeave</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-full px-3 py-1 text-[11px] font-bold text-slate-600">
                        {CITY_LABEL_MAP[selectedCity] || '深圳'}
                    </div>
                </div>
            </header>

            {/* 主内容 */}
            <main className="px-4 pt-4 pb-24">
                {activeTab === 'order' ? (
                    <OrderFlow
                        step={step} setStep={setStep}
                        selectedCity={selectedCity} setSelectedCity={setSelectedCity}
                        fromPoi={fromPoi} setFromPoi={setFromPoi}
                        toPoi={toPoi} setToPoi={setToPoi}
                        cityPois={cityPois}
                        isSubmitting={isSubmitting}
                        submitResult={submitResult}
                        onSubmit={handleSubmitOrder}
                    />
                ) : (
                    <OrderTrack orders={orders} loading={ordersLoading} onRefresh={loadOrders} />
                )}
            </main>

            {/* 底部 TabBar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 flex justify-around py-2 pb-7 z-50">
                <TabBtn icon={<Send size={20} />} label="发起配送" active={activeTab === 'order'} onClick={() => setActiveTab('order')} />
                <TabBtn icon={<Package size={20} />} label="我的订单" active={activeTab === 'track'} onClick={() => { setActiveTab('track'); loadOrders(); }} />
            </nav>
        </div>
    );
}

// ======================== 下单流程 ========================

function OrderFlow({
    step, setStep, selectedCity, setSelectedCity,
    fromPoi, setFromPoi, toPoi, setToPoi, cityPois,
    isSubmitting, submitResult, onSubmit,
}: {
    step: OrderStep; setStep: (s: OrderStep) => void;
    selectedCity: string; setSelectedCity: (c: string) => void;
    fromPoi: PoiItem | null; setFromPoi: (p: PoiItem | null) => void;
    toPoi: PoiItem | null; setToPoi: (p: PoiItem | null) => void;
    cityPois: PoiItem[];
    isSubmitting: boolean;
    submitResult: { ok: boolean; message: string } | null;
    onSubmit: () => void;
}) {
    const stepIndex = ['city', 'points', 'confirm'].indexOf(step);

    return (
        <div>
            {/* 步骤条 */}
            <div className="flex items-center justify-center gap-2 mb-5">
                {['选择城市', '选择地点', '确认提交'].map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            i === stepIndex ? 'bg-slate-800 text-white' :
                            i < stepIndex ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-400'
                        }`}>
                            {i < stepIndex ? <CheckCircle2 size={12} /> : i + 1}
                        </div>
                        <span className={`text-[10px] font-bold ${i === stepIndex ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                        {i < 2 && <div className={`w-6 h-0.5 rounded ${i < stepIndex ? 'bg-slate-800' : 'bg-slate-200'}`} />}
                    </div>
                ))}
            </div>

            {/* Step 1: 城市 */}
            {step === 'city' && (
                <GlassCard>
                    <CardTitle title="选择配送城市" subtitle="覆盖全国 6 个核心城市运营节点" />
                    <div className="grid grid-cols-2 gap-2.5 mt-4">
                        {CITIES.map(c => (
                            <button
                                key={c.id}
                                onClick={() => { setSelectedCity(c.id); setFromPoi(null); setToPoi(null); }}
                                className={`text-left px-3.5 py-3 rounded-xl border-2 transition-all text-sm font-bold ${
                                    selectedCity === c.id
                                        ? 'border-slate-800 bg-slate-50 text-slate-800'
                                        : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setStep('points')} className="mt-5 w-full py-2.5 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5">
                        下一步 <ChevronRight size={14} />
                    </button>
                </GlassCard>
            )}

            {/* Step 2: 选点 */}
            {step === 'points' && (
                <GlassCard>
                    <CardTitle title="选择收发地点" subtitle="分别指定取件点与收件目标" />

                    <div className="mt-4 mb-3">
                        <PointLabel color="bg-emerald-500" text="取件点" />
                        <div className="flex flex-col gap-1.5 mt-2">
                            {cityPois.map(poi => (
                                <PoiRow key={poi.name} poi={poi} selected={fromPoi?.name === poi.name} disabled={toPoi?.name === poi.name} onClick={() => setFromPoi(poi)} />
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <PointLabel color="bg-rose-500" text="收件点" />
                        <div className="flex flex-col gap-1.5 mt-2">
                            {cityPois.map(poi => (
                                <PoiRow key={poi.name} poi={poi} selected={toPoi?.name === poi.name} disabled={fromPoi?.name === poi.name} onClick={() => setToPoi(poi)} />
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2.5">
                        <button onClick={() => setStep('city')} className="flex-[0.4] py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1">
                            <ArrowLeft size={14} /> 返回
                        </button>
                        <button
                            onClick={() => fromPoi && toPoi && setStep('confirm')}
                            disabled={!fromPoi || !toPoi}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5"
                        >
                            下一步 <ChevronRight size={14} />
                        </button>
                    </div>
                </GlassCard>
            )}

            {/* Step 3: 确认 */}
            {step === 'confirm' && (
                <GlassCard>
                    <CardTitle title="确认配送信息" subtitle="核实航线参数后提交至调度中心" />

                    {/* 路线摘要 */}
                    <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center gap-0.5 pt-0.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                                <div className="w-0.5 h-8 bg-gradient-to-b from-emerald-400 to-rose-400 rounded" />
                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                            </div>
                            <div className="flex-1">
                                <div className="mb-4">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">取件</p>
                                    <p className="text-sm font-bold text-slate-800">{fromPoi?.name}</p>
                                    <p className="text-[10px] text-slate-400">{fromPoi?.category}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">收件</p>
                                    <p className="text-sm font-bold text-slate-800">{toPoi?.name}</p>
                                    <p className="text-[10px] text-slate-400">{toPoi?.category}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 参数行 */}
                    <div className="flex justify-between mt-4 px-1">
                        <ParamChip label="城市" value={CITY_LABEL_MAP[selectedCity]} />
                        <ParamChip label="运力类型" value="无人机" />
                        <ParamChip label="预计时效" value="15-30 min" />
                    </div>

                    {submitResult && (
                        <div className={`mt-4 px-4 py-3 rounded-xl text-xs font-bold ${
                            submitResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
                        }`}>
                            {submitResult.message}
                        </div>
                    )}

                    <div className="flex gap-2.5 mt-5">
                        <button onClick={() => setStep('points')} className="flex-[0.4] py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                            修改
                        </button>
                        <button onClick={onSubmit} disabled={isSubmitting} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
                            {isSubmitting ? <><Loader2 size={14} className="animate-spin" /> 提交中...</> : '确认提交'}
                        </button>
                    </div>
                </GlassCard>
            )}
        </div>
    );
}

// ======================== 订单追踪 ========================

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    PENDING:   { label: '待审批', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    APPROVED:  { label: '已通过', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    EXECUTING: { label: '配送中', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
    COMPLETED: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    REJECTED:  { label: '已驳回', cls: 'bg-red-50 text-red-600 border-red-200' },
};

function OrderTrack({ orders, loading, onRefresh }: { orders: MobileOrder[]; loading: boolean; onRefresh: () => void }) {
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-black text-slate-800 tracking-tight">我的订单</h3>
                <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-[11px] font-bold text-slate-500 hover:bg-slate-200 transition-colors">
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> 刷新
                </button>
            </div>

            {loading && orders.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold">加载中</p>
                </div>
            ) : orders.length === 0 ? (
                <div className="text-center py-16 text-slate-300">
                    <Package size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-bold text-slate-400">暂无订单记录</p>
                    <p className="text-[11px] text-slate-300 mt-1">发起配送后，订单将显示在此处</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2.5">
                    {orders.map(order => {
                        const sc = STATUS_MAP[order.status] || STATUS_MAP.PENDING;
                        return (
                            <div key={order.id} className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order ID</p>
                                        <p className="text-xs font-bold text-slate-600 font-mono">{order.id.slice(0, 8)}</p>
                                    </div>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sc.cls}`}>
                                        {sc.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                    <MapPin size={11} className="text-slate-600" />
                                    <span className="font-bold">{CITY_LABEL_MAP[order.city] || order.city}</span>
                                    <span className="text-slate-300">|</span>
                                    <Clock size={11} />
                                    <span>{new Date(order.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ======================== 原子组件 ========================

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`flex flex-col items-center gap-0.5 px-5 py-1 transition-colors ${active ? 'text-slate-800' : 'text-slate-400'}`}>
            {icon}
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    );
}

function GlassCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            {children}
        </div>
    );
}

function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight">{title}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</p>
        </div>
    );
}

function PointLabel({ color, text }: { color: string; text: string }) {
    return (
        <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-xs font-bold text-slate-700">{text}</span>
        </div>
    );
}

function PoiRow({ poi, selected, disabled, onClick }: { poi: PoiItem; selected: boolean; disabled: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 transition-all text-left ${
                selected ? 'border-slate-800 bg-slate-50' :
                disabled ? 'border-slate-50 bg-slate-50 opacity-40 cursor-not-allowed' :
                'border-slate-100 bg-white hover:border-slate-200'
            }`}
        >
            <div className="flex flex-col">
                <span className={`text-sm font-bold ${selected ? 'text-slate-800' : 'text-slate-700'}`}>{poi.name}</span>
                <span className="text-[10px] text-slate-400">{poi.category}</span>
            </div>
            {selected && <CheckCircle2 size={16} className="text-slate-700 flex-shrink-0" />}
        </button>
    );
}

function ParamChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">{value}</p>
        </div>
    );
}
