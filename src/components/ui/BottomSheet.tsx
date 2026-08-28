'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import GlassPanel from '@/components/ui/GlassPanel';
import { cn } from '@/lib/cn';

interface BottomSheetProps {
  isOpen: boolean;
  onToggle: () => void;
  peekLabel: string;
  peekIcon?: ReactNode;
  peekMeta?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export default function BottomSheet({
  isOpen,
  onToggle,
  peekLabel,
  peekIcon,
  peekMeta,
  footer,
  children,
}: BottomSheetProps) {
  return (
    <GlassPanel
      as="section"
      elevation={2}
      className={cn(
        'pointer-events-auto fixed inset-x-0 bottom-0 z-[var(--z-hud)] flex flex-col rounded-t-[var(--radius-hud)] rounded-b-none md:hidden',
        'transition-[height] duration-[var(--dur-2)] ease-[var(--ease-out)]',
      )}
      style={{
        height: isOpen ? 'min(52dvh, 520px)' : 'auto',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="relative flex h-12 w-full shrink-0 items-center gap-2 px-4 pt-2"
        aria-expanded={isOpen}
      >
        <span className="absolute top-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-[var(--fg-faint)]" />
        {peekIcon ? <span className="shrink-0">{peekIcon}</span> : null}
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-fg">
          {peekLabel}
        </span>
        {peekMeta ? (
          <span className="shrink-0 text-[15px] font-semibold tabular-nums text-fg">{peekMeta}</span>
        ) : null}
        {isOpen ? (
          <ChevronDown size={18} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
        ) : (
          <ChevronUp size={18} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
        )}
      </button>

      <div
        className={cn(
          'custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4',
          isOpen ? 'block' : 'hidden',
        )}
      >
        {children}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-[var(--glass-border)] px-3 py-2.5">{footer}</div>
      ) : null}
    </GlassPanel>
  );
}
