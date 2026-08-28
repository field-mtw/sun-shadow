'use client';

import { useState } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onToggle, children }: BottomSheetProps) {
  return (
    <div 
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 glass-panel rounded-t-2xl transition-transform duration-300 ${isOpen ? 'translate-y-0 h-[60vh]' : 'translate-y-[calc(100%-3rem)] h-[60vh]'}`}
    >
      <div 
        className="h-12 flex items-center justify-center cursor-pointer border-b border-slate-200 dark:border-slate-700"
        onClick={onToggle}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
      </div>
      <div className="h-[calc(100%-3rem)] overflow-y-auto p-4 custom-scrollbar">
        {children}
      </div>
    </div>
  );
}
