import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Elevation = 1 | 2;

export default function GlassPanel({
  as: Comp = 'div',
  elevation = 1,
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'aside' | 'header' | 'section' | 'nav' | 'footer';
  elevation?: Elevation;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Comp
      className={cn('glass-panel', elevation === 2 && 'glass-panel-strong', className)}
      {...rest}
    >
      {children}
    </Comp>
  );
}
