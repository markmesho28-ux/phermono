import React, { useState } from 'react';
import { X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-stone-200/80 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-brand-black">
              {mode === 'signin' ? 'Welcome Back' : 'Create an Account'}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {mode === 'signin'
                ? 'Sign in to access your orders and account'
                : 'Join PherMono for authentic luxury cosmetics'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-100 text-stone-400 hover:text-brand-black transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1.5 mb-5 p-1 bg-stone-100 rounded-xl">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'signin'
                ? 'bg-brand-black text-white shadow-sm'
                : 'text-stone-600 hover:text-brand-black'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-brand-black text-white shadow-sm'
                : 'text-stone-600 hover:text-brand-black'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (mode === 'signin') handleSignIn();
            else handleSignUp();
          }}
          className="space-y-3.5"
        >
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah Connor"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              placeholder={mode === 'signup' ? 'e.g. 01012345678' : 'Enter your registered phone number'}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Create a secure password' : 'Enter your password'}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Street Address <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 15 Gardenia St, Apt 4B"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all"
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Governorate <span className="text-red-500">*</span>
              </label>
              <select
                value={form.governorate}
                onChange={e => setForm({ ...form, governorate: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold text-brand-black transition-all"
              >
                <option value="">Select your governorate</option>
                {GOVERNORATES.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-stone-600 hover:text-brand-black rounded-xl transition-colors"
            >
              Cancel
            </button>
            {mode === 'signin' ? (
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold bg-brand-black text-white rounded-xl shadow-luxury hover:bg-brand-charcoal transition-all active:scale-98"
              >
                Sign In
              </button>
            ) : (
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold bg-brand-black text-white rounded-xl shadow-luxury hover:bg-brand-charcoal transition-all active:scale-98"
              >
                Create Account
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
