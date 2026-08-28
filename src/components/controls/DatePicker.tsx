'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Snowflake, Sun } from 'lucide-react';
import { toLocalDateInputValue } from '@/lib/sun-engine';
import Chip from '@/components/ui/Chip';

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const t = useTranslations('date');

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const [year, month, day] = e.target.value.split('-').map(Number);
    if (!year || !month || !day) return;
    const next = new Date(value);
    next.setFullYear(year, month - 1, day);
    onChange(next);
  };

  const setPreset = (preset: 'today' | 'summer' | 'winter') => {
    const d = new Date(value);
    const now = new Date();
    d.setFullYear(now.getFullYear());
    if (preset === 'today') {
      d.setMonth(now.getMonth(), now.getDate());
    } else if (preset === 'summer') {
      d.setMonth(5, 21);
    } else {
      d.setMonth(11, 21);
    }
    onChange(d);
  };

  const today = new Date();
  const isToday =
    value.getDate() === today.getDate() &&
    value.getMonth() === today.getMonth() &&
    value.getFullYear() === today.getFullYear();
  const isSummer = value.getMonth() === 5 && value.getDate() === 21;
  const isWinter = value.getMonth() === 11 && value.getDate() === 21;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <label className="text-xs font-medium text-fg-muted">{t('title')}</label>
      <input
        type="date"
        aria-label={t('selectDate')}
        value={toLocalDateInputValue(value)}
        onChange={handleDateChange}
        className="date-field h-10 w-full rounded-[var(--radius-chip)] border border-[var(--glass-border)] bg-transparent px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
      <div className="flex flex-wrap gap-1.5">
        <Chip
          selected={isToday}
          tone="sun"
          onClick={() => setPreset('today')}
          icon={<Calendar size={12} strokeWidth={2} />}
        >
          {t('today')}
        </Chip>
        <Chip
          selected={isSummer}
          tone="sun"
          onClick={() => setPreset('summer')}
          icon={<Sun size={12} strokeWidth={2} />}
        >
          {t('summerSolstice')}
        </Chip>
        <Chip
          selected={isWinter}
          tone="sun"
          onClick={() => setPreset('winter')}
          icon={<Snowflake size={12} strokeWidth={2} />}
        >
          {t('winterSolstice')}
        </Chip>
      </div>
    </div>
  );
}
