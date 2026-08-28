'use client';

import { useTranslations } from 'next-intl';
import { WIND_DIRECTIONS } from '@/lib/constants';
import type { WindRoseData } from '@/types';

export default function WindRoseChart({
  data,
  size = 180,
}: {
  data?: WindRoseData[];
  size?: number;
}) {
  const tDirShort = useTranslations('directionsShort');
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 18;
  const maxFreq = Math.max(1, ...(data ?? []).map((d) => d.frequency));

  return (
    <svg width={size} height={size} className="mx-auto" viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((part) => (
        <circle
          key={part}
          cx={cx}
          cy={cy}
          r={maxR * part}
          fill="none"
          stroke="var(--fg-faint)"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      ))}
      {WIND_DIRECTIONS.map((dir, index) => {
        const item = data?.find((d) => d.direction === dir);
        const freq = item?.frequency ?? 0;
        const r = (freq / maxFreq) * maxR;
        const angle = (index * 45 - 90) * (Math.PI / 180);
        const spread = (16 * Math.PI) / 180;
        const x1 = cx + Math.cos(angle - spread) * r;
        const y1 = cy + Math.sin(angle - spread) * r;
        const x2 = cx + Math.cos(angle + spread) * r;
        const y2 = cy + Math.sin(angle + spread) * r;
        const xt = cx + Math.cos(angle) * (maxR + 12);
        const yt = cy + Math.sin(angle) * (maxR + 12);
        return (
          <g key={dir}>
            <path
              d={`M ${cx} ${cy} L ${x1} ${y1} L ${x2} ${y2} Z`}
              fill="color-mix(in oklab, var(--accent-wind) 55%, transparent)"
            />
            <text
              x={xt}
              y={yt}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--fg-muted)"
              className="font-sans"
              fontSize={10}
            >
              {tDirShort(dir)}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={3} fill="var(--fg)" />
    </svg>
  );
}
