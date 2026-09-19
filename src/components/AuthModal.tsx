import React, { useState, useRef } from 'react';
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
  // Guard against duplicate/delayed submissions: mark when submitting to let pointerdown-triggered handlers avoid double-submit
  const submittingRef = useRef(false);

  const GOVERNORATES = ['أسوان','أسيوط'];

  if (!open) return null;

  const handleSignIn = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    if (!form.phone || !form.password) {
      setError('Phone and password are required');
      submittingRef.current = false;
      return;
    }

    try {
      const res = await login({ phone: form.phone, password: form.password });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (onSuccess) onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      submittingRef.current = false;
    }
  };

  const handleSignUp = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    if (!form.phone || !form.password || !form.name) {
      setError('Name, phone and password are required');
      submittingRef.current = false;
      return;
    }

    if (!form.governorate) {
      setError('Please select your governorate');
      submittingRef.current = false;
      return;
    }

    try {
      const res = await signup({
        name: form.name,
        phone: form.phone,
        address: form.address,
        governorate: form.governorate,
        password: form.password,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (onSuccess) onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-stone-200/80 animate-fadeIn pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
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
            className="p-2 rounded-full hover:bg-stone-100 text-stone-400 hover:text-brand-black transition-colors touch-target cursor-pointer pointer-events-auto"
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
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all touch-target cursor-pointer pointer-events-auto ${
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
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all touch-target cursor-pointer pointer-events-auto ${
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
            if (submittingRef.current) return;
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
                onPointerDown={(e)=>{ e.stopPropagation(); (e.target as HTMLInputElement).focus(); }}
                style={{ fontSize: '16px', touchAction: 'manipulation' }}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all pointer-events-auto"
                autoComplete="name"
              />
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <p className="text-xs text-stone-500 mb-1">
                {/* Email is not collected from the user; a service email is generated from phone. */}
              </p>
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
              onPointerDown={(e)=>{ e.stopPropagation(); (e.target as HTMLInputElement).focus(); }}
              style={{ fontSize: '16px', touchAction: 'manipulation' }}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all pointer-events-auto"
              autoComplete="tel"
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
              onPointerDown={(e)=>{ e.stopPropagation(); (e.target as HTMLInputElement).focus(); }}
              style={{ fontSize: '16px', touchAction: 'manipulation' }}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all pointer-events-auto"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
                onPointerDown={(e)=>{ e.stopPropagation(); (e.target as HTMLInputElement).focus(); }}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold placeholder:text-stone-400 text-brand-black transition-all pointer-events-auto"
                style={{ fontSize: '16px', touchAction: 'manipulation' }}
                autoComplete="street-address"
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
                onPointerDown={(e)=>{ e.stopPropagation(); }}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold text-brand-black pointer-events-auto"
                style={{ fontSize: '16px', touchAction: 'manipulation' }}
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
              onPointerDown={(e)=>{ e.stopPropagation(); }}
              style={{ touchAction: 'manipulation' }}
              className="px-4 py-2 text-sm font-semibold text-stone-600 hover:text-brand-black rounded-xl transition-colors touch-target"
            >
              Cancel
            </button>
            {mode === 'signin' ? (
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold bg-brand-black text-white rounded-xl shadow-luxury hover:bg-brand-charcoal transition-all active:scale-98 touch-target"
              >
                Sign In
              </button>
            ) : (
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold bg-brand-black text-white rounded-xl shadow-luxury hover:bg-brand-charcoal transition-all active:scale-98 touch-target"
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
