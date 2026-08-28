'use client';

import type { RefObject } from 'react';
import TimeSlider from '@/components/controls/TimeSlider';
import ExportButton from '@/components/export/ExportButton';
import type { ShadowMapRef } from '@/components/map/ShadowMap';
import type { SkyPeriod } from '@/types';
import { cn } from '@/lib/cn';

export default function TimeBar({
  mapRef,
  value,
  onChange,
  sunrise,
  sunset,
  period,
  hideReadout = false,
}: {
  mapRef: RefObject<ShadowMapRef | null>;
  value: Date;
  onChange: (next: Date) => void;
  sunrise: Date;
  sunset: Date;
  period?: SkyPeriod;
  hideReadout?: boolean;
}) {
  return (
    <div className={cn('flex flex-nowrap gap-2', hideReadout ? 'items-center' : 'items-start')}>
      <TimeSlider
        value={value}
        onChange={onChange}
        sunrise={sunrise}
        sunset={sunset}
        period={period}
        hideReadout={hideReadout}
      />
      <ExportButton mapRef={mapRef} />
    </div>
  );
}
