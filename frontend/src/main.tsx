import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e: unknown) {
  // 兜底：如果 React 渲染崩溃，在页面上显示错误信息（用于诊断部署问题）
  const root = document.getElementById('root')!
  root.style.cssText = 'color:white;padding:40px;font-family:monospace;white-space:pre-wrap;'
  root.textContent = '❌ React 渲染失败:\n' + (e instanceof Error ? e.stack : String(e))
}
