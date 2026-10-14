'use client';

import type { ChangeEvent, RefObject } from 'react';
import { Calendar, Pause, Play, Snowflake, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import TimeSlider from '@/components/controls/TimeSlider';
import ExportButton from '@/components/export/ExportButton';
import type { ShadowMapRef } from '@/components/map/ShadowMap';
import type { SkyPeriod } from '@/types';
import { toLocalDateInputValue } from '@/lib/sun-engine';
import { soundFX } from '@/lib/sound-fx';
import { cn } from '@/lib/cn';

export default function TimeBar({
  mapRef,
  value,
  onChange,
  date,
  onDateChange,
  sunrise,
  sunset,
  lat,
  lng,
  period,
  isPlaying = false,
  onTogglePlay,
  playbackSpeed = 1,
  onSpeedChange,
  hideReadout = false,
}: {
  mapRef: RefObject<ShadowMapRef | null>;
  value: Date;
  onChange: (next: Date) => void;
  date?: Date;
  onDateChange?: (next: Date) => void;
  sunrise: Date;
  sunset: Date;
  lat?: number;
  lng?: number;
  period?: SkyPeriod;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  playbackSpeed?: number;
  onSpeedChange?: (speed: number) => void;
  hideReadout?: boolean;
}) {
  const tDate = useTranslations('date');
  const activeDate = date ?? value;

  const handleDateInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (!onDateChange) return;
    const [year, month, day] = e.target.value.split('-').map(Number);
    if (!year || !month || !day) return;
    const next = new Date(activeDate);
    next.setFullYear(year, month - 1, day);
    soundFX.playSwitch(true);
    onDateChange(next);
  };

  const applySolsticePreset = (preset: 'today' | 'summer' | 'winter') => {
    if (!onDateChange) return;
    soundFX.playSwitch(true);
    const d = new Date(activeDate);
    const now = new Date();
    d.setFullYear(now.getFullYear());
    if (preset === 'today') {
      d.setMonth(now.getMonth(), now.getDate());
    } else if (preset === 'summer') {
      d.setMonth(5, 21);
    } else {
      d.setMonth(11, 21);
    }
    onDateChange(d);
  };

  const today = new Date();
  const isToday =
    activeDate.getDate() === today.getDate() &&
    activeDate.getMonth() === today.getMonth() &&
    activeDate.getFullYear() === today.getFullYear();
  const isSummer = activeDate.getMonth() === 5 && activeDate.getDate() === 21;
  const isWinter = activeDate.getMonth() === 11 && activeDate.getDate() === 21;

  const cycleSpeed = () => {
    if (!onSpeedChange) return;
    soundFX.playSwitch(true);
    const next = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1;
    onSpeedChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Top Integrated Date & Season Bar (Desktop Console) */}
      {!hideReadout && onDateChange && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--glass-border)] pb-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applySolsticePreset('today')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                isToday
                  ? 'bg-sun text-fg-inverse shadow-xs'
                  : 'text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg',
              )}
            >
              <Calendar size={10} />
              <span>{tDate('today')}</span>
            </button>
            <button
              type="button"
              onClick={() => applySolsticePreset('summer')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                isSummer
                  ? 'bg-sun text-fg-inverse shadow-xs'
                  : 'text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg',
              )}
            >
              <Sun size={10} />
              <span>{tDate('summerSolstice')}</span>
            </button>
            <button
              type="button"
              onClick={() => applySolsticePreset('winter')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                isWinter
                  ? 'bg-sun text-fg-inverse shadow-xs'
                  : 'text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg',
              )}
            >
              <Snowflake size={10} />
              <span>{tDate('winterSolstice')}</span>
            </button>
          </div>

          <input
            type="date"
            aria-label={tDate('selectDate')}
            value={toLocalDateInputValue(activeDate)}
            onChange={handleDateInput}
            className="date-field h-6 rounded-full border border-[var(--glass-border)] bg-transparent px-2.5 text-[11px] font-medium tabular-nums text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
          />
        </div>
      )}

      {/* Main Timeline Scrubber Row */}
      <div className={cn('flex flex-nowrap items-center gap-2.5')}>
        {/* Play / Pause & Speed Controls */}
        {onTogglePlay && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!isPlaying);
                onTogglePlay();
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-all shadow-sm',
                isPlaying
                  ? 'bg-sun text-fg-inverse ring-2 ring-sun/40'
                  : 'border border-[var(--glass-border)] bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-fg hover:bg-[var(--glass-hover)]',
              )}
            >
              {isPlaying ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            {onSpeedChange && (
              <button
                type="button"
                onClick={cycleSpeed}
                className="flex h-7 min-w-8 items-center justify-center rounded-full border border-[var(--glass-border)] px-1.5 text-[10px] font-bold tabular-nums text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg"
                title="Playback speed"
              >
                {playbackSpeed}x
              </button>
            )}
          </div>
        )}

        <TimeSlider
          value={value}
          onChange={onChange}
          sunrise={sunrise}
          sunset={sunset}
          lat={lat}
          lng={lng}
          period={period}
          hideReadout={hideReadout}
        />

        <ExportButton mapRef={mapRef} />
      </div>
    </div>
  );
}
