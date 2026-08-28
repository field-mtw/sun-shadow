'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export default function Chip({
  selected,
  onClick,
  children,
  icon,
  tone = 'neutral',
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'sun' | 'wind' | 'tide';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-[var(--radius-chip)] px-2 text-xs font-medium text-fg transition-[background,transform] duration-[var(--dur-1)] hover:bg-[var(--glass-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg-strong)]',
        selected && tone === 'sun' && 'bg-[var(--accent-sun-soft)] text-sun-text',
        selected && tone === 'wind' && 'bg-[var(--accent-wind-soft)] text-wind',
        selected && tone === 'tide' && 'bg-[var(--accent-tide-soft)] text-tide',
        selected && tone === 'neutral' && 'bg-[var(--accent-sun-soft)] text-sun-text',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
