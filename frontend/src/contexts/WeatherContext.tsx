import { createContext, useContext, useState, type ReactNode } from 'react';

export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'hailing';

interface WeatherContextType {
    weather: WeatherType;
    setWeather: (w: WeatherType) => void;
    temperature: number;
    setTemperature: (t: number) => void;
}

const WeatherContext = createContext<WeatherContextType>({
    weather: 'sunny',
    setWeather: () => {},
    temperature: 26,
    setTemperature: () => {},
});

export function WeatherProvider({ children }: { children: ReactNode }) {
    const [weather, setWeather] = useState<WeatherType>('sunny');
    const [temperature, setTemperature] = useState<number>(26);

    return (
        <WeatherContext.Provider value={{ weather, setWeather, temperature, setTemperature }}>
            {children}
        </WeatherContext.Provider>
    );
}

export function useWeather() {
    return useContext(WeatherContext);
}
