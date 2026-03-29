/**
 * JSON 解析 Web Worker
 * 将大型 JSON/GeoJSON 的解析从主线程移至 Worker 线程
 * 避免主线程阻塞导致帧率卡顿
 */

self.onmessage = (e: MessageEvent<{ url: string; id: string }>) => {
    const { url, id } = e.data;

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.text();
        })
        .then(text => {
            // 在 Worker 线程中 JSON.parse，不阻塞主线程
            const data = JSON.parse(text);
            self.postMessage({ id, data, error: null });
        })
        .catch(error => {
            self.postMessage({ id, data: null, error: error.message });
        });
};
