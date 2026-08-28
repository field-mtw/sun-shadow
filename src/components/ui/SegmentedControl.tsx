'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; icon?: ReactNode; tone?: 'sun' | 'wind' | 'tide' }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="mb-3 grid rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={option.label}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-[10px] text-sm font-medium transition-colors duration-[var(--dur-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
              selected
                ? 'bg-[color-mix(in_oklab,var(--glass-bg-strong)_80%,white)] shadow-sm'
                : 'text-fg-muted hover:text-fg',
              selected && option.tone === 'sun' && 'text-sun-text',
              selected && option.tone === 'wind' && 'text-wind',
              selected && option.tone === 'tide' && 'text-tide',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
