import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="flex flex-col items-center space-y-6">
        {/* Animated Drone/Radar Spinner */}
        <div className="relative flex items-center justify-center w-24 h-24">
          <div className="absolute inset-0 border-t-2 border-r-2 border-emerald-500 rounded-full animate-spin"></div>
          <div className="absolute inset-1 border-t-2 border-l-2 border-blue-400 rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
          <div className="w-12 h-12 bg-gradient-to-tr from-emerald-400 to-blue-500 rounded-full blur-md animate-pulse"></div>
        </div>
        
        {/* Loading Text */}
        <div className="flex flex-col items-center">
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 tracking-widest font-mono">
            AETHER WEAVE
          </h2>
          <p className="mt-2 text-sm text-slate-400 font-mono tracking-widest animate-pulse">
            LOADING ASSETS...
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
