'use client';

import { useId, useMemo } from 'react';
import { formatTime } from '@/lib/sun-engine';
import { interpolateWaterHeight } from '@/lib/tide-engine';
import type { HourlyMarinePoint, TideExtreme } from '@/types';

interface TideChartProps {
  points: HourlyMarinePoint[];
  extremes: TideExtreme[];
  currentTime: Date;
  currentHeight?: number | null;
}

export default function TideChart({
  points,
  extremes,
  currentTime,
  currentHeight,
}: TideChartProps) {
  const gradientId = useId();

  const validPoints = useMemo(
    () => points.filter((p): p is HourlyMarinePoint & { seaLevelHeight: number } => p.seaLevelHeight !== null),
    [points],
  );

  const { minH, maxH, svgWidth, svgHeight, padding } = useMemo(() => {
    const pad = { top: 22, bottom: 24, left: 18, right: 18 };
    const w = 320;
    const h = 135;

    if (validPoints.length === 0) {
      return { minH: -1, maxH: 1, svgWidth: w, svgHeight: h, padding: pad };
    }

    const heights = validPoints.map((p) => p.seaLevelHeight);
    let min = Math.min(...heights);
    let max = Math.max(...heights);

    if (max - min < 0.2) {
      max += 0.2;
      min -= 0.2;
    } else {
      const margin = (max - min) * 0.18;
      max += margin;
      min -= margin;
    }

    return { minH: min, maxH: max, svgWidth: w, svgHeight: h, padding: pad };
  }, [validPoints]);

  const innerW = svgWidth - padding.left - padding.right;
  const innerH = svgHeight - padding.top - padding.bottom;

  const getY = (val: number) => {
    const norm = (val - minH) / (maxH - minH || 1);
    return padding.top + innerH * (1 - norm);
  };

  const getX = (date: Date) => {
    const hours = date.getHours() + date.getMinutes() / 60;
    return padding.left + (hours / 24) * innerW;
  };

  const { pathD, fillD } = useMemo(() => {
    if (validPoints.length < 2) return { pathD: '', fillD: '' };

    const pts = validPoints.map((p) => ({
      x: getX(p.time),
      y: getY(p.seaLevelHeight),
    }));

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` Q ${p0.x} ${p0.y}, ${cx} ${(p0.y + p1.y) / 2}`;
    }
    const last = pts[pts.length - 1];
    d += ` T ${last.x} ${last.y}`;

    const bottomY = padding.top + innerH;
    const fD = `${d} L ${last.x} ${bottomY} L ${pts[0].x} ${bottomY} Z`;

    return { pathD: d, fillD: fD };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validPoints, minH, maxH]);

  const activeHeight = useMemo(() => {
    if (currentHeight !== undefined && currentHeight !== null) return currentHeight;
    return interpolateWaterHeight(validPoints, currentTime).height;
  }, [currentHeight, validPoints, currentTime]);

  const currentX = getX(currentTime);
  const currentY = activeHeight !== null ? getY(activeHeight) : null;
  const zeroY = getY(0);

  if (validPoints.length < 2) {
    return null;
  }

  // Clamping tooltip pill position
  const tooltipWidth = 46;
  const tooltipHeight = 16;
  let pillX = currentX;
  let pillAnchor: 'middle' | 'start' | 'end' = 'middle';

  if (currentX - tooltipWidth / 2 < padding.left) {
    pillX = padding.left + 2;
    pillAnchor = 'start';
  } else if (currentX + tooltipWidth / 2 > svgWidth - padding.right) {
    pillX = svgWidth - padding.right - 2;
    pillAnchor = 'end';
  }

  const pillY = currentY !== null ? Math.max(12, Math.min(currentY - 14, svgHeight - 28)) : padding.top;

  return (
    <div className="relative mb-3 rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] p-3 dark:bg-[rgba(0,0,0,0.22)]">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="h-auto w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-tide)" stopOpacity="0.45" />
            <stop offset="80%" stopColor="var(--accent-tide)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="var(--accent-tide)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 0m reference line */}
        {zeroY >= padding.top && zeroY <= padding.top + innerH && (
          <line
            x1={padding.left}
            y1={zeroY}
            x2={svgWidth - padding.right}
            y2={zeroY}
            stroke="var(--fg-faint)"
            strokeDasharray="3 3"
            strokeWidth={1}
            strokeOpacity={0.35}
          />
        )}

        {/* Area fill */}
        <path d={fillD} fill={`url(#${gradientId})`} />

        {/* Curve stroke */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--accent-tide)"
          strokeWidth={2.25}
          strokeLinecap="round"
        />

        {/* Extremes (High & Low points) */}
        {extremes.map((ex, idx) => {
          const exX = getX(ex.time);
          const exY = getY(ex.height);
          const isHigh = ex.type === 'high';
          const labelY = isHigh ? Math.max(10, exY - 7) : Math.min(svgHeight - 12, exY + 12);

          return (
            <g key={idx} opacity={Math.abs(exX - currentX) < 18 ? 0.35 : 1}>
              <circle
                cx={exX}
                cy={exY}
                r={3}
                fill={isHigh ? 'var(--accent-tide)' : 'var(--fg-muted)'}
                stroke="var(--glass-bg-strong)"
                strokeWidth={1.5}
              />
              <text
                x={exX}
                y={labelY}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={600}
                fill="var(--fg)"
                className="font-sans tabular-nums"
              >
                {`${ex.height >= 0 ? '+' : ''}${ex.height.toFixed(1)}m`}
              </text>
            </g>
          );
        })}

        {/* Current Time vertical guideline */}
        <line
          x1={currentX}
          y1={padding.top - 2}
          x2={currentX}
          y2={padding.top + innerH}
          stroke="var(--accent-sun)"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          strokeOpacity={0.65}
        />

        {/* Current Time pointer on the curve */}
        {currentY !== null && (
          <g>
            {/* Outer halo / glow */}
            <circle
              cx={currentX}
              cy={currentY}
              r={7}
              fill="var(--accent-sun)"
              fillOpacity={0.25}
            />
            {/* Main bead */}
            <circle
              cx={currentX}
              cy={currentY}
              r={4.5}
              fill="var(--accent-sun)"
              stroke="var(--glass-bg-strong)"
              strokeWidth={2}
            />
            {/* Center white core */}
            <circle cx={currentX} cy={currentY} r={1.75} fill="#ffffff" />

            {/* Current height floating badge */}
            {activeHeight !== null && (
              <g>
                <rect
                  x={
                    pillAnchor === 'middle'
                      ? pillX - tooltipWidth / 2
                      : pillAnchor === 'start'
                        ? pillX
                        : pillX - tooltipWidth
                  }
                  y={pillY - tooltipHeight + 3}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={4}
                  fill="var(--accent-sun)"
                  fillOpacity={0.95}
                />
                <text
                  x={
                    pillAnchor === 'middle'
                      ? pillX
                      : pillAnchor === 'start'
                        ? pillX + tooltipWidth / 2
                        : pillX - tooltipWidth / 2
                  }
                  y={pillY - 2}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill="#ffffff"
                  className="font-sans tabular-nums"
                >
                  {`${activeHeight >= 0 ? '+' : ''}${activeHeight.toFixed(2)}m`}
                </text>
              </g>
            )}
          </g>
        )}

        {/* Time axis labels */}
        {[0, 6, 12, 18, 24].map((hr) => {
          const x = padding.left + (hr / 24) * innerW;
          return (
            <text
              key={hr}
              x={x}
              y={svgHeight - 4}
              textAnchor="middle"
              fontSize={8.5}
              fill="var(--fg-muted)"
              className="font-sans tabular-nums"
            >
              {hr === 24 ? '24:00' : `${String(hr).padStart(2, '0')}:00`}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-fg-muted">
        <span>00:00</span>
        <span className="font-semibold text-sun-text tabular-nums">{formatTime(currentTime)}</span>
        <span>24:00</span>
      </div>
    </div>
  );
}
