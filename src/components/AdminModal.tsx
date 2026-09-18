import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative mx-auto flex w-full max-w-[460px] flex-col rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white shadow-2xl max-h-[90dvh] overflow-hidden pointer-events-auto animate-fadeIn"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/90 px-4 py-3 shrink-0">
          <h3 className="text-sm font-bold text-brand-black">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-stone-500 hover:text-brand-black hover:bg-stone-200/60 transition-colors touch-target cursor-pointer pointer-events-auto"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pointer-events-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
