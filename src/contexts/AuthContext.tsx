import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthContextValue, AuthUser, AuthUserWithPassword, LoginParams, ProfileUpdate, SignupParams } from '../types';

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'phermono_auth_v1';
const USERS_KEY = 'phermono_users_v1';

const DEFAULT_ADMIN: AuthUserWithPassword = { name: 'Admin', phone: '0000000000', address: 'Headquarters', governorate: 'Cairo', password: 'admin', role: 'admin' };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUserWithPassword[]>([]);

  useEffect(() => {
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
        const idx = parsed.findIndex((u: AuthUserWithPassword | null | undefined) => u && String(u.phone) === String(DEFAULT_ADMIN.phone));
        if (idx === -1) {
          const merged = [...parsed, DEFAULT_ADMIN];
          setUsers(merged);
          localStorage.setItem(USERS_KEY, JSON.stringify(merged));
        } else {
          parsed[idx] = DEFAULT_ADMIN;
          setUsers(parsed);
          localStorage.setItem(USERS_KEY, JSON.stringify(parsed));
        }
      } else {
        // seed admin into users list
        setUsers([DEFAULT_ADMIN]);
        localStorage.setItem(USERS_KEY, JSON.stringify([DEFAULT_ADMIN]));
      }
    } catch (e) {
      setUsers([DEFAULT_ADMIN]);
      try { localStorage.setItem(USERS_KEY, JSON.stringify([DEFAULT_ADMIN])); } catch (err) {}
    }

    // also keep legacy admin account key for compatibility
    try { localStorage.setItem('phermono_admin_account', JSON.stringify(DEFAULT_ADMIN)); } catch (e) {}
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) {}
  }, [users]);

  const signup = ({ name, phone, address, governorate, password }: SignupParams) => {
    const cleanPhone = String(phone || '').trim();
    if (!cleanPhone || !password) return { error: 'Phone and password required' };
    if (users.some(u => u.phone === cleanPhone)) return { error: 'Phone already registered' };
    const newUser: AuthUserWithPassword = { name: name || '', phone: cleanPhone, address: address || '', governorate: governorate || '', password, role: 'customer' };
    setUsers(prev => [...prev, newUser]);
    const userSession: AuthUser = { name: newUser.name, phone: newUser.phone, address: newUser.address, governorate: newUser.governorate, role: newUser.role };
    setUser(userSession);
    return { user: userSession };
  };

  const login = ({ phone, password }: LoginParams) => {
    const cleanPhone = String(phone || '').trim();
    const found = users.find(u => u.phone === cleanPhone && u.password === password);
    if (!found) return { error: 'Invalid credentials' };
    const u: AuthUser = { name: found.name, phone: found.phone, address: found.address, governorate: found.governorate || '', role: found.role };
    setUser(u);
    return { user: u };
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
