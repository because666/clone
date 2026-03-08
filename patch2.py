import re

file_path = r'd:\develop\demo\frontend\src\components\MapContainer.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace animate call
old_animate_call = """                if (layer?.id === 'uav-model-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, next, uavModelBuffer);
                    return layer.clone({"""

new_animate_call = """                if (layer?.id === 'uav-model-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, next, timeRangeRef.current.max, uavModelBuffer);
                    return layer.clone({"""
                    
content = content.replace(old_animate_call, new_animate_call)

# Replace init call
old_init_call = """    // 初始化时写入一次 buffer
    const activeUAVs = useMemo(() => {
        updateActiveUAVsBuffer(trajectories, currentTimeRef.current, uavModelBuffer);
        return uavModelBuffer;
    }, [trajectories]);"""

new_init_call = """    // 初始化时写入一次 buffer
    const activeUAVs = useMemo(() => {
        updateActiveUAVsBuffer(trajectories, currentTimeRef.current, timeRangeRef.current.max, uavModelBuffer);
        return uavModelBuffer;
    }, [trajectories]);"""
    
content = content.replace(old_init_call, new_init_call)

# Replace drag call
old_drag_call = """                if (layer?.id === 'uav-model-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, currentTimeRef.current, uavModelBuffer);
                    return layer.clone({"""

new_drag_call = """                if (layer?.id === 'uav-model-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, currentTimeRef.current, timeRangeRef.current.max, uavModelBuffer);
                    return layer.clone({"""

content = content.replace(old_drag_call, new_drag_call)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced map container calls")
