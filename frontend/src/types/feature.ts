/**
 * 引导步骤接口
 * 用于新手引导功能
 */
export interface TourStep {
    /** 步骤唯一标识 */
    id: string;
    /** 步骤标题 */
    title: string;
    /** 步骤描述内容 */
    content: string;
    /** 目标元素选择器 */
    target?: string;
    /** 步骤顺序 */
    order: number;
    /** 弹窗位置 */
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
    /** 是否禁用遮罩 */
    disableOverlay?: boolean;
    /** 是否禁用滚动 */
    disableScrolling?: boolean;
    /** 自定义样式类名 */
    className?: string;
}

/**
 * 引导配置接口
 */
export interface TourConfig {
    /** 引导唯一标识 */
    tourId: string;
    /** 引导步骤列表 */
    steps: TourStep[];
    /** 是否自动开始 */
    autoStart?: boolean;
    /** 是否显示跳过按钮 */
    showSkipButton?: boolean;
    /** 是否显示进度条 */
    showProgress?: boolean;
    /** 是否允许键盘导航 */
    allowKeyboardNavigation?: boolean;
    /** 完成回调 */
    onComplete?: () => void;
    /** 跳过回调 */
    onSkip?: () => void;
}

/**
 * 加载进度状态接口
 */
export interface LoadingProgress {
    /** 是否正在加载 */
    isLoading: boolean;
    /** 加载进度（0-100） */
    progress: number;
    /** 加载阶段描述 */
    stage?: string;
    /** 错误信息 */
    error?: string | null;
}

/**
 * 加载进度配置接口
 */
export interface LoadingProgressConfig {
    /** 最小显示时间（毫秒） */
    minDisplayTime?: number;
    /** 延迟显示时间（毫秒） */
    delayShowTime?: number;
    /** 是否显示进度条 */
    showProgress?: boolean;
    /** 是否显示百分比 */
    showPercentage?: boolean;
    /** 自定义加载提示文字 */
    loadingText?: string;
}
