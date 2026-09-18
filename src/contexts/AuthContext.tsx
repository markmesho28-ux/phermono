import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import type { AuthContextValue, AuthUser, AuthUserWithPassword, LoginParams, ProfileUpdate, SignupParams } from '../types';
import { ADMIN_PHONE_NUMBER, checkIsAdminRole, isAdminPhone, normalizePhone } from '../utils/admin';

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'phermono_auth_v1';
const USERS_KEY = 'phermono_users_v1';

// Seed admin account for immediate offline/local access and admin fallback
const DEFAULT_ADMIN_ACCOUNT: AuthUserWithPassword = {
  name: 'wassef',
  phone: ADMIN_PHONE_NUMBER,
  address: 'Headquarters',
  governorate: 'Cairo',
  password: 'admin',
  role: 'admin',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUserWithPassword[]>([]);

  useEffect(() => {
    // Load any saved client-side session/profile
    try {
      const rawSession = localStorage.getItem(STORAGE_KEY);
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        if (parsed && typeof parsed === 'object') {
          // Verify and enforce admin role and name if phone or flags match
          if (checkIsAdminRole(parsed) || isAdminPhone(parsed.phone)) {
            parsed.role = 'admin';
            if (isAdminPhone(parsed.phone)) {
              parsed.name = 'wassef';
            }
          }
          setUser(parsed);
        }
      }
    } catch (e) {}

    // Load registered users and guarantee the admin account is present
    try {
      const rawUsers = localStorage.getItem(USERS_KEY);
      let parsed = (rawUsers ? JSON.parse(rawUsers) : []) as AuthUserWithPassword[];
      if (!Array.isArray(parsed)) parsed = [];

      const adminIdx = parsed.findIndex(
        (u) => u && (isAdminPhone(u.phone) || checkIsAdminRole(u))
      );

      if (adminIdx === -1) {
        parsed.push(DEFAULT_ADMIN_ACCOUNT);
      } else {
        parsed[adminIdx] = {
          ...parsed[adminIdx],
          name: isAdminPhone(parsed[adminIdx].phone) ? 'wassef' : (parsed[adminIdx].name || 'wassef'),
          phone: parsed[adminIdx].phone || ADMIN_PHONE_NUMBER,
          role: 'admin',
        };
      }

      setUsers(parsed);
      localStorage.setItem(USERS_KEY, JSON.stringify(parsed));
    } catch (e) {
      setUsers([DEFAULT_ADMIN_ACCOUNT]);
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify([DEFAULT_ADMIN_ACCOUNT]));
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } catch (_) {}
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  }, [user]);

  // On mount, check Supabase auth and synchronize profile / role safely
  useEffect(() => {
    const init = async () => {
      try {
        if (!supabase) return;
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          // If Supabase session is not found, maintain current local session if already present
          return;
        }

        const supaUser = data.user as any;

        // Fetch profile row to get role and extra profile fields
        let profile: any = null;
        try {
          const { data: pfData, error: pfErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', supaUser.id)
            .maybeSingle();

          if (!pfErr) {
            profile = pfData;
          }
        } catch (pfFetchErr) {
          console.warn('Profile fetch warning on init:', pfFetchErr);
        }

        const userPhone = profile?.phone || supaUser.phone || supaUser.user_metadata?.phone || '';
        const isWassef =
          isAdminPhone(userPhone) ||
          isAdminPhone(profile?.phone) ||
          isAdminPhone(supaUser.phone) ||
          isAdminPhone(supaUser.user_metadata?.phone);

        // Ensure database profile in public.profiles table has name/full_name set to "wassef"
        if (isWassef && supabase && supaUser.id) {
          if (profile?.name !== 'wassef' || profile?.full_name !== 'wassef') {
            try {
              await supabase
                .from('profiles')
                .update({ name: 'wassef', full_name: 'wassef' })
                .eq('id', supaUser.id);
            } catch (updErr) {
              console.warn('Failed to update admin profile name in Supabase:', updErr);
            }
          }
        }

        const isAdmin =
          isWassef ||
          checkIsAdminRole(profile) ||
          checkIsAdminRole(supaUser);

        const role = isAdmin ? 'admin' : (profile?.role || supaUser.user_metadata?.role || 'customer');
        const displayName = isWassef
          ? 'wassef'
          : (profile?.name || supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || (isAdmin ? 'wassef' : ''));

        const sessionUser: AuthUser = {
          name: displayName,
          phone: userPhone,
          address: profile?.address || '',
          governorate: profile?.governorate || '',
          role,
        };

        setUser(sessionUser);
      } catch (e) {
        console.warn('Auth init error:', e);
      }
    };

    init();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (_) {}
  }, [users]);

  const signup = async ({ name, phone, address, governorate, password }: SignupParams) => {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || !password) return { error: 'Phone and password required' };

    const isTargetAdmin = isAdminPhone(cleanPhone) || isAdminPhone(phone);
    const assignedRole = isTargetAdmin ? 'admin' : 'customer';

    // Prevent duplicate local users
    if (users.some((u) => normalizePhone(u.phone) === cleanPhone)) {
      return { error: 'Phone already registered locally' };
    }

    try {
      // Generate internal service email for Supabase using the phone number
      const emailLocalPart = cleanPhone || String(Date.now());
      const dummyEmail = `${emailLocalPart}@phermono.local`;

      // Sign up via Supabase Auth
      let userId: string | null = null;
      if (supabase) {
        try {
          const { data: signData, error: signError } = await supabase.auth.signUp({
            email: dummyEmail,
            password,
            options: {
              data: {
                phone: cleanPhone,
                role: assignedRole,
                is_admin: isTargetAdmin,
                full_name: name || '',
              },
            },
          });

          if (!signError && signData?.user) {
            userId = signData.user.id;
          }
        } catch (supaErr) {
          console.warn('Supabase auth.signUp non-fatal error:', supaErr);
        }
      }

      // Upsert profile record if userId is available
      if (userId && supabase) {
        try {
          const profileName = isTargetAdmin ? 'wassef' : (name || null);
          const profileRow = {
            id: userId,
            email: dummyEmail,
            role: assignedRole,
            is_admin: isTargetAdmin,
            name: profileName,
            full_name: profileName,
            phone: cleanPhone,
            address: address || null,
            governorate: governorate || null,
            created_at: new Date().toISOString(),
          };

          await supabase.from('profiles').upsert([profileRow], { onConflict: 'id' });
        } catch (e) {
          console.warn('Profiles upsert exception:', e);
        }
      }

      // Maintain local users list
      const newUser: AuthUserWithPassword = {
        name: isTargetAdmin ? 'wassef' : (name || ''),
        phone: cleanPhone,
        address: address || '',
        governorate: governorate || '',
        password,
        role: assignedRole,
      };

      setUsers((prev) => [...prev, newUser]);
      const userSession: AuthUser = {
        name: newUser.name,
        phone: newUser.phone,
        address: newUser.address,
        governorate: newUser.governorate,
        role: newUser.role,
      };

      setUser(userSession);
      return { user: userSession };
    } catch (err: any) {
      return { error: err?.message || String(err) };
    }
  };

  const login = async ({ phone, password }: LoginParams) => {
    const identifier = String(phone || '').trim();
    if (!identifier || !password) return { error: 'Phone/email and password required' };

    const cleanPhone = normalizePhone(identifier);
    const isTargetAdmin = isAdminPhone(identifier) || isAdminPhone(cleanPhone);

    // Try Supabase authentication first if supabase is configured
    if (supabase) {
      const emailCandidates: string[] = [];
      if (identifier.includes('@')) {
        emailCandidates.push(identifier.toLowerCase());
      } else {
        emailCandidates.push(`${cleanPhone}@phermono.com`);
        emailCandidates.push(`${cleanPhone}@phermono.local`);
      }

      for (const email of emailCandidates) {
        try {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (!signInErr && signInData?.user) {
            const supaUser = signInData.user as any;

            // Fetch profile for role and attributes
            let profile: any = null;
            try {
              const { data: pfData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', supaUser.id)
                .maybeSingle();

              profile = pfData;
            } catch (pfErr) {
              console.warn('Profile fetch after login warning:', pfErr);
            }

            const isWassef =
              isTargetAdmin ||
              isAdminPhone(profile?.phone) ||
              isAdminPhone(supaUser?.phone) ||
              isAdminPhone(supaUser?.user_metadata?.phone);

            // DATABASE PROFILE UPDATE:
            // Ensure display name / full name in public.profiles table is set/updated to "wassef"
            if (isWassef && supabase && supaUser?.id) {
              if (profile?.name !== 'wassef' || profile?.full_name !== 'wassef') {
                try {
                  await supabase
                    .from('profiles')
                    .update({ name: 'wassef', full_name: 'wassef' })
                    .eq('id', supaUser.id);
                } catch (updErr) {
                  console.warn('Failed to update admin profile name on login:', updErr);
                }
              }
            }

            const isAdmin =
              isTargetAdmin ||
              checkIsAdminRole(profile) ||
              checkIsAdminRole(supaUser);

            const role = isAdmin ? 'admin' : (profile?.role || supaUser.user_metadata?.role || 'customer');

            const displayName = isWassef
              ? 'wassef'
              : (profile?.name ||
                 supaUser.user_metadata?.full_name ||
                 supaUser.user_metadata?.name ||
                 (isAdmin ? 'wassef' : ''));

            const sessionUser: AuthUser = {
              name: displayName,
              phone: profile?.phone || supaUser.phone || supaUser.user_metadata?.phone || cleanPhone || identifier,
              address: profile?.address || '',
              governorate: profile?.governorate || '',
              role,
            };

            setUser(sessionUser);
            return { user: sessionUser };
          }
        } catch (_) {
          // Try next email candidate
        }
      }
    }

    // Fall back to local users store
    const found = users.find(
      (u) =>
        (normalizePhone(u.phone) === cleanPhone || String(u.phone).trim() === identifier) &&
        u.password === password
    );

    if (found) {
      const isAdmin = isTargetAdmin || checkIsAdminRole(found);
      const isWassef = isTargetAdmin || isAdminPhone(found.phone);
      const u: AuthUser = {
        name: isWassef ? 'wassef' : (found.name || (isAdmin ? 'wassef' : '')),
        phone: found.phone || cleanPhone,
        address: found.address || '',
        governorate: found.governorate || '',
        role: isAdmin ? 'admin' : (found.role || 'customer'),
      };
      setUser(u);
      return { user: u };
    }

    // Bypass / Fallback for Admin Phone: if signing in with admin phone and matching default password
    if (isTargetAdmin && (password === 'admin' || password === DEFAULT_ADMIN_ACCOUNT.password)) {
      const adminSession: AuthUser = {
        name: 'wassef',
        phone: cleanPhone || ADMIN_PHONE_NUMBER,
        address: 'Headquarters',
        governorate: 'Cairo',
        role: 'admin',
      };
      setUser(adminSession);
      return { user: adminSession };
    }

    return { error: 'Invalid credentials' };
  };

  const logout = async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (_) {}
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  };

  // Update profile for the currently authenticated user with Supabase sync
  const updateProfile = async (updates: ProfileUpdate): Promise<{ error?: string; user?: AuthUser }> => {
    if (!user) return { error: 'Not authenticated' };

    const oldPhone = String(user.phone || '');
    const newPhone = updates.phone !== undefined ? String(updates.phone).trim() : oldPhone;
    const cleanOldPhone = normalizePhone(oldPhone);
    const cleanNewPhone = normalizePhone(newPhone);

    const isNowAdmin =
      checkIsAdminRole(user) ||
      isAdminPhone(newPhone) ||
      isAdminPhone(cleanNewPhone);

    // If admin phone, enforce "wassef"
    const assignedName = (isNowAdmin && (isAdminPhone(newPhone) || isAdminPhone(cleanNewPhone)))
      ? 'wassef'
      : (updates.name !== undefined ? updates.name.trim() : (user.name || ''));

    const sanitizedUpdates: ProfileUpdate = {
      name: assignedName,
      phone: newPhone,
      address: updates.address !== undefined ? updates.address.trim() : (user.address || ''),
      governorate: updates.governorate !== undefined ? updates.governorate : (user.governorate || ''),
    };

    // 1. Update local users array
    setUsers((prev) => {
      const next = prev.map((u) => {
        if (
          String(u.phone) === oldPhone ||
          normalizePhone(u.phone) === cleanOldPhone ||
          (cleanNewPhone && normalizePhone(u.phone) === cleanNewPhone)
        ) {
          return {
            ...u,
            ...sanitizedUpdates,
            role: isNowAdmin ? 'admin' : (u.role || 'customer'),
          };
        }
        return u;
      });
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    const updatedUser: AuthUser = {
      ...user,
      ...sanitizedUpdates,
      role: isNowAdmin ? 'admin' : user.role,
    };

    setUser(updatedUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    } catch (_) {}

    // 2. DATABASE SYNC: Update Supabase public.profiles table
    if (supabase) {
      try {
        const { data: supaAuthData } = await supabase.auth.getUser();
        const supaUser = supaAuthData?.user;

        const dbFields: Record<string, any> = {
          name: sanitizedUpdates.name || null,
          full_name: sanitizedUpdates.name || null,
          phone: cleanNewPhone || newPhone || null,
          address: sanitizedUpdates.address || null,
          governorate: sanitizedUpdates.governorate || null,
          role: isNowAdmin ? 'admin' : (user.role || 'customer'),
          is_admin: isNowAdmin,
        };

        if (supaUser?.id) {
          // Update user_metadata in Supabase Auth
          try {
            await supabase.auth.updateUser({
              data: {
                full_name: sanitizedUpdates.name,
                name: sanitizedUpdates.name,
                phone: cleanNewPhone || newPhone,
              },
            });
          } catch (mErr) {
            console.warn('Supabase auth metadata update non-fatal error:', mErr);
          }

          // Target public.profiles table matching supaUser.id
          const { error: updErr, data: updData } = await supabase
            .from('profiles')
            .update(dbFields)
            .eq('id', supaUser.id)
            .select();

          if (updErr || !updData || updData.length === 0) {
            // If row doesn't exist yet, upsert it
            const { error: upsertErr } = await supabase
              .from('profiles')
              .upsert([
                {
                  id: supaUser.id,
                  email: supaUser.email,
                  ...dbFields,
                  created_at: new Date().toISOString(),
                },
              ], { onConflict: 'id' });

            if (upsertErr) {
              console.warn('Supabase profile upsert warning:', upsertErr);
            }
          }
        } else {
          // Fallback: update profile row matching phone number
          const filterPhone = cleanOldPhone || cleanNewPhone;
          if (filterPhone) {
            await supabase
              .from('profiles')
              .update(dbFields)
              .eq('phone', filterPhone);
          }
        }
      } catch (syncErr) {
        console.warn('Supabase profile sync exception:', syncErr);
      }
    }

    return { user: updatedUser };
  };

  const changePassword = ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) => {
    if (!user) return { error: 'Not authenticated' };
    const phone = String(user.phone);
    const found = users.find(
      (u) => String(u.phone) === phone || normalizePhone(u.phone) === normalizePhone(phone)
    );
    if (!found) return { error: 'User not found' };
    if (found.password !== currentPassword) return { error: 'Current password incorrect' };

    setUsers((prev) => {
      const next = prev.map((u) =>
        String(u.phone) === phone || normalizePhone(u.phone) === normalizePhone(phone)
          ? { ...u, password: newPassword }
          : u
      );
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{ user, users, signup, login, logout, updateProfile, changePassword }}
    >
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
