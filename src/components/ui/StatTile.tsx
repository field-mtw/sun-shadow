import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export default function StatTile({
  label,
  value,
  icon,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-chip)] bg-[rgba(255,255,255,0.35)] p-3 dark:bg-[rgba(0,0,0,0.22)]',
        className,
      )}
    >
      <div className="flex items-center gap-1 text-xs font-medium text-fg-muted">
        {icon}
        {label}
      </div>
      <div className={cn('mt-0.5 text-[15px] font-semibold leading-5 text-fg', valueClassName)}>
        {value}
      </div>
    </div>
  );
}
