/**
 * 错误提示组件
 * 用于显示加载错误并提供重试功能
 */

import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface ErrorAlertProps {
    title?: string;
    message: string;
    onRetry?: () => void;
    onDismiss?: () => void;
    retryText?: string;
    showDismiss?: boolean;
}

/**
 * 错误提示组件
 * @param title - 错误标题
 * @param message - 错误信息
 * @param onRetry - 重试回调
 * @param onDismiss - 关闭回调
 * @param retryText - 重试按钮文字
 * @param showDismiss - 是否显示关闭按钮
 */
export const ErrorAlert: React.FC<ErrorAlertProps> = ({
    title = '加载失败',
    message,
    onRetry,
    onDismiss,
    retryText = '重试',
    showDismiss = true
}) => {
    return (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
            <div className="bg-slate-900/95 backdrop-blur-xl border border-red-500/30 rounded-2xl px-8 py-6 max-w-md shadow-2xl">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-medium text-red-300">{title}</h3>
                            {showDismiss && onDismiss && (
                                <button
                                    onClick={onDismiss}
                                    className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4 text-slate-400" />
                                </button>
                            )}
                        </div>

                        <p className="text-slate-400 text-sm mb-4">
                            {message}
                        </p>

                        <div className="flex gap-3">
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    {retryText}
                                </button>
                            )}
                            {showDismiss && onDismiss && (
                                <button
                                    onClick={onDismiss}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface InlineErrorProps {
    message: string;
    onRetry?: () => void;
}

/**
 * 内联错误提示组件
 * @param message - 错误信息
 * @param onRetry - 重试回调
 */
export const InlineError: React.FC<InlineErrorProps> = ({ message, onRetry }) => {
    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm flex-1">{message}</span>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded transition-colors"
                >
                    <RefreshCw className="w-3 h-3" />
                    重试
                </button>
            )}
        </div>
    );
};

export default ErrorAlert;
