'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getSunPosition } from '@/lib/sun-engine';

interface SolarCompassDialProps {
  date: Date;
  lat: number;
  lng: number;
  azimuthDeg: number;
  altitudeDeg: number;
  sunriseAzimuthDeg: number;
  sunsetAzimuthDeg: number;
  size?: number;
}

/**
 * Polar projection: altitude 0° = outer horizon radius R, altitude 90° = center (0, 0).
 * Azimuth 0° = North (top, -Y), 90° = East (right, +X).
 */
function polarToXY(
  azimuthDeg: number,
  altitudeDeg: number,
  cx: number,
  cy: number,
  maxR: number,
): [number, number] {
  const clampedAlt = Math.max(0, Math.min(90, altitudeDeg));
  const r = ((90 - clampedAlt) / 90) * maxR;
  const rad = (azimuthDeg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

export default function SolarCompassDial({
  date,
  lat,
  lng,
  azimuthDeg,
  altitudeDeg,
  size = 196,
}: SolarCompassDialProps) {
  const tDir = useTranslations('directionsShort');
  const tSun = useTranslations('sun');

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.39;

  const buildPathD = (targetDate: Date): string => {
    const pts: Array<[number, number]> = [];
    for (let m = 5 * 60; m <= 19.5 * 60; m += 15) {
      const d = new Date(targetDate);
      d.setHours(Math.floor(m / 60), m % 60, 0, 0);
      const p = getSunPosition(d, lat, lng);
      if (p.altitudeDeg >= 0) {
        pts.push(polarToXY(p.compassAzimuthDeg, p.altitudeDeg, cx, cy, maxR));
      }
    }
    if (pts.length < 2) return '';
    return pts
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
  };

  const { todayPath, summerPath, winterPath } = useMemo(() => {
    const y = date.getFullYear();
    return {
      todayPath: buildPathD(date),
      summerPath: buildPathD(new Date(y, 5, 21)),
      winterPath: buildPathD(new Date(y, 11, 21)),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date.getFullYear(), date.getMonth(), date.getDate(), lat, lng, size]);

  const [sunX, sunY] = polarToXY(azimuthDeg, Math.max(0, altitudeDeg), cx, cy, maxR);
  const shadowAzimuth = (azimuthDeg + 180) % 360;
  const shadowRatio =
    altitudeDeg > 3 ? Math.min(4.5, 1 / Math.tan((altitudeDeg * Math.PI) / 180)) : 0;
  const shadowLenPx = Math.min(maxR * 0.88, shadowRatio * (maxR * 0.28));
  const shadowRad = (shadowAzimuth * Math.PI) / 180;
  const shX = cx + shadowLenPx * Math.sin(shadowRad);
  const shY = cy - shadowLenPx * Math.cos(shadowRad);

  const isDay = altitudeDeg > 0;

  return (
    <div className="relative mb-3 flex flex-col items-center rounded-[16px] border border-[var(--glass-border)] bg-[rgba(255,255,255,0.28)] py-2.5 dark:bg-[rgba(4,12,26,0.38)]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible select-none"
        aria-label={tSun('title')}
      >
        <defs>
          <radialGradient id="dial-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-sun)" stopOpacity="0.16" />
            <stop offset="70%" stopColor="var(--accent-sun)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="var(--accent-sun)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle Radar Background Glow */}
        <circle cx={cx} cy={cy} r={maxR} fill="url(#dial-glow)" />

        {/* Concentric Altitude Rings: 0° (Horizon), 30°, 60° */}
        <circle
          cx={cx}
          cy={cy}
          r={maxR}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.22}
          strokeWidth={1.2}
        />
        <circle
          cx={cx}
          cy={cy}
          r={maxR * (60 / 90)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.13}
          strokeDasharray="2 3"
          strokeWidth={1}
        />
        <circle
          cx={cx}
          cy={cy}
          r={maxR * (30 / 90)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.13}
          strokeDasharray="2 3"
          strokeWidth={1}
        />

        {/* Degree Ticks around Horizon Ring */}
        {Array.from({ length: 24 }).map((_, i) => {
          const deg = i * 15;
          const rad = (deg * Math.PI) / 180;
          const inner = i % 6 === 0 ? maxR - 5 : maxR - 2.5;
          return (
            <line
              key={deg}
              x1={cx + inner * Math.sin(rad)}
              y1={cy - inner * Math.cos(rad)}
              x2={cx + (maxR + 1.5) * Math.sin(rad)}
              y2={cy - (maxR + 1.5) * Math.cos(rad)}
              stroke="currentColor"
              strokeOpacity={i % 6 === 0 ? 0.45 : 0.2}
              strokeWidth={i % 6 === 0 ? 1.3 : 0.8}
            />
          );
        })}

        {/* Crosshairs */}
        <line
          x1={cx - maxR}
          y1={cy}
          x2={cx + maxR}
          y2={cy}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={1}
        />
        <line
          x1={cx}
          y1={cy - maxR}
          x2={cx}
          y2={cy + maxR}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={1}
        />

        {/* Summer & Winter Solstice Reference Envelopes */}
        {summerPath && (
          <path
            d={summerPath}
            fill="none"
            stroke="#f59e0b"
            strokeOpacity={0.32}
            strokeWidth={1.2}
            strokeDasharray="3 3"
          />
        )}
        {winterPath && (
          <path
            d={winterPath}
            fill="none"
            stroke="#38bdf8"
            strokeOpacity={0.32}
            strokeWidth={1.2}
            strokeDasharray="3 3"
          />
        )}

        {/* Active Selected Date Sun Path */}
        {todayPath && (
          <path
            d={todayPath}
            fill="none"
            stroke="var(--accent-sun)"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        )}

        {/* Shadow Cast Vector from Center (Opposite to Sun) */}
        {isDay && shadowLenPx > 4 && (
          <g>
            <line
              x1={cx}
              y1={cy}
              x2={shX}
              y2={shY}
              stroke="#64748b"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeOpacity={0.65}
            />
            <circle cx={shX} cy={shY} r={2.5} fill="#64748b" fillOpacity={0.8} />
          </g>
        )}

        {/* Ray from Sun to Center Target */}
        <line
          x1={cx}
          y1={cy}
          x2={sunX}
          y2={sunY}
          stroke={isDay ? 'var(--accent-sun)' : 'var(--accent-tide)'}
          strokeWidth={1.4}
          strokeDasharray={isDay ? undefined : '2 2'}
          strokeOpacity={0.75}
        />

        {/* Center Target Pin */}
        <circle cx={cx} cy={cy} r={3.2} fill="currentColor" />

        {/* Live Sun / Moon Orb */}
        <circle
          cx={sunX}
          cy={sunY}
          r={8}
          fill={isDay ? 'var(--accent-sun)' : 'var(--accent-tide)'}
          fillOpacity={0.25}
        />
        <circle
          cx={sunX}
          cy={sunY}
          r={4.8}
          fill={isDay ? 'var(--accent-sun)' : 'var(--accent-tide)'}
          stroke="#ffffff"
          strokeWidth={1.5}
        />

        {/* Cardinal Labels */}
        <text
          x={cx}
          y={cy - maxR - 7}
          textAnchor="middle"
          className="fill-fg text-[10px] font-bold"
        >
          {tDir('N')}
        </text>
        <text
          x={cx + maxR + 10}
          y={cy + 3}
          textAnchor="middle"
          className="fill-fg-muted text-[10px] font-semibold"
        >
          {tDir('E')}
        </text>
        <text
          x={cx}
          y={cy + maxR + 13}
          textAnchor="middle"
          className="fill-fg-muted text-[10px] font-semibold"
        >
          {tDir('S')}
        </text>
        <text
          x={cx - maxR - 10}
          y={cy + 3}
          textAnchor="middle"
          className="fill-fg-muted text-[10px] font-semibold"
        >
          {tDir('W')}
        </text>
      </svg>

      {/* Bottom Mini Legend inside Radar Card */}
      <div className="mt-0.5 flex items-center gap-3 text-[10px] font-medium text-fg-muted tabular-nums">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-sun" />
          {Math.round(azimuthDeg)}° · {altitudeDeg.toFixed(1)}°
        </span>
        {isDay && shadowRatio > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded-full bg-slate-500" />
            {tSun('shadowRatio', { ratio: shadowRatio.toFixed(1) })}
          </span>
        )}
      </div>
    </div>
  );
}
