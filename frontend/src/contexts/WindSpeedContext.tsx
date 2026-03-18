import { createContext, useContext, useState, type ReactNode } from 'react';

interface WindSpeedContextType {
    windSpeed: number;           // 风速 m/s
    setWindSpeed: (v: number) => void;
}

const WindSpeedContext = createContext<WindSpeedContextType>({
    windSpeed: 3,
    setWindSpeed: () => {},
});

/** 风速全局状态 Provider */
export function WindSpeedProvider({ children }: { children: ReactNode }) {
    const [windSpeed, setWindSpeed] = useState(3); // 默认 3 m/s
    return (
        <WindSpeedContext.Provider value={{ windSpeed, setWindSpeed }}>
            {children}
        </WindSpeedContext.Provider>
    );
}

/** 消费风速值的 Hook */
export function useWindSpeed() {
    return useContext(WindSpeedContext);
}
