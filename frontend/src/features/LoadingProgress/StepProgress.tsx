/**
 * 分步进度条组件
 * 用于显示多步骤加载进度
 */

import React from 'react';
import { Check, Loader2 } from 'lucide-react';

export interface StepItem {
    id: string;
    label: string;
    status: 'pending' | 'loading' | 'completed' | 'error';
}

interface StepProgressProps {
    steps: StepItem[];
    title?: string;
}

/**
 * 分步进度条组件
 * @param steps - 步骤列表
 * @param title - 标题
 */
export const StepProgress: React.FC<StepProgressProps> = ({ steps, title = '正在加载数据' }) => {
    const completedCount = steps.filter(s => s.status === 'completed').length;
    const totalCount = steps.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl px-6 py-5 shadow-2xl min-w-[320px]">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-cyan-300 text-sm font-medium">{title}</h3>
                <span className="text-slate-400 text-xs">{completedCount}/{totalCount}</span>
            </div>

            <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden mb-5">
                <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="space-y-3">
                {steps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3">
                        <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                            transition-all duration-300
                            ${step.status === 'completed'
                                ? 'bg-emerald-500/20 border border-emerald-500/50'
                                : step.status === 'loading'
                                    ? 'bg-cyan-500/20 border border-cyan-500/50'
                                    : step.status === 'error'
                                        ? 'bg-red-500/20 border border-red-500/50'
                                        : 'bg-slate-700/30 border border-slate-600/50'
                            }
                        `}>
                            {step.status === 'completed' && (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {step.status === 'loading' && (
                                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                            )}
                            {step.status === 'error' && (
                                <span className="text-red-400 text-xs">!</span>
                            )}
                            {step.status === 'pending' && (
                                <span className="text-slate-500 text-xs">{index + 1}</span>
                            )}
                        </div>

                        <span className={`
                            text-sm transition-colors duration-300
                            ${step.status === 'completed'
                                ? 'text-emerald-300'
                                : step.status === 'loading'
                                    ? 'text-cyan-300'
                                    : step.status === 'error'
                                        ? 'text-red-300'
                                        : 'text-slate-500'
                            }
                        `}>
                            {step.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StepProgress;
