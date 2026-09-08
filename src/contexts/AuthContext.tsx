import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import type { AuthContextValue, AuthUser, AuthUserWithPassword, LoginParams, ProfileUpdate, SignupParams } from '../types';

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'phermono_auth_v1';
const USERS_KEY = 'phermono_users_v1';

// No hardcoded admin account; admin status is determined from Supabase `profiles`.

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUserWithPassword[]>([]);

  useEffect(() => {
    // Load any saved client-side session/profile (offline/demo fallback)
    try {
      const rawSession = localStorage.getItem(STORAGE_KEY);
      if (rawSession) {
        setUser(JSON.parse(rawSession));
      }
    } catch (e) {}

    try {
      const rawUsers = localStorage.getItem(USERS_KEY);
      if (rawUsers) {
        const parsed = (JSON.parse(rawUsers) || []) as AuthUserWithPassword[];
        setUsers(parsed);
      } else {
        setUsers([]);
      }
    } catch (e) {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  }, [user]);

  // On mount, check Supabase auth and fetch profile role if possible
  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) return;
        const supaUser = (data as any)?.user ?? null;
        if (!supaUser) return;

        // fetch profile row to get role / is_admin flag
        const { data: profile, error: pfErr } = await supabase
          .from('profiles')
          .select('id,role,is_admin,name,phone,address,governorate')
          .eq('id', supaUser.id)
          .single();
        if (pfErr) {
          console.warn('Failed to fetch profile for current user:', pfErr.message || pfErr);
          return;
        }
        if (profile) {
          const role = profile.role || (profile.is_admin ? 'admin' : 'customer');
          const sessionUser: AuthUser = {
            name: profile.name || '',
            phone: profile.phone || '',
            address: profile.address || '',
            governorate: profile.governorate || '',
            role,
          };
          setUser(sessionUser);
        }
      } catch (e) {
        console.warn('Auth init error', e);
      }
    };
    init();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) {}
  }, [users]);

  const signup = async ({ name, phone, address, governorate, password }: SignupParams) => {
    const cleanPhone = String(phone || '').trim();
    if (!cleanPhone || !password) return { error: 'Phone and password required' };

    // prevent duplicate local users
    if (users.some(u => u.phone === cleanPhone)) return { error: 'Phone already registered locally' };

    try {
      // Generate an internal dummy email for Supabase using the phone number
      const emailLocalPart = String(cleanPhone).replace(/[^0-9a-zA-Z]/g, '') || String(Date.now());
      const dummyEmail = `${emailLocalPart}@phermono.local`;

      // Sign up via Supabase Auth using the generated dummy email
      const { data: signData, error: signError } = await supabase.auth.signUp({ email: dummyEmail, password });
      if (signError) {
        console.error('supabase.auth.signUp error:', signError);
        return { error: signError.message || String(signError) };
      }

      // Log full signUp response for debugging (may include session or user depending on confirmation settings)
      console.debug('supabase.auth.signUp response:', signData);

      const userId = (signData as any)?.user?.id ?? null;

      if (!userId) {
        // When email confirmation is enabled, Supabase may not return an active user id yet.
        console.warn('No user id returned from signUp; email confirmation may be required. signUp response:', signData);
      }

      // Upsert profile record so it appears in Supabase Table Editor — only if we have an id.
      if (userId) {
        try {
          const profileRow = {
            id: userId,
            email: dummyEmail,
            role: 'customer',
            name: name || null,
            full_name: name || null,
            phone: cleanPhone || null,
            address: address || null,
            governorate: governorate || null,
            created_at: new Date().toISOString(),
          } as any;

          const { data: upsertData, error: upsertErr } = await supabase.from('profiles').upsert([profileRow], { onConflict: 'id' }).select();
          if (upsertErr) {
            console.error('profiles upsert error:', upsertErr);
            if ((upsertErr as any)?.message?.toLowerCase().includes('permission') || (upsertErr as any)?.code === '42501' || (upsertErr as any)?.status === 401) {
              console.warn('Possible RLS/permission issue while upserting profiles. Consider using a server-side migration or service_role for initial writes.');
            }
          } else {
            console.debug('profiles upsert result:', upsertData);
          }
        } catch (e: any) {
          console.error('Failed to upsert profile (exception):', e?.message || e, e);
        }
      } else {
        console.info('Skipping profiles upsert because no user id was returned. The user may need to confirm email before a profile can be created.');
      }

      // Maintain local users list for offline/demo fallback
      const newUser: AuthUserWithPassword = { name: name || '', phone: cleanPhone, address: address || '', governorate: governorate || '', password, role: 'customer' };
      setUsers(prev => [...prev, newUser]);
      const userSession: AuthUser = { name: newUser.name, phone: newUser.phone, address: newUser.address, governorate: newUser.governorate, role: newUser.role };
      setUser(userSession);
      return { user: userSession };
    } catch (err: any) {
      return { error: err?.message || String(err) };
    }
  };

  const login = async ({ phone, password }: LoginParams) => {
    const identifier = String(phone || '').trim();
    if (!identifier || !password) return { error: 'Phone/email and password required' };

    // Determine email: if input contains '@' treat it as email, otherwise map phone -> service email
    const email = identifier.includes('@') ? identifier : `${String(identifier).replace(/[^0-9]/g, '')}@phermono.com`;

    try {
      // Attempt Supabase email/password sign-in
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        console.warn('supabase.auth.signInWithPassword failed:', signInErr.message || signInErr);
        // Fall back to local users if available
        const cleanPhone = identifier.replace(/\D/g, '');
        const found = users.find(u => String(u.phone).replace(/\D/g, '') === cleanPhone && u.password === password);
        if (!found) return { error: 'Invalid credentials' };
        const u: AuthUser = { name: found.name, phone: found.phone, address: found.address, governorate: found.governorate || '', role: found.role };
        setUser(u);
        return { user: u };
      }

      const supaUser = (signInData as any)?.user ?? null;
      if (!supaUser) {
        // no user returned; fallback to local users
        const cleanPhone = identifier.replace(/\D/g, '');
        const found = users.find(u => String(u.phone).replace(/\D/g, '') === cleanPhone && u.password === password);
        if (!found) return { error: 'Invalid credentials' };
        const u: AuthUser = { name: found.name, phone: found.phone, address: found.address, governorate: found.governorate || '', role: found.role };
        setUser(u);
        return { user: u };
      }

      // fetch profile to get role/is_admin and profile fields
      try {
        const { data: profile, error: pfErr } = await supabase
          .from('profiles')
          .select('id,role,is_admin,name,phone,address,governorate')
          .eq('id', supaUser.id)
          .single();
        if (pfErr) {
          console.warn('Failed to fetch profile during login:', pfErr.message || pfErr);
        }
        if (profile) {
          const role = profile.role || (profile.is_admin ? 'admin' : 'customer');
          const sessionUser: AuthUser = {
            name: profile.name || '',
            phone: profile.phone || '',
            address: profile.address || '',
            governorate: profile.governorate || '',
            role,
          };
          setUser(sessionUser);
          return { user: sessionUser };
        }
      } catch (e) {
        console.warn('Error fetching profile after sign-in', e);
      }

      // If no profile, still set a basic session user from Supabase attributes where possible
      const sessionUser: AuthUser = {
        name: (supaUser.user_metadata && (supaUser.user_metadata.full_name || supaUser.user_metadata.name)) || '',
        phone: '',
        address: '',
        governorate: '',
        role: 'customer',
      };
      setUser(sessionUser);
      return { user: sessionUser };
    } catch (err: any) {
      console.error('Login error', err?.message || err);
      return { error: err?.message || String(err) };
    }
  };

  const logout = () => setUser(null);

  // Update profile for the currently authenticated user
  const updateProfile = (updates: ProfileUpdate) => {
    if (!user) return { error: 'Not authenticated' };
    const phone = String(user.phone);
    setUsers(prev => {
      const next = prev.map(u => {
        if (String(u.phone) === phone) {
          return { ...u, ...updates };
        }
        return u;
      });
      try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
    const updatedUser: AuthUser = { ...user, ...updates };
    setUser(updatedUser);
    return { user: updatedUser };
  };

  const changePassword = ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    if (!user) return { error: 'Not authenticated' };
    const phone = String(user.phone);
    const found = users.find(u => String(u.phone) === phone);
    if (!found) return { error: 'User not found' };
    if (found.password !== currentPassword) return { error: 'Current password incorrect' };
    setUsers(prev => {
      const next = prev.map(u => String(u.phone) === phone ? { ...u, password: newPassword } : u);
      try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
    return { ok: true };
  };

  return (
    <AuthContext.Provider value={{ user, users, signup, login, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
