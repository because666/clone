/**
 * 环境仿真统一 Context
 * 合并原 WeatherContext + WindSpeedContext，统一管理所有环境仿真参数
 */
import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'hailing';

interface EnvironmentContextType {
    /** 天气类型 */
    weather: WeatherType;
    setWeather: (w: WeatherType) => void;
    /** 气温 (°C) */
    temperature: number;
    setTemperature: (t: number) => void;
    /** 风速 (m/s) */
    windSpeed: number;
    setWindSpeed: (v: number) => void;
}

const EnvironmentContext = createContext<EnvironmentContextType>({
    weather: 'sunny',
    setWeather: () => {},
    temperature: 26,
    setTemperature: () => {},
    windSpeed: 3,
    setWindSpeed: () => {},
});

/**
 * 环境仿真全局状态 Provider
 * 【性能优化 P0-B】useMemo 稳定 value 引用，
 * 仅在属性真正变化时才触发消费者 re-render
 */
export function EnvironmentProvider({ children }: { children: ReactNode }) {
    const [weather, setWeather] = useState<WeatherType>('sunny');
    const [temperature, setTemperature] = useState<number>(26);
    const [windSpeed, setWindSpeed] = useState<number>(3);

    const value = useMemo(() => ({
        weather, setWeather,
        temperature, setTemperature,
        windSpeed, setWindSpeed,
    }), [weather, temperature, windSpeed]);

    return (
        <EnvironmentContext.Provider value={value}>
            {children}
        </EnvironmentContext.Provider>
    );
}

/** 消费环境仿真数据的 Hook */
export function useEnvironment() {
    return useContext(EnvironmentContext);
}

// 向后兼容别名，消除迁移期间的编译错误
export const useWindSpeed = useEnvironment;
export const useWeather = useEnvironment;
export type { WeatherType as WeatherTypeAlias };
