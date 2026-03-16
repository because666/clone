import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

/** 单条告警 */
export interface AlertItem {
    id: string;
    type: 'low-battery' | 'danger-zone';
    flightId: string;
    message: string;
    timestamp: number;       // Date.now()
}

interface AlertContextType {
    alerts: AlertItem[];
    totalCounts: {
        'low-battery': number;
        'danger-zone': number;
    };
    pushAlert: (type: AlertItem['type'], flightId: string, message: string) => void;
}

const AlertContext = createContext<AlertContextType>({
    alerts: [],
    totalCounts: { 'low-battery': 0, 'danger-zone': 0 },
    pushAlert: () => {},
});

const MAX_ALERTS = 5;           // 最多同时保留 5 条
const AUTO_DISMISS_MS = 8000;   // 8 秒后自动消失
const COOLDOWN_MS = 30000;      // 同一架无人机 30 秒内不重复告警

/** 告警推送 Provider */
export function AlertNotificationProvider({ children }: { children: ReactNode }) {
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [totalCounts, setTotalCounts] = useState({ 'low-battery': 0, 'danger-zone': 0 });
    
    // 冷却表：{ [flightId-type]: lastPushTime }
    const cooldownRef = useRef<Map<string, number>>(new Map());

    const pushAlert = useCallback((type: AlertItem['type'], flightId: string, message: string) => {
        const cooldownKey = `${flightId}-${type}`;
        const now = Date.now();
        const last = cooldownRef.current.get(cooldownKey) || 0;
        if (now - last < COOLDOWN_MS) return; // 冷却期内不重复推送

        cooldownRef.current.set(cooldownKey, now);

        // 更新累计计数
        setTotalCounts(prev => ({
            ...prev,
            [type]: prev[type] + 1
        }));

        const newAlert: AlertItem = {
            id: `${cooldownKey}-${now}`,
            type,
            flightId,
            message,
            timestamp: now,
        };

        setAlerts(prev => {
            const next = [newAlert, ...prev];
            return next.slice(0, MAX_ALERTS);
        });

        // 自动消失
        setTimeout(() => {
            setAlerts(prev => prev.filter(a => a.id !== newAlert.id));
        }, AUTO_DISMISS_MS);
    }, []);

    return (
        <AlertContext.Provider value={{ alerts, totalCounts, pushAlert }}>
            {children}
        </AlertContext.Provider>
    );
}

/** 消费告警队列的 Hook */
export function useAlerts() {
    return useContext(AlertContext);
}
