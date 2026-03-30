import { Bot } from 'lucide-react';

export default function AiMascot() {
    return (
        <div className="fixed top-9 right-[360px] z-[60] pointer-events-auto cursor-help group">
            {/* 核心容器组件 - 包含悬浮效果 */}
            <div className="relative w-16 h-16 flex items-center justify-center transition-transform hover:scale-110 duration-300" 
                 style={{ animation: 'mascotFloat 4s ease-in-out infinite' }}>
                
                {/* 最外层逆向旋转光环 (虚线) */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-400/40 animate-[spin_12s_linear_infinite_reverse]" />
                
                {/* 中间层扫描光环 */}
                <div className="absolute inset-1 rounded-full border-[1.5px] border-t-cyan-400 border-r-transparent border-b-indigo-500 border-l-transparent animate-[spin_4s_linear_infinite]" />
                
                {/* 科技核心基座 */}
                <div className="absolute inset-2.5 rounded-full bg-slate-900/80 backdrop-blur border border-white/10 shadow-[0_0_20px_rgba(79,70,229,0.5)] flex items-center justify-center overflow-hidden group-hover:bg-indigo-900/80 transition-colors">
                    
                    {/* 微笑/呼吸灯内核 */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-cyan-400/20 animate-pulse"></div>
                    
                    {/* 用 Lucide 的 Bot 图标模拟 AI 脸谱 */}
                    <Bot className="w-6 h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                </div>
                
                {/* 旁系能量浮游炮1 */}
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]" 
                     style={{ animation: 'orbitBounce 3s ease-in-out infinite alternate' }} />
                     
                {/* 旁系能量浮游炮2 */}
                <div className="absolute -bottom-2 -left-1 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]" 
                     style={{ animation: 'orbitBounce 2.5s ease-in-out infinite alternate-reverse' }} />
                     
                {/* 底部名牌 */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap flex flex-col items-center">
                    <div className="bg-slate-900/60 backdrop-blur px-2.5 py-0.5 rounded-full border border-white/5 shadow-md flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_#34d399]" />
                        <span className="text-[10px] font-bold text-slate-300 tracking-wider">QWEN</span>
                    </div>
                </div>

                {/* Hover 显示的 AI 对话提示气泡 (改到左侧展开) */}
                <div className="absolute top-1/2 right-full mr-6 -translate-y-1/2 w-[220px] opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 origin-right pointer-events-none">
                    <div className="bg-white/50 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-lg relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 to-transparent rounded-2xl pointer-events-none"></div>
                        {/* 左侧向右的指向小三角 */}
                        <div className="absolute top-1/2 -right-[6px] -translate-y-1/2 w-3 h-3 bg-white/80 border-t border-r border-white/60 rotate-45 backdrop-blur-xl shadow-sm"></div>
                        
                        <p className="text-xs text-slate-700 leading-relaxed font-bold relative z-10">
                            你好！我是 <span className="text-indigo-700 font-black tracking-wide">通义千问大模型</span>。<br/>
                            正全天候为你监控空域安全、预审订单风险。点选地图 POI 即可唤醒我！
                        </p>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes mascotFloat {
                    0%, 100% { transform: translateY(0px) scale(1); }
                    50% { transform: translateY(-12px) scale(1.02); }
                }
                @keyframes orbitBounce {
                    0% { transform: translateY(0px) scale(1); }
                    100% { transform: translateY(-8px) scale(1.2); }
                }
            `}</style>
        </div>
    );
}
