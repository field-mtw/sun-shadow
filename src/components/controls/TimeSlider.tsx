'use client';

import { useMemo, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime, getSunPosition } from '@/lib/sun-engine';
import { soundFX } from '@/lib/sound-fx';
import type { SkyPeriod } from '@/types';

interface TimeSliderProps {
  value: Date;
  onChange: (date: Date) => void;
  sunrise: Date;
  sunset: Date;
  lat?: number;
  lng?: number;
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
    `#0f172a 0%`,
    `#1e293b ${(dawn * 100).toFixed(1)}%`,
    `#f59e0b ${(sr * 100).toFixed(1)}%`,
    `#fbbf24 ${(noon * 100).toFixed(1)}%`,
    `#fb923c ${(ss * 100).toFixed(1)}%`,
    `#1e293b ${(dusk * 100).toFixed(1)}%`,
    `#0f172a 100%)`,
  ].join(', ');
}

export default function TimeSlider({
  value,
  onChange,
  sunrise,
  sunset,
  lat = 13.7563,
  lng = 100.5018,
  period = 'day',
  hideReadout = false,
}: TimeSliderProps) {
  const t = useTranslations('time');
  const minutesSinceMidnight = toMinutes(value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const total = Number(e.target.value);
    const next = new Date(value);
    next.setHours(Math.floor(total / 60), total % 60, 0, 0);
    const pos = getSunPosition(next, lat, lng);
    soundFX.playChronoTick(pos.altitudeDeg);
    onChange(next);
  };

  const srPct = (toMinutes(sunrise) / DAY_MINUTES) * 100;
  const ssPct = (toMinutes(sunset) / DAY_MINUTES) * 100;
  const curPct = (minutesSinceMidnight / (DAY_MINUTES - 1)) * 100;

  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();

  // Build 24h Solar Elevation SVG Curve (memoized by date & location only — 0 work during time scrubbing)
  const { pathD, fillD, horizonY } = useMemo(() => {
    const W = 360;
    const H = 34;
    const mapAltToY = (altDeg: number) => {
      const clamped = Math.max(-85, Math.min(85, altDeg));
      return H / 2 - (clamped / 90) * (H * 0.44);
    };

    const pts: Array<[number, number]> = [];
    for (let m = 0; m <= DAY_MINUTES; m += 20) {
      const d = new Date(year, month, day, Math.floor(m / 60), m % 60, 0, 0);
      const pos = getSunPosition(d, lat, lng);
      const x = (m / DAY_MINUTES) * W;
      const y = mapAltToY(pos.altitudeDeg);
      pts.push([x, y]);
    }

    const line = pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    const hY = mapAltToY(0);
    const area = `${line} L${W},${H} L0,${H} Z`;

    return {
      pathD: line,
      fillD: area,
      horizonY: hY,
    };
  }, [year, month, day, lat, lng]);

  const sunPointY = useMemo(() => {
    const H = 34;
    const curPos = getSunPosition(value, lat, lng);
    const clamped = Math.max(-85, Math.min(85, curPos.altitudeDeg));
    return H / 2 - (clamped / 90) * (H * 0.44);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, day, minutesSinceMidnight, lat, lng]);

  const trackBg = useMemo(() => trackGradient(sunrise, sunset), [sunrise, sunset]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {!hideReadout && (
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <div className="text-[20px] leading-6 font-bold tracking-tight tabular-nums text-fg">
              {formatTime(value)}
            </div>
            <div className="rounded-full bg-[var(--accent-sun-soft)] px-2 py-0.5 text-[10px] font-semibold text-sun-text">
              {t(`period.${period}`)}
            </div>
          </div>
          <div className="hidden text-[10px] font-medium tabular-nums text-fg-muted sm:flex sm:items-center sm:gap-2">
            <span>
              ↑ {formatTime(sunrise)}
            </span>
            <span className="text-fg-faint">·</span>
            <span>
              ↓ {formatTime(sunset)}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[10px] font-semibold text-fg-muted tabular-nums">
          00:00
        </span>

        <div className="relative flex min-w-0 flex-1 flex-col justify-center py-1">
          {/* 24-Hour Solar Horizon Curve Backdrop */}
          <svg
            viewBox="0 0 360 34"
            preserveAspectRatio="none"
            className="pointer-events-none h-7 w-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="solar-curve-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-sun)" stopOpacity="0.32" />
                <stop offset="55%" stopColor="var(--accent-sun)" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizon 0° Line */}
            <line
              x1={0}
              y1={horizonY}
              x2={360}
              y2={horizonY}
              stroke="currentColor"
              strokeOpacity={0.18}
              strokeDasharray="2 2"
              strokeWidth={1}
            />

            {/* Area Under Solar Curve */}
            <path d={fillD} fill="url(#solar-curve-fill)" />

            {/* Solar Elevation Curve */}
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent-sun)"
              strokeOpacity={0.75}
              strokeWidth={1.6}
            />

            {/* Active Sun / Moon Bead on Curve */}
            <circle
              cx={(curPct / 100) * 360}
              cy={sunPointY}
              r={3.5}
              fill={period === 'night' || period === 'moonlight' ? '#38bdf8' : '#fbbf24'}
            />
          </svg>

          {/* Range Input Overlay */}
          <div className="relative -mt-1.5 w-full">
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
              style={{ background: trackBg }}
            />
            <span
              className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-amber-300/90"
              style={{ left: `${srPct}%` }}
              title={t('sunrise')}
            />
            <span
              className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-orange-400/90"
              style={{ left: `${ssPct}%` }}
              title={t('sunset')}
            />
          </div>
        </div>

        <span className="w-8 shrink-0 text-right text-[10px] font-semibold text-fg-muted tabular-nums">
          24:00
        </span>
      </div>
    </div>
  );
}
