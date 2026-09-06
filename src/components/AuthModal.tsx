import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { AuthUser } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (user?: AuthUser) => void;
}

export default function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [form, setForm] = useState({ name: '', phone: '', address: '', password: '', governorate: '' });
  const [error, setError] = useState<string | null>(null);

  const GOVERNORATES = [
    'Cairo','Giza','Alexandria','Dakahlia','Red Sea','Beheira','Fayoum','Gharbia','Ismailia','Kafr El Sheikh','Matruh','Minya','Monufia','New Valley','North Sinai','Port Said','Qalyubia','Qena','Sharqia','Sohag','South Sinai','Aswan','Asyut'
  ];

  if (!open) return null;

  const handleSignIn = async () => {
    setError(null);
    if (!form.phone || !form.password) return setError('Phone and password are required');
    const res = login({ phone: form.phone, password: form.password });
    if (res.error) return setError(res.error);
    if (onSuccess) onSuccess(res.user);
    onClose();
  };

  const handleSignUp = async () => {
    setError(null);
    if (!form.phone || !form.password || !form.name) return setError('Name, phone and password are required');
    if (!form.governorate) return setError('Please select your governorate');
    const res = signup({ name: form.name, phone: form.phone, address: form.address, governorate: form.governorate, password: form.password });
    if (res.error) return setError(res.error);
    if (onSuccess) onSuccess(res.user);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="font-bold mb-3">Account</h3>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMode('signin')} className={`px-3 py-2 rounded ${mode==='signin' ? 'bg-brand-black text-white' : 'bg-stone-100'}`}>Sign In</button>
          <button onClick={() => setMode('signup')} className={`px-3 py-2 rounded ${mode==='signup' ? 'bg-brand-black text-white' : 'bg-stone-100'}`}>Sign Up</button>
        </div>

        <div className="space-y-2">
          {mode === 'signup' && <input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full p-2 border rounded" />}
          <input placeholder="Phone number" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full p-2 border rounded" />
          <input placeholder="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full p-2 border rounded" />
          {mode === 'signup' && <input placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full p-2 border rounded" />}
          {mode === 'signup' && (
            <select value={form.governorate} onChange={e=>setForm({...form,governorate:e.target.value})} className="w-full p-2 border rounded">
              <option value="">Select governorate</option>
              {GOVERNORATES.map(g=> <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2">Cancel</button>
          {mode === 'signin' ? (
            <button onClick={handleSignIn} className="px-3 py-2 bg-black text-white rounded">Sign In</button>
          ) : (
            <button onClick={handleSignUp} className="px-3 py-2 bg-black text-white rounded">Create Account</button>
          )}
        </div>
      </div>
    </div>
  );
}
