'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/sun-engine';
import { cn } from '@/lib/cn';
import type { SkyPeriod } from '@/types';

interface TimeSliderProps {
  value: Date;
  onChange: (date: Date) => void;
  sunrise: Date;
  sunset: Date;
  period?: SkyPeriod;
  hideReadout?: boolean;
}

const DAY_MINUTES = 24 * 60;
const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

function trackGradient(sunrise: Date, sunset: Date): string {
  const sr = Math.min(DAY_MINUTES - 1, Math.max(0, toMinutes(sunrise))) / DAY_MINUTES;
  const ss = Math.min(DAY_MINUTES - 1, Math.max(sr + 0.02, toMinutes(sunset))) / DAY_MINUTES;
  const dawn = Math.max(0, sr - 40 / DAY_MINUTES);
  const dusk = Math.min(1, ss + 40 / DAY_MINUTES);
  const noon = (sr + ss) / 2;
  return [
    `linear-gradient(90deg`,
    `#1e293b 0%`,
    `#1e293b ${(dawn * 100).toFixed(1)}%`,
    `#f59e0b ${(sr * 100).toFixed(1)}%`,
    `#fbbf24 ${(noon * 100).toFixed(1)}%`,
    `#fb923c ${(ss * 100).toFixed(1)}%`,
    `#1e293b ${(dusk * 100).toFixed(1)}%`,
    `#1e293b 100%)`,
  ].join(', ');
}

export default function TimeSlider({
  value,
  onChange,
  sunrise,
  sunset,
  period = 'day',
  hideReadout = false,
}: TimeSliderProps) {
  const t = useTranslations('time');
  const minutesSinceMidnight = toMinutes(value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const total = Number(e.target.value);
    const next = new Date(value);
    next.setHours(Math.floor(total / 60), total % 60, 0, 0);
    onChange(next);
  };

  const srPct = (toMinutes(sunrise) / DAY_MINUTES) * 100;
  const ssPct = (toMinutes(sunset) / DAY_MINUTES) * 100;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {!hideReadout && (
        <div className="flex items-baseline gap-2">
          <div className="text-[20px] leading-6 font-semibold tabular-nums text-fg">
            {formatTime(value)}
          </div>
          <div className="text-xs font-medium text-fg-muted">
            {t(`period.${period}`)}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-xs font-medium text-fg-muted tabular-nums">00:00</span>
        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={DAY_MINUTES - 1}
            step={5}
            value={minutesSinceMidnight}
            onChange={handleChange}
            aria-label={t('title')}
            aria-valuetext={`${formatTime(value)} ${t(`period.${period}`)}`}
            data-sky={period}
            className="time-range w-full"
            style={{ background: trackGradient(sunrise, sunset) }}
          />
          <span
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/80"
            style={{ left: `${srPct}%` }}
            title={t('sunrise')}
          />
          <span
            className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/80"
            style={{ left: `${ssPct}%` }}
            title={t('sunset')}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-xs font-medium text-fg-muted tabular-nums">24:00</span>
      </div>
    </div>
  );
}
