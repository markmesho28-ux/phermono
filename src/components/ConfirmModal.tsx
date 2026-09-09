import React from 'react';

export default function ConfirmModal({ open, message, onConfirm, onCancel }: { open: boolean; message: string; onConfirm: () => void; onCancel: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl w-[min(560px,90%)] p-6">
        <h3 className="text-lg font-semibold mb-2">Confirm action</h3>
        <div className="text-sm text-stone-600 mb-4">{message}</div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 bg-stone-100 text-stone-700 rounded">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded">Delete</button>
        </div>
      </div>
    </div>
  );
}
