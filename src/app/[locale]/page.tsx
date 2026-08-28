'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { startOfDay } from 'date-fns';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import TimeSlider from '@/components/controls/TimeSlider';
import PlaybackControls from '@/components/controls/PlaybackControls';
import ExportButton from '@/components/export/ExportButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

const ShadowMap = dynamic(() => import('@/components/map/ShadowMap'), { ssr: false });

export default function Home() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Header />
      
      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)}>
          {/* Sidebar content here */}
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Controls</h2>
            {/* Add DatePicker, SunInfoPanel, WeatherPanel here */}
          </div>
        </Sidebar>

        <div className="relative flex-1">
          <LoadingOverlay isLoading={!isMapReady} />
          
          <ShadowMap 
            date={selectedDate} 
            time={selectedTime} 
            onMapReady={() => setIsMapReady(true)} 
          />

          {/* Floating UI */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel p-4 rounded-xl flex flex-col gap-4 w-11/12 max-w-2xl shadow-lg z-10">
            <TimeSlider 
              value={selectedTime} 
              onChange={setSelectedTime} 
              sunrise={startOfDay(selectedDate)} 
              sunset={startOfDay(selectedDate)} // placeholder
            />
            
            <div className="flex justify-between items-center">
              <PlaybackControls 
                isPlaying={isPlaying}
                onToggle={() => setIsPlaying(!isPlaying)}
                speed={playbackSpeed}
                onSpeedChange={setPlaybackSpeed}
                onStepForward={() => {}}
                onStepBackward={() => {}}
              />
              <ExportButton mapRef={null} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
