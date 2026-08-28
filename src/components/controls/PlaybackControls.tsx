'use client';

import { useTranslations } from 'next-intl';

interface PlaybackControlsProps {
  isPlaying: boolean;
  onToggle: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
}

export default function PlaybackControls({
  isPlaying,
  onToggle,
  speed,
  onSpeedChange,
  onStepForward,
  onStepBackward
}: PlaybackControlsProps) {
  const t = useTranslations('playback'); // assuming translations exist

  return (
    <div className="flex items-center gap-4 bg-white/50 dark:bg-black/50 p-2 rounded-full">
      <button onClick={onStepBackward} className="p-2 hover:text-amber-500 transition-colors">
        ⏪
      </button>
      <button 
        onClick={onToggle}
        className="p-3 bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors shadow-md"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button onClick={onStepForward} className="p-2 hover:text-amber-500 transition-colors">
        ⏩
      </button>
      
      <div className="flex gap-1 ml-2 border-l border-slate-300 dark:border-slate-600 pl-4">
        {[1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-1 text-xs rounded ${speed === s ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-black' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
