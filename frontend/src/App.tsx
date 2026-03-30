import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoadingScreen from './components/LoadingScreen';
import { AlertNotificationProvider } from './components/AlertNotificationProvider';

// 懒加载页面模块：切割分包，提升首屏（FCP）性能
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Suspense 边界拦截：在网络请求模块代码期间显示优雅过渡白屏 */}
        <Suspense fallback={<LoadingScreen />}>
          <AlertNotificationProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AlertNotificationProvider>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
