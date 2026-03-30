import { memo } from 'react';
import { CITIES } from '../constants/map';

interface PlaybackControlsProps {
    isPlaying: boolean;
    setIsPlaying: (val: boolean) => void;
    animationSpeed: number;
    setAnimationSpeed: (val: number) => void;
    currentCity: string;
    handleCityJump: (cityId: string) => void;
    isDropdownOpen: boolean;
    setIsDropdownOpen: (val: boolean) => void;
}

const PlaybackControls = memo(function PlaybackControls({
    isPlaying,
    setIsPlaying,
    animationSpeed,
    setAnimationSpeed,
    currentCity,
    handleCityJump,
    isDropdownOpen,
    setIsDropdownOpen,
}: PlaybackControlsProps) {
    return (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
            <div className="bg-white/40 backdrop-blur-2xl border border-white/50 rounded-[2rem] px-8 py-5 flex items-center gap-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] relative">
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-t from-slate-900/5 to-transparent pointer-events-none overflow-hidden" style={{ zIndex: 0 }}></div>

                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="relative z-10 w-12 h-12 rounded-full bg-white/60 border border-white/80 backdrop-blur-md flex items-center justify-center hover:bg-white/90 hover:scale-105 transition-all shadow-sm text-slate-800"
                >
                    {isPlaying ? (
                        <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
                            <rect x="2" y="2" width="3" height="12" rx="1" />
                            <rect x="9" y="2" width="3" height="12" rx="1" />
                        </svg>
                    ) : (
                        <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" className="ml-1">
                            <path d="M2.5 1.5L12.5 8L2.5 14.5V1.5Z" />
                        </svg>
                    )}
                </button>

                <div className="flex items-center gap-1.5 bg-white/30 p-1.5 rounded-full shadow-inner border border-white/50 relative z-10">
                    {[0.5, 1, 2, 1024].map(speed => (
                        <button
                            key={speed}
                            onClick={() => setAnimationSpeed(speed)}
                            className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${animationSpeed === speed
                                ? 'bg-slate-700 text-white shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                }`}
                        >
                            {speed}×
                        </button>
                    ))}
                </div>

                <div className="flex items-center ml-2 relative z-50">
                    <div className="relative group">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="appearance-none bg-white/60 backdrop-blur-md text-slate-800 font-bold text-sm rounded-full border border-white/80 pl-5 pr-11 py-2 outline-none cursor-pointer hover:bg-white/80 transition-all shadow-sm focus:ring-2 focus:ring-slate-300 w-[140px] text-left flex items-center justify-between"
                        >
                            {CITIES.find(c => c.id === currentCity)?.label || "选择城市"}

                            <div className={`absolute right-3.5 pointer-events-none text-slate-500 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : 'rotate-0'}`}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </button>

                        {isDropdownOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsDropdownOpen(false)}
                                ></div>

                                <div className="absolute bottom-[130%] right-0 w-[140px] bg-white/70 backdrop-blur-xl border border-white/80 rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.2)] py-2 z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    {CITIES.map(city => (
                                        <div
                                            key={city.id}
                                            onClick={() => handleCityJump(city.id)}
                                            className={`px-5 py-2.5 text-sm font-semibold cursor-pointer transition-colors ${currentCity === city.id
                                                ? 'bg-slate-800/10 text-slate-900 border-l-4 border-slate-700'
                                                : 'text-slate-600 hover:bg-white/50 hover:text-slate-800 border-l-4 border-transparent'
                                                }`}
                                        >
                                            {city.label}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
);

export default PlaybackControls;
