import React from 'react';

interface AdminModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export default function AdminModal({ open, title, children, onClose }: AdminModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4 min-h-full">
      <div className="my-auto w-full max-w-[360px] max-h-[500px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-stone-200">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-100 bg-stone-50/80">
          <h3 className="text-[11px] sm:text-xs font-bold text-brand-black">{title}</h3>
          <button onClick={onClose} className="text-[10px] sm:text-[11px] text-stone-600 hover:text-brand-black touch-target">Close</button>
        </div>
        <div className="max-h-[calc(500px-48px)] overflow-y-auto px-3 pb-16 pt-2 sm:px-3.5 sm:pb-16 sm:pt-2.5">
          {children}
        </div>
      </div>
    </div>
  );
}
