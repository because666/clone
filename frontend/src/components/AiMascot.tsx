import { Bot } from 'lucide-react';
import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from 'react';

// 将动画样式抽取为文件级常量，阻断每一次渲染组件的深层 diff 雪崩代价
const STYLE_FLOAT = { animation: 'mascotFloat 4s ease-in-out infinite' };
const STYLE_ORBIT_1 = { animation: 'orbitBounce 3s ease-in-out infinite alternate' };
const STYLE_ORBIT_2 = { animation: 'orbitBounce 2.5s ease-in-out infinite alternate-reverse' };

export default function AiMascot({ isRightPanelOpen }: { isRightPanelOpen?: boolean }) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    
    const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

    const handleMouseDown = (e: ReactMouseEvent) => {
        if (e.button !== 0) return; // 只响应左键
        e.preventDefault(); // 防止默认拖拽行为（如拖拽图片或选中文字）
        setIsDragging(true);
        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initX: position.x,
            initY: position.y
        };
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current) return;
            const dx = e.clientX - dragStartRef.current.startX;
            const dy = e.clientY - dragStartRef.current.startY;
            
            setPosition({
                x: dragStartRef.current.initX + dx,
                y: dragStartRef.current.initY + dy
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div 
            className={`fixed top-9 z-[60] pointer-events-auto group touch-none select-none 
                ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} 
                ${isDragging ? '' : 'transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]'} 
                ${isRightPanelOpen ? 'right-[700px]' : 'right-[360px]'}`}
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
            onMouseDown={handleMouseDown}
        >
            {/* 核心容器组件 - 包含悬浮效果 */}
            <div className="relative w-16 h-16 flex items-center justify-center transition-transform hover:scale-110 duration-300"
                style={STYLE_FLOAT}>

                {/* 最外层逆向旋转光环 (虚线) */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-400/40 animate-[spin_12s_linear_infinite_reverse]" />

                {/* 中间层扫描光环 */}
                <div className="absolute inset-1 rounded-full border-[1.5px] border-t-cyan-400 border-r-transparent border-b-indigo-500 border-l-transparent animate-[spin_4s_linear_infinite]" />

                {/* 科技核心基座 */}
                <div className="absolute inset-2.5 rounded-full bg-white/75 backdrop-blur-2xl border border-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-slate-900/5 flex items-center justify-center overflow-hidden group-hover:bg-white/95 transition-colors">

                    {/* 微笑/呼吸灯内核 */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-cyan-400/10 animate-pulse"></div>

                    {/* 用 Lucide 的 Bot 图标模拟 AI 脸谱 */}
                    <Bot className="w-6 h-6 text-indigo-600 drop-shadow-[0_2px_4px_rgba(79,70,229,0.3)]" />
                </div>

                {/* 旁系能量浮游炮1 */}
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]"
                    style={STYLE_ORBIT_1} />

                {/* 旁系能量浮游炮2 */}
                <div className="absolute -bottom-2 -left-1 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"
                    style={STYLE_ORBIT_2} />

                {/* 底部名牌 */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap flex flex-col items-center">
                    <div className="bg-white/85 backdrop-blur-xl px-3 py-0.5 rounded-full border border-white shadow-md ring-1 ring-slate-900/5 flex items-center gap-1.5 opacity-95 group-hover:opacity-100 group-hover:-translate-y-0.5 transition-all duration-300 pointer-events-none">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.6)]" />
                        <span className="text-[10px] font-black text-slate-700 tracking-wider">QWEN</span>
                    </div>
                </div>

                {/* Hover 显示的 AI 对话提示气泡 (改到左侧展开) */}
                <div className="absolute top-1/2 right-full mr-6 -translate-y-1/2 w-[220px] 
                    opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 
                    transition-all duration-300 origin-right pointer-events-none">
                    <div className="bg-white/50 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-lg relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 to-transparent rounded-2xl pointer-events-none"></div>
                        {/* 左侧向右的指向小三角 */}
                        <div className="absolute top-1/2 -right-[6px] -translate-y-1/2 w-3 h-3 bg-white/80 border-t border-r border-white/60 rotate-45 backdrop-blur-xl shadow-sm"></div>

                        <p className="text-xs text-slate-700 leading-relaxed font-bold relative z-10">
                            你好！我是 <span className="text-indigo-700 font-black tracking-wide">通义千问大模型</span>。<br />
                            正全天候为你监控空域安全、预审订单风险。点选地图 POI 即可唤醒我！
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
