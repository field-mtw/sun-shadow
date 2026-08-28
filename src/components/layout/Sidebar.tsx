'use client';

import React from 'react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function Sidebar({ isOpen, onToggle, children }: SidebarProps) {
  return (
    <aside 
      className={`hidden md:flex flex-col fixed md:relative z-40 h-full glass-panel transition-all duration-300 ease-in-out ${
        isOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 md:w-12'
      }`}
    >
      <div className="flex items-center justify-end p-2 border-b border-slate-200 dark:border-slate-700">
        <button 
          onClick={onToggle}
          className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>
      
      <div className={`flex-1 overflow-y-auto custom-scrollbar transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 invisible'
      }`}>
        {children}
      </div>
    </aside>
  );
}
