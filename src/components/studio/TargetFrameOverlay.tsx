'use client';

import { useEffect, useState } from 'react';
import { Camera, Compass, Lock, Unlock, Scan, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { StudioBoxSize } from '@/lib/clay-extractor';
import type { StudioCameraOrientation } from './WhiteClayCanvas';
import { cn } from '@/lib/cn';
import { soundFX } from '@/lib/sound-fx';

interface TargetFrameOverlayProps {
  visible: boolean;
  lat: number;
  sizeMeters: StudioBoxSize;
  onSizeChange: (size: StudioBoxSize) => void;
  locked: boolean;
  onToggleLock: () => void;
  getZoom?: () => number;
  getBearing?: () => number;
  subscribeView?: (cb: () => void) => () => void;
  buildingCount?: number;
  onOpenFull3D?: () => void;
  cameraOrientation?: StudioCameraOrientation;
}

const SIZES: StudioBoxSize[] = [200, 350, 500];
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function degToCardinal(deg: number): (typeof CARDINALS)[number] {
  const norm = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.round(norm / 45) % 8];
}

function metersToPixels(meters: number, lat: number, zoom: number): number {
  const earthCircumference = 40075016.686;
  const metersPerPixel =
    (earthCircumference * Math.max(0.2, Math.cos((lat * Math.PI) / 180))) /
    (512 * Math.pow(2, zoom));
  return meters / Math.max(0.05, metersPerPixel);
}

export default function TargetFrameOverlay({
  visible,
  lat,
  sizeMeters,
  onSizeChange,
  locked,
  onToggleLock,
  getZoom,
  getBearing,
  subscribeView,
  buildingCount = 0,
  cameraOrientation,
}: TargetFrameOverlayProps) {
  const t = useTranslations('studio');
  const tDir = useTranslations('directions');
  const [zoom, setZoom] = useState<number>(() => getZoom?.() ?? 15.8);
  const [bearing, setBearing] = useState<number>(() => getBearing?.() ?? 0);

  useEffect(() => {
    if (!visible) return;
    const sync = () => {
      const z = getZoom?.();
      if (typeof z === 'number' && Number.isFinite(z)) {
        setZoom(z);
      }
      const b = getBearing?.();
      if (typeof b === 'number' && Number.isFinite(b)) {
        setBearing(b);
      }
    };
    sync();
    return subscribeView?.(sync);
  }, [visible, getZoom, getBearing, subscribeView]);

  if (!visible) return null;

  const rawPx = metersToPixels(sizeMeters, lat, zoom);
  const clampedPx = Math.max(130, Math.min(340, rawPx));

  const azimuthDeg = cameraOrientation?.azimuthDeg ?? 317;
  const pitchDeg = cameraOrientation?.pitchDeg ?? 32;
  // Screen-space angle of the 3D camera's look vector (0° = Up on screen, 90° = Right)
  const lookScreenDeg = (((azimuthDeg - bearing) % 360) + 360) % 360;
  const cardinal = degToCardinal(azimuthDeg);

  return (
    <div className="pointer-events-none absolute inset-0 z-[12] flex flex-col items-center justify-center overflow-hidden select-none">
      {/* Top Floating Telemetry Pill for Target Box */}
      <div className="glass-panel pointer-events-auto mb-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-lg">
        <span className="flex items-center gap-1 px-1.5 font-semibold text-sun-text">
          <Scan size={13} className="shrink-0" />
          <span>{t('targetZone')}</span>
        </span>

        <div className="flex items-center gap-0.5 rounded-full bg-[var(--glass-hover)] p-0.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                soundFX.playSwitch(true);
                onSizeChange(s);
              }}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-all',
                sizeMeters === s
                  ? 'bg-sun text-fg-inverse shadow-xs'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {s}m
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            soundFX.playSwitch(!locked);
            onToggleLock();
          }}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all',
            locked
              ? 'bg-[var(--accent-wind-soft)] text-wind ring-1 ring-[var(--accent-wind)]/40'
              : 'text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg',
          )}
          title={locked ? t('unlockArea') : t('lockArea')}
        >
          {locked ? <Lock size={11} /> : <Unlock size={11} />}
          <span>{locked ? t('locked') : t('liveSync')}</span>
        </button>
      </div>

      {/* Live 3D Camera Direction Readout Pill */}
      <div className="glass-panel mb-3 flex items-center gap-1.5 rounded-full border border-sun/35 px-3 py-0.5 text-[10px] font-semibold shadow-md">
        <Camera size={11} className="text-sun" />
        <span className="text-fg-muted">{t('cameraFacing')}:</span>
        <span className="font-bold text-sun-text">
          {cardinal} ({tDir(cardinal)}) {azimuthDeg}°
        </span>
        <span className="text-fg-faint">·</span>
        <span className="text-fg-muted tabular-nums">
          {t('cameraPitch')} {pitchDeg}°
        </span>
      </div>

      {/* Bounding Square Reticle */}
      <div
        className={cn(
          'relative transition-[width,height] duration-200 ease-out',
          locked ? 'opacity-85' : 'opacity-100',
        )}
        style={{ width: `${clampedPx}px`, height: `${clampedPx}px` }}
      >
        {/* Subtle Glass Fill + Dashed Telemetry Border */}
        <div
          className={cn(
            'absolute inset-0 rounded-[14px] border border-dashed transition-colors duration-300',
            locked
              ? 'border-wind/75 bg-wind/[0.04] shadow-[0_0_32px_rgba(15,118,110,0.16)]'
              : 'border-sun/80 bg-sun/[0.04] shadow-[0_0_36px_rgba(245,158,11,0.18)]',
          )}
        />

        {/* Synchronized 3D Camera Frustum Cone & Sightline Vector */}
        <svg
          viewBox="0 0 240 240"
          className="pointer-events-none absolute -inset-5 h-[calc(100%+40px)] w-[calc(100%+40px)] overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="camFovGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.34" />
              <stop offset="65%" stopColor="#f59e0b" stopOpacity="0.11" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Rotated by lookScreenDeg around center (120, 120):
              0° means camera stands at bottom (120, 202) and looks UP toward (120, 34) */}
          <g transform={`rotate(${lookScreenDeg} 120 120)`}>
            {/* FOV Frustum Wedge */}
            <path
              d="M 120 202 L 48 44 A 96 96 0 0 1 192 44 Z"
              fill="url(#camFovGrad)"
            />

            {/* Left & Right FOV Boundary Rays */}
            <line
              x1="120"
              y1="202"
              x2="52"
              y2="48"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 4"
              strokeOpacity="0.55"
            />
            <line
              x1="120"
              y1="202"
              x2="188"
              y2="48"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 4"
              strokeOpacity="0.55"
            />

            {/* Far Frustum Arc */}
            <path
              d="M 56 56 A 88 88 0 0 1 184 56"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.25"
              strokeDasharray="3 3"
              strokeOpacity="0.5"
            />

            {/* Center Camera Sightline Vector */}
            <line
              x1="120"
              y1="196"
              x2="120"
              y2="34"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeOpacity="0.9"
            />

            {/* Sightline Directional Arrowhead (Points toward look direction) */}
            <polygon
              points="120,24 113,39 120,35 127,39"
              fill="#f59e0b"
            />

            {/* Orbiting 3D Camera Station Puck on Perimeter */}
            <circle
              cx="120"
              cy="202"
              r="11"
              fill="#0f172a"
              stroke="#f59e0b"
              strokeWidth="2"
            />
            {/* Mini Camera Lens Icon inside Puck pointing upward along sightline */}
            <rect
              x="115"
              y="199"
              width="10"
              height="7"
              rx="1.5"
              fill="#f59e0b"
            />
            <polygon
              points="117,199 123,199 125,195 115,195"
              fill="#fde68a"
            />
          </g>
        </svg>

        {/* 4 Precision Corner Brackets */}
        <span className="absolute -top-0.5 -left-0.5 h-4 w-4 rounded-tl-[10px] border-t-2 border-l-2 border-sun" />
        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-tr-[10px] border-t-2 border-r-2 border-sun" />
        <span className="absolute -bottom-0.5 -left-0.5 h-4 w-4 rounded-bl-[10px] border-b-2 border-l-2 border-sun" />
        <span className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-br-[10px] border-r-2 border-b-2 border-sun" />

        {/* Center Crosshair */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-3 w-px bg-sun/70" />
          <div className="absolute top-1/2 left-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-sun/70" />
        </div>

        {/* Cardinal Ring Labels (Rotated with Map Bearing so N always matches True North) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${-bearing}deg)` }}
        >
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.2 text-[9px] font-extrabold tracking-wider text-sun-text uppercase shadow-xs ring-1 ring-sun/40">
            N
          </span>
          <span className="absolute top-1/2 -right-2.5 -translate-y-1/2 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.2 text-[8px] font-bold text-fg-muted uppercase shadow-xs">
            E
          </span>
          <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.2 text-[8px] font-bold text-fg-muted uppercase shadow-xs">
            S
          </span>
          <span className="absolute top-1/2 -left-2.5 -translate-y-1/2 rounded-full bg-[var(--glass-bg-strong)] px-1.5 py-0.2 text-[8px] font-bold text-fg-muted uppercase shadow-xs">
            W
          </span>
        </div>

        {/* Dimension Readout Bottom Tag */}
        <div className="absolute -bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--glass-bg-strong)] px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg shadow-sm ring-1 ring-[var(--glass-border)]">
          <span>
            {sizeMeters}m × {sizeMeters}m
          </span>
          <span className="text-fg-faint">·</span>
          <span className="flex items-center gap-1 text-sun-text">
            <Sparkles size={10} />
            {buildingCount} {t('buildingsUnit')}
          </span>
          <span className="text-fg-faint">·</span>
          <span className="flex items-center gap-1 text-fg-muted">
            <Compass
              size={10}
              className="text-sun transition-transform duration-150"
              style={{ transform: `rotate(${lookScreenDeg}deg)` }}
            />
            {cardinal} {azimuthDeg}°
          </span>
        </div>
      </div>
    </div>
  );
}
