'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/sun-engine';
import { cn } from '@/lib/cn';

interface TimeSliderProps {
  value: Date;
  onChange: (date: Date) => void;
  sunrise: Date;
  sunset: Date;
  hideReadout?: boolean;
}

const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

export default function TimeSlider({ value, onChange, sunrise, sunset, hideReadout = false }: TimeSliderProps) {
  const t = useTranslations('time');
  const min = toMinutes(sunrise);
  const max = Math.max(min + 1, toMinutes(sunset));
  const minutesSinceMidnight = Math.min(max, Math.max(min, toMinutes(value)));
  const disabled = sunset.getTime() <= sunrise.getTime();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const total = Number(e.target.value);
    const next = new Date(value);
    next.setHours(Math.floor(total / 60), total % 60, 0, 0);
    onChange(next);
  };

  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-2', disabled && 'opacity-40')}>
      {!hideReadout && (
        <div className="text-[20px] leading-6 font-semibold tabular-nums text-fg">
          {formatTime(value)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-xs font-medium text-fg-muted tabular-nums">
          {formatTime(sunrise)}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={5}
          value={minutesSinceMidnight}
          disabled={disabled}
          onChange={handleChange}
          aria-label={t('title')}
          aria-valuetext={formatTime(value)}
          className="time-range flex-1"
        />
        <span className="w-10 shrink-0 text-right text-xs font-medium text-fg-muted tabular-nums">
          {formatTime(sunset)}
        </span>
      </div>
    </div>
  );
}
