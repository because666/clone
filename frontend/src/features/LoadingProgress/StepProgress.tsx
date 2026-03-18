/**
 * 分步进度条组件
 * 用于显示多步骤加载进度
 */

import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

export interface StepItem {
    id: string;
    label: string;
    status: 'pending' | 'loading' | 'completed' | 'error';
}

interface StepProgressProps {
    steps: StepItem[];
    title?: string;
    progress?: number; // 可选的进度百分比（0-100）
    hideDelay?: number; // 加载完成后延迟隐藏的毫秒数
    isLoading?: boolean; // 是否正在加载
}

/**
 * 分步进度条组件
 * @param steps - 步骤列表
 * @param title - 标题
 * @param progress - 进度百分比（0-100），如果不传则自动计算
 * @param hideDelay - 加载完成后延迟隐藏的时间（毫秒）
 * @param isLoading - 是否正在加载
 */
export const StepProgress: React.FC<StepProgressProps> = ({
    steps,
    title = '正在加载数据',
    progress: externalProgress,
    hideDelay = 300,
    isLoading = true
}) => {
    // 计算进度百分比
    const completedCount = steps.filter(s => s.status === 'completed').length;
    const totalCount = steps.length;
    const calculatedProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    const progress = externalProgress !== undefined ? externalProgress : calculatedProgress;

    // 控制组件可见性，用于延迟隐藏
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // 当加载完成（进度100%）且设置了延迟隐藏时
        if (progress >= 100 && hideDelay > 0 && isLoading) {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, hideDelay);
            return () => clearTimeout(timer);
        }

        // 重新开始加载时显示组件
        if (isLoading && progress < 100) {
            setIsVisible(true);
        }
    }, [progress, hideDelay, isLoading]);

    // 如果不可见，返回 null
    if (!isVisible && progress >= 100) {
        return null;
    }

    return (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl px-6 py-5 shadow-2xl min-w-[320px] animate-fade-in">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-cyan-300 text-sm font-medium">{title}</h3>
                <span className="text-slate-400 text-xs">{completedCount}/{totalCount}</span>
            </div>

            {/* 进度条容器 */}
            <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden mb-5">
                {/* 进度条填充 */}
                <div
                    className="h-full bg-gradient-to-r from-cyan-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                    style={{
                        width: `${progress}%`,
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                />
            </div>

            {/* 进度百分比显示 */}
            <div className="flex justify-between items-center mb-4">
                <span className="text-slate-500 text-xs">加载进度</span>
                <span className="text-cyan-400 text-sm font-medium">{Math.round(progress)}%</span>
            </div>

            <div className="space-y-3">
                {steps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3">
                        {/* 步骤状态图标 */}
                        <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                            transition-all duration-300 ease-out
                            ${step.status === 'completed'
                                ? 'bg-emerald-500/20 border border-emerald-500/50 scale-100'
                                : step.status === 'loading'
                                    ? 'bg-cyan-500/20 border border-cyan-500/50 scale-110'
                                    : step.status === 'error'
                                        ? 'bg-red-500/20 border border-red-500/50 scale-100'
                                        : 'bg-slate-700/30 border border-slate-600/50 scale-100'
                            }
                        `}>
                            {step.status === 'completed' && (
                                <Check className="w-3.5 h-3.5 text-emerald-400 animate-scale-in" />
                            )}
                            {step.status === 'loading' && (
                                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                            )}
                            {step.status === 'error' && (
                                <span className="text-red-400 text-xs font-bold">!</span>
                            )}
                            {step.status === 'pending' && (
                                <span className="text-slate-500 text-xs">{index + 1}</span>
                            )}
                        </div>

                        {/* 步骤标签 */}
                        <span className={`
                            text-sm transition-colors duration-300
                            ${step.status === 'completed'
                                ? 'text-emerald-300'
                                : step.status === 'loading'
                                    ? 'text-cyan-300 font-medium'
                                    : step.status === 'error'
                                        ? 'text-red-300'
                                        : 'text-slate-500'
                            }
                        `}>
                            {step.label}
                        </span>

                        {/* 步骤状态文字 */}
                        <span className={`
                            ml-auto text-xs transition-all duration-300
                            ${step.status === 'completed'
                                ? 'text-emerald-400 opacity-100'
                                : step.status === 'loading'
                                    ? 'text-cyan-400 opacity-100'
                                    : step.status === 'error'
                                        ? 'text-red-400 opacity-100'
                                        : 'text-slate-600 opacity-0'
                            }
                        `}>
                            {step.status === 'completed' && '完成'}
                            {step.status === 'loading' && '加载中...'}
                            {step.status === 'error' && '失败'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StepProgress;
