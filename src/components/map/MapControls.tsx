'use client';

export default function MapControls() {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className="absolute right-4 bottom-32 flex flex-col gap-2 z-10">
      <button 
        onClick={toggleFullscreen}
        className="glass-panel w-10 h-10 flex items-center justify-center rounded-lg shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Toggle Fullscreen"
      >
        ⛶
      </button>
    </div>
  );
}
