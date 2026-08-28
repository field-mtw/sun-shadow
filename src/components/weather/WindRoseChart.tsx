'use client';

export interface WindRoseData {
  direction: string;
  speed: number;
  frequency: number;
}

export default function WindRoseChart({ data, size = 200 }: { data?: WindRoseData[], size?: number }) {
  return (
    <div className="flex justify-center items-center p-2" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full border-2 border-slate-300 dark:border-slate-600 relative flex items-center justify-center">
        <span className="text-xs text-slate-400 absolute top-1">N</span>
        <span className="text-xs text-slate-400 absolute bottom-1">S</span>
        <span className="text-xs text-slate-400 absolute left-1">W</span>
        <span className="text-xs text-slate-400 absolute right-1">E</span>
        <div className="w-2 h-2 bg-slate-500 rounded-full" />
        {/* Real SVG rendering goes here */}
      </div>
    </div>
  );
}
