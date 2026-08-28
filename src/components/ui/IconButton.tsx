'use client';

import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export default function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  active,
  disabled,
  loading,
  onClick,
  ...rest
}: {
  label: string;
  icon: LucideIcon;
  variant?: 'ghost' | 'solid' | 'sun' | 'wind' | 'tide';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'>) {
  const px = size === 'sm' ? 16 : 18;
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-chip)] text-fg transition-colors duration-[var(--dur-1)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--glass-bg-strong)] disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        variant === 'ghost' && 'hover:bg-[var(--glass-hover)]',
        variant === 'solid' && 'bg-[var(--glass-hover)]',
        variant === 'sun' && 'text-sun-text hover:bg-[var(--accent-sun-soft)]',
        variant === 'wind' && 'text-wind hover:bg-[var(--accent-wind-soft)]',
        variant === 'tide' && 'text-tide hover:bg-[var(--accent-tide-soft)]',
        active && variant === 'sun' && 'bg-[var(--accent-sun-soft)]',
        active && variant === 'wind' && 'bg-[var(--accent-wind-soft)]',
        active && variant === 'tide' && 'bg-[var(--accent-tide-soft)]',
        active && variant !== 'sun' && variant !== 'wind' && variant !== 'tide' && 'bg-[var(--glass-hover)]',
        className,
      )}
      {...rest}
    >
      <Icon size={px} strokeWidth={1.75} className={loading ? 'animate-spin' : undefined} />
    </button>
  );
}
