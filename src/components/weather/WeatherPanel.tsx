'use client';

import { useTranslations } from 'next-intl';
import MonthSelector from './MonthSelector';
import WindRoseChart from './WindRoseChart';
import StatTile from '@/components/ui/StatTile';
import WindMark from '@/components/icons/WindMark';
import type { MonthlyClimate, WindRoseData } from '@/types';

interface WeatherPanelProps {
  selectedMonth: number;
  onMonthChange: (month: number) => void;
  climateData: MonthlyClimate[] | null;
  windRoseData: WindRoseData[] | null;
  isLoading: boolean;
}

export default function WeatherPanel({
  selectedMonth,
  onMonthChange,
  climateData,
  windRoseData,
  isLoading,
}: WeatherPanelProps) {
  const t = useTranslations('weather');
  const tDir = useTranslations('directions');
  const tLoad = useTranslations('loading');
  const monthClimate = climateData?.find((row) => row.month === selectedMonth + 1);

  return (
    <div>
      <MonthSelector value={selectedMonth} onChange={onMonthChange} />

      {isLoading && (
        <div className="mb-3">
          <p className="sr-only">{tLoad('weather')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-16 animate-pulse rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] dark:bg-[rgba(0,0,0,0.22)]" />
            <div className="h-16 animate-pulse rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] dark:bg-[rgba(0,0,0,0.22)]" />
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatTile
          label={t('avgTemp')}
          value={monthClimate ? `${monthClimate.tempMean.toFixed(1)}${t('celsius')}` : '—'}
        />
        <StatTile
          label={`${t('maxTemp')} / ${t('minTemp')}`}
          value={
            monthClimate
              ? t('tempRange', {
                  max: monthClimate.tempMax.toFixed(0),
                  min: monthClimate.tempMin.toFixed(0),
                })
              : '—'
          }
        />
        <StatTile
          className="col-span-2"
          label={t('dominantWind')}
          icon={<WindMark size={16} className="text-wind" />}
          valueClassName="text-wind"
          value={
            monthClimate
              ? `${tDir(monthClimate.windDirectionDominant)} · ${monthClimate.windSpeedMax.toFixed(1)} ${t('kmh')}`
              : '—'
          }
        />
      </div>

      <div className="text-xs font-medium text-fg-muted">{t('windRose')}</div>
      <WindRoseChart data={windRoseData ?? undefined} size={176} />
    </div>
  );
}
