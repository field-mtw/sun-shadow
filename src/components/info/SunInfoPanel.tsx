'use client';

import { useTranslations } from 'next-intl';
import { Moon, Sunrise, Sunset } from 'lucide-react';
import { compassFromDeg, formatTime } from '@/lib/sun-engine';
import { useSunPosition } from '@/hooks/useSunPosition';
import StatTile from '@/components/ui/StatTile';
import SunMark from '@/components/icons/SunMark';
import { cn } from '@/lib/cn';

interface SunInfoPanelProps {
  date: Date;
  time: Date;
  lat: number;
  lng: number;
}

export default function SunInfoPanel({ date, time, lat, lng }: SunInfoPanelProps) {
  const t = useTranslations('sun');
  const tDir = useTranslations('directions');
  const { position, times, dayLength, sky } = useSunPosition(date, time, lat, lng);
  const compass = compassFromDeg(position.compassAzimuthDeg);
  const hours = Math.floor(dayLength);
  const minutes = Math.round((dayLength - hours) * 60);
  const dayLengthLabel = Number.isFinite(dayLength)
    ? t('dayLengthFormat', { hours, minutes })
    : '—';

  return (
    <div className="mb-2">
      {sky.period !== 'day' && (
        <div
          className={cn(
            'mb-3 flex items-center gap-2 rounded-[var(--radius-chip)] px-3 py-2 text-xs font-medium',
            sky.period === 'moonlight' || sky.period === 'night'
              ? 'bg-[var(--accent-tide-soft)] text-tide'
              : 'bg-[var(--accent-sun-soft)] text-sun-text',
          )}
        >
          {sky.period === 'moonlight' || sky.period === 'night' ? (
            <Moon size={14} strokeWidth={2} />
          ) : (
            <SunMark size={14} />
          )}
          {t(`period.${sky.period}`)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label={t('sunrise')}
          value={formatTime(times.sunrise)}
          icon={<Sunrise size={12} strokeWidth={2} />}
        />
        <StatTile
          label={t('sunset')}
          value={formatTime(times.sunset)}
          icon={<Sunset size={12} strokeWidth={2} />}
        />
        <StatTile label={t('solarNoon')} value={formatTime(times.solarNoon)} />
        <StatTile label={t('dayLength')} value={dayLengthLabel} />
        <StatTile label={t('altitude')} value={`${position.altitudeDeg.toFixed(1)}°`} />
        <StatTile
          label={t('azimuth')}
          value={`${tDir(compass)} ${Math.round(position.compassAzimuthDeg)}°`}
        />
      </div>
    </div>
  );
}
