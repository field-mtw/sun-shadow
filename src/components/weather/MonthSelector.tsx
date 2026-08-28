'use client';

import { useTranslations } from 'next-intl';
import Chip from '@/components/ui/Chip';

interface MonthSelectorProps {
  value: number;
  onChange: (month: number) => void;
}

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

export default function MonthSelector({ value, onChange }: MonthSelectorProps) {
  const t = useTranslations('months');

  return (
    <div className="mb-3 grid grid-cols-4 gap-1">
      {MONTH_KEYS.map((key, index) => (
        <Chip
          key={key}
          tone="wind"
          selected={value === index}
          onClick={() => onChange(index)}
          className="h-7 justify-center"
        >
          {t(key)}
        </Chip>
      ))}
    </div>
  );
}
