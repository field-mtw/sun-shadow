'use client';

import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Moon, Waves } from 'lucide-react';
import StatTile from '@/components/ui/StatTile';
import TideChart from './TideChart';
import { formatTime } from '@/lib/sun-engine';
import type { TideData } from '@/types';

interface TidePanelProps {
  tideData: TideData;
  time: Date;
  isLoading: boolean;
}

export default function TidePanel({ tideData, time, isLoading }: TidePanelProps) {
  const t = useTranslations('tides');
  const {
    hasMarineData,
    hourlyPoints,
    extremes,
    currentHeight,
    isRising,
    avgWaveHeight,
    avgSeaTemp,
    avgCurrentSpeed,
    moon,
  } = tideData;

  const nextHigh = extremes.find((e) => e.type === 'high');
  const nextLow = extremes.find((e) => e.type === 'low');

  return (
    <div>
      {isLoading && (
        <div className="mb-3">
          <p className="sr-only">{t('loading')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-16 animate-pulse rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] dark:bg-[rgba(0,0,0,0.22)]" />
            <div className="h-16 animate-pulse rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] dark:bg-[rgba(0,0,0,0.22)]" />
          </div>
        </div>
      )}

      {hasMarineData ? (
        <>
          {/* Main Tide stats */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <StatTile
              label={t('currentLevel')}
              value={
                currentHeight !== null
                  ? `${currentHeight >= 0 ? '+' : ''}${currentHeight.toFixed(2)} ${t('meters')}`
                  : '—'
              }
              icon={
                isRising !== null ? (
                  isRising ? (
                    <ArrowUp size={14} className="text-emerald-500" />
                  ) : (
                    <ArrowDown size={14} className="text-amber-500" />
                  )
                ) : (
                  <Waves size={14} className="text-tide" />
                )
              }
              valueClassName="text-tide font-bold"
            />
            <StatTile
              label={`${t('highTide')} / ${t('lowTide')}`}
              value={
                nextHigh && nextLow
                  ? `${nextHigh.height >= 0 ? '+' : ''}${nextHigh.height.toFixed(1)} / ${nextLow.height >= 0 ? '+' : ''}${nextLow.height.toFixed(1)}m`
                  : nextHigh
                    ? `${nextHigh.height >= 0 ? '+' : ''}${nextHigh.height.toFixed(1)}m`
                    : nextLow
                      ? `${nextLow.height >= 0 ? '+' : ''}${nextLow.height.toFixed(1)}m`
                      : '—'
              }
            />
          </div>

          {/* 24-Hour Tide Curve Chart */}
          <div className="mb-1 text-xs font-medium text-fg-muted">{t('tideChart')}</div>
          <TideChart
            points={hourlyPoints}
            extremes={extremes}
            currentTime={time}
            currentHeight={currentHeight}
          />

          {/* Marine conditions */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <StatTile
              label={t('waveHeight')}
              value={avgWaveHeight !== null ? `${avgWaveHeight.toFixed(1)} ${t('meters')}` : '—'}
            />
            <StatTile
              label={t('seaTemp')}
              value={avgSeaTemp !== null ? `${avgSeaTemp.toFixed(1)}°C` : '—'}
            />
            <StatTile
              label={t('currentSpeed')}
              value={avgCurrentSpeed !== null ? `${avgCurrentSpeed.toFixed(0)} km/h` : '—'}
            />
          </div>
        </>
      ) : (
        <div className="mb-4 rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.25)] p-3 text-xs leading-relaxed text-fg-muted dark:bg-[rgba(0,0,0,0.18)]">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-fg">
            <Waves size={14} className="text-tide" />
            {t('title')}
          </div>
          {t('inlandNotice')}
        </div>
      )}

      {/* Moon & Tidal Cycle */}
      <div className="mb-2 text-xs font-medium text-fg-muted">{t('moonPhase')}</div>
      <div className="mb-3 rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] p-3 dark:bg-[rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-tide-soft)] text-tide">
              <Moon size={18} strokeWidth={2} />
            </div>
            <div>
              <div className="text-sm font-semibold text-fg">
                {t(`phases.${moon.phaseKey}`)}
              </div>
              <div className="text-[11px] text-fg-muted">
                {t('illumination')}: {Math.round(moon.fraction * 100)}%
              </div>
            </div>
          </div>
          <div
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              moon.tidalType === 'springTide'
                ? 'bg-[var(--accent-tide-soft)] text-tide'
                : moon.tidalType === 'neapTide'
                  ? 'bg-[rgba(0,0,0,0.08)] text-fg-muted dark:bg-[rgba(255,255,255,0.08)]'
                  : 'bg-[rgba(0,0,0,0.05)] text-fg-muted dark:bg-[rgba(255,255,255,0.05)]'
            }`}
          >
            {t(moon.tidalType)}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">
          {t(`${moon.tidalType}Desc`)}
        </p>
      </div>

      {/* Moonrise / Moonset */}
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label={t('moonrise')}
          value={moon.rise ? formatTime(moon.rise) : '—'}
          icon={<Moon size={12} strokeWidth={2} />}
        />
        <StatTile
          label={t('moonset')}
          value={moon.set ? formatTime(moon.set) : '—'}
          icon={<Moon size={12} strokeWidth={2} />}
        />
      </div>
    </div>
  );
}
