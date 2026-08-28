'use client';

export default function LoadingOverlay({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) return null;
  
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-opacity">
      <div className="animate-spin text-4xl mb-4">☀️</div>
      <p className="text-white font-medium text-lg drop-shadow-md">Loading map...</p>
    </div>
  );
}
