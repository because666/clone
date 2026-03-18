/**
 * 导出选项配置接口
 * 用于数据导出功能的配置
 */
export interface ExportOptions<T extends Record<string, unknown> = Record<string, unknown>> {
    /** 要导出的数据 */
    data: T[];
    /** 列定义 */
    columns: Array<{
        key: keyof T;
        header: string;
    }>;
    /** 文件名（不含扩展名） */
    filename: string;
    /** 是否包含表头 */
    includeHeader?: boolean;
}

/**
 * 用户偏好设置接口
 * 用于存储用户的个性化配置
 */
export interface UserPreferences {
    /** 主题模式 */
    theme?: 'light' | 'dark' | 'system';
    /** 默认城市 */
    defaultCity?: string;
    /** 地图缩放级别 */
    mapZoom?: number;
    /** 地图中心点 */
    mapCenter?: [number, number];
    /** 是否显示建筑 */
    showBuildings?: boolean;
    /** 是否显示 POI 需求点 */
    showPoiDemand?: boolean;
    /** 是否显示 POI 敏感点 */
    showPoiSensitive?: boolean;
    /** 是否显示轨迹尾迹 */
    showTrajectoryTail?: boolean;
    /** 动画播放速度倍率 */
    playbackSpeed?: number;
    /** 语言设置 */
    language?: 'zh-CN' | 'en-US';
    /** 是否启用音效 */
    enableSound?: boolean;
    /** 是否启用新手引导 */
    showTour?: boolean;
}

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

/**
 * 通知消息类型
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * 通知消息接口
 */
export interface NotificationMessage {
    /** 消息唯一标识 */
    id: string;
    /** 消息类型 */
    type: NotificationType;
    /** 消息标题 */
    title: string;
    /** 消息内容 */
    content?: string;
    /** 显示时长（毫秒），0 表示不自动关闭 */
    duration?: number;
    /** 创建时间戳 */
    timestamp: number;
    /** 是否已读 */
    read?: boolean;
}

/**
 * 通知配置接口
 */
export interface NotificationConfig {
    /** 最大显示数量 */
    maxCount?: number;
    /** 默认显示位置 */
    position?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'top' | 'bottom';
    /** 默认显示时长 */
    defaultDuration?: number;
    /** 是否允许关闭 */
    closable?: boolean;
    /** 是否显示进度条 */
    showProgress?: boolean;
}

/**
 * 模态框配置接口
 */
export interface ModalConfig {
    /** 模态框标题 */
    title?: string;
    /** 模态框内容 */
    content?: React.ReactNode;
    /** 确认按钮文字 */
    okText?: string;
    /** 取消按钮文字 */
    cancelText?: string;
    /** 是否显示确认按钮 */
    showOkButton?: boolean;
    /** 是否显示取消按钮 */
    showCancelButton?: boolean;
    /** 点击遮罩是否关闭 */
    maskClosable?: boolean;
    /** 是否显示遮罩 */
    showMask?: boolean;
    /** 自定义宽度 */
    width?: number | string;
    /** 确认回调 */
    onOk?: () => void | Promise<void>;
    /** 取消回调 */
    onCancel?: () => void;
}

/**
 * 搜索过滤条件接口
 */
export interface SearchFilter {
    /** 搜索关键词 */
    keyword?: string;
    /** 分类过滤 */
    category?: string;
    /** 时间范围 */
    timeRange?: {
        start: number;
        end: number;
    };
    /** 自定义过滤条件 */
    custom?: Record<string, unknown>;
}

/**
 * 分页配置接口
 */
export interface PaginationConfig {
    /** 当前页码（从 1 开始） */
    current: number;
    /** 每页条数 */
    pageSize: number;
    /** 总条数 */
    total: number;
    /** 可选的每页条数 */
    pageSizeOptions?: number[];
}

/**
 * 表格列配置接口
 */
export interface TableColumn<T = unknown> {
    /** 列唯一标识 */
    key: string;
    /** 列标题 */
    title: string;
    /** 数据字段名 */
    dataIndex?: keyof T;
    /** 列宽度 */
    width?: number | string;
    /** 是否可排序 */
    sortable?: boolean;
    /** 是否可过滤 */
    filterable?: boolean;
    /** 自定义渲染函数 */
    render?: (value: unknown, record: T, index: number) => React.ReactNode;
    /** 对齐方式 */
    align?: 'left' | 'center' | 'right';
    /** 是否固定列 */
    fixed?: 'left' | 'right';
}

/**
 * 键盘快捷键配置接口
 */
export interface KeyboardShortcut {
    /** 快捷键组合 */
    key: string;
    /** 是否需要 Ctrl 键 */
    ctrl?: boolean;
    /** 是否需要 Shift 键 */
    shift?: boolean;
    /** 是否需要 Alt 键 */
    alt?: boolean;
    /** 快捷键描述 */
    description?: string;
    /** 触发回调 */
    action: (event: KeyboardEvent) => void;
    /** 是否阻止默认行为 */
    preventDefault?: boolean;
}

/**
 * 动画配置接口
 */
export interface AnimationConfig {
    /** 动画持续时间（毫秒） */
    duration?: number;
    /** 动画缓动函数 */
    easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
    /** 动画延迟（毫秒） */
    delay?: number;
    /** 是否循环 */
    loop?: boolean;
    /** 循环次数，-1 表示无限循环 */
    iterationCount?: number;
}

/**
 * 响应式断点配置接口
 */
export interface Breakpoints {
    /** 手机端 */
    mobile: number;
    /** 平板端 */
    tablet: number;
    /** 桌面端 */
    desktop: number;
    /** 大屏 */
    wide: number;
}

/**
 * 默认响应式断点
 */
export const defaultBreakpoints: Breakpoints = {
    mobile: 576,
    tablet: 768,
    desktop: 1024,
    wide: 1440
};
