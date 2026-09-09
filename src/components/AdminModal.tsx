import React, { useEffect, useRef } from 'react';

interface AdminModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export default function AdminModal({ open, title, children, onClose }: AdminModalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = 0;
      node.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, title]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 overflow-hidden bg-black/40 md:inset-0 md:flex md:items-start md:justify-center md:p-4"
      style={{ top: 'var(--header-height, 0px)' }}
    >
      <div className="relative mx-auto flex w-full max-w-[420px] flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] box-border md:my-0 md:max-h-[min(90dvh,540px)] md:rounded-2xl md:h-auto md:max-w-[420px] md:w-full md:overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2.5">
          <h3 className="text-[10.5px] font-bold text-brand-black sm:text-xs">{title}</h3>
          <button onClick={onClose} className="text-[10px] text-stone-600 hover:text-brand-black touch-target sm:text-[11px]">Close</button>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-3 md:pb-3 md:pt-2"
          style={{ WebkitOverflowScrolling: 'touch', maxHeight: 'calc(100dvh - var(--header-height, 0px) - 12px)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
