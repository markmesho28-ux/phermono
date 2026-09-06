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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-sm">Close</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
