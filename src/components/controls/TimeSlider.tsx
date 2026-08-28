'use client';

import { useTranslations } from 'next-intl';

interface TimeSliderProps {
  value: Date;
  onChange: (date: Date) => void;
  sunrise: Date;
  sunset: Date;
}

export default function TimeSlider({ value, onChange, sunrise, sunset }: TimeSliderProps) {
  // Simplified for now
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = new Date(value);
    newTime.setHours(Math.floor(Number(e.target.value) / 60));
    newTime.setMinutes(Number(e.target.value) % 60);
    onChange(newTime);
  };

  const minutesSinceMidnight = value.getHours() * 60 + value.getMinutes();

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
        <span>{sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span>{sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1440}
        value={minutesSinceMidnight}
        onChange={handleChange}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-amber-500"
      />
    </div>
  );
}
