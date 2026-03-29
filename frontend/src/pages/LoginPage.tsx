import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // 静默预加载核心业务组件 (Predictive Prefetching)
  useEffect(() => {
    // 页面空闲时，请求按需加载图表和 WebGL 相关组件
    const timer = setTimeout(() => {
      import('./DashboardPage');
    }, 1500); // 延迟 1.5 秒等登录页本体加载完毕后再拉取
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { username, password });
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请检查后端服务是否启动');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* 左侧：大屏截图 + 毛玻璃 */}
      <div className="hidden lg:block relative w-1/2 overflow-hidden">
        {/* 底层截图 */}
        <img
          src="/Screen.png"
          alt="平台预览"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* 毛玻璃遮罩 - 加深以提高文字对比度 */}
        <div className="absolute inset-0 backdrop-blur-lg bg-slate-900/55" />

        {/* 覆盖文字内容 - 垂直居中作为视觉中心 */}
        <div className="relative z-10 flex flex-col justify-center items-start h-full p-16">
          <h1 className="text-5xl font-black text-white leading-tight tracking-tight"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}>
            城市低空物流基建规划<br/>与运行监控可视化平台
          </h1>
          <div className="w-14 h-1 bg-white/50 rounded-full mt-7 mb-6" />
          <p className="text-white/70 text-base leading-relaxed max-w-lg"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>
            面向城市低空经济的多城市无人机航路规划、实时运行监控与能耗分析一体化平台。
          </p>
          <div className="flex items-center gap-10 mt-10">
            <div>
              <div className="text-3xl font-black text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>6</div>
              <div className="text-xs text-white/50 mt-1">覆盖城市</div>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <div className="text-3xl font-black text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>1000+</div>
              <div className="text-xs text-white/50 mt-1">仿真航线</div>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <div className="text-3xl font-black text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>A*</div>
              <div className="text-xs text-white/50 mt-1">避障寻路</div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：登录表单 */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 bg-slate-50 px-8">
        <div className="w-full max-w-sm">
          {/* 移动端标题 */}
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-xl font-bold text-slate-800">AetherWeave</h1>
            <p className="text-slate-400 text-xs mt-1">城市低空物流运维监控平台</p>
          </div>

          <h2 className="text-2xl font-bold text-slate-800">登录</h2>
          <p className="text-slate-400 text-sm mt-1 mb-8">请输入您的账号以进入系统</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-600 border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">用户名</label>
              <input
                type="text"
                placeholder="admin"
                className="w-full px-4 py-2.5 rounded-lg text-sm text-slate-800 bg-white border border-slate-200 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">密码</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg text-sm text-slate-800 bg-white border border-slate-200 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-slate-800 transition-colors hover:bg-slate-700 active:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '验证中...' : '登录'}
            </button>
          </form>

          <p className="text-slate-400 text-xs mt-6 text-center">
            默认账号 <span className="font-mono text-slate-500">admin</span> / <span className="font-mono text-slate-500">admin123</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
