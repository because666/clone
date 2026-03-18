/**
 * 错误边界组件
 * 用于捕获子组件的错误并展示友好界面
 */

import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorFallbackProps extends FallbackProps {
    title?: string;
    onRetry?: () => void;
}

/**
 * 错误回退组件
 * @param error - 错误对象
 * @param resetErrorBoundary - 重置错误边界的函数
 * @param title - 错误标题
 * @param onRetry - 重试回调
 */
const ErrorFallback: React.FC<ErrorFallbackProps> = ({
    error,
    resetErrorBoundary,
    title = '加载出错',
    onRetry
}) => {
    const handleRetry = () => {
        if (onRetry) {
            onRetry();
        }
        resetErrorBoundary();
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800/90 border border-red-500/30 rounded-2xl px-8 py-6 max-w-md shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-lg font-medium text-red-300">{title}</h3>
                </div>

                <p className="text-slate-400 text-sm mb-4">
                    {error instanceof Error ? error.message : String(error) || '发生了未知错误，请稍后重试'}
                </p>

                <div className="flex gap-3">
                    <button
                        onClick={handleRetry}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        重试
                    </button>
                    <button
                        onClick={resetErrorBoundary}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ErrorBoundaryProps {
    children: React.ReactNode;
    title?: string;
    onRetry?: () => void;
    onError?: (error: unknown, info: React.ErrorInfo) => void;
}

/**
 * 错误边界组件
 * @param children - 子组件
 * @param title - 错误标题
 * @param onRetry - 重试回调
 * @param onError - 错误回调
 */
export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({
    children,
    title,
    onRetry,
    onError
}) => {
    return (
        <ReactErrorBoundary
            FallbackComponent={(props) => (
                <ErrorFallback {...props} title={title} onRetry={onRetry} />
            )}
            onError={onError}
        >
            {children}
        </ReactErrorBoundary>
    );
};

export default ErrorBoundary;
