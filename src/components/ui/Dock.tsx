import type { ReactNode } from 'react';
import GlassPanel from '@/components/ui/GlassPanel';
import { cn } from '@/lib/cn';

export default function Dock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassPanel
      as="footer"
      elevation={2}
      className={cn('time-dock pointer-events-auto px-3 py-3', className)}
    >
      {children}
    </GlassPanel>
  );
}
