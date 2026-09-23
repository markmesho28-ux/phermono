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

  const syncUsersFromProfiles = async () => {
    if (!supabase) return;

    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) return;

      const { data, error } = await supabase.from('profiles').select('*').eq('id', authUser.id);
      if (error) {
        console.error('Failed to fetch profiles from Supabase:', error);
        return;
      }

      const profileUsers = (Array.isArray(data) ? data : [])
        .map((row: any) => {
          const phone = normalizePhone(row?.phone || '');
          if (!phone) return null;

          const name = String(row?.name || row?.full_name || 'User').trim() || 'User';
          const isAdminRole = Boolean(row?.is_admin) || String(row?.role || '').toLowerCase() === 'admin' || isAdminPhone(phone);
          const finalName = isAdminRole && isAdminPhone(phone) ? 'wassef' : name;

          return {
            name: finalName,
            phone,
            address: row?.address || '',
            governorate: row?.governorate || '',
            password: '',
            role: isAdminRole ? 'admin' : 'customer',
          } as AuthUserWithPassword;
        })
        .filter(Boolean) as AuthUserWithPassword[];

      setUsers((prev) => {
        const merged = new Map<string, AuthUserWithPassword>();

        prev.forEach((existing) => {
          const key = normalizePhone(existing.phone || '');
          if (key) merged.set(key, existing);
        });

        profileUsers.forEach((profileUser) => {
          const key = normalizePhone(profileUser.phone || '');
          if (!key) return;
          const existing = merged.get(key);
          merged.set(key, {
            ...existing,
            ...profileUser,
            password: existing?.password || profileUser.password || '',
            role: profileUser.role || existing?.role || 'customer',
          });
        });

        const nextUsers = Array.from(merged.values());
        try {
          localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
        } catch (_) {}
        return nextUsers;
      });
    } catch (err) {
      console.error('Profile sync failed:', err);
    }
  };

  // On mount, check Supabase auth and synchronize profile / role safely
  // Profile synchronization is scoped to the current user and is invoked after signup.

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
        const isAdmin = Boolean(profile && (
          String(profile.role || '').toLowerCase() === 'admin' ||
          String(profile.role || '').toLowerCase() === 'superadmin' ||
          profile.is_admin === true
        ));

        const role = isAdmin ? 'admin' : 'customer';
        const displayName = profile?.name || supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || '';

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
    const trimmedName = String(name || '').trim();
    if (!cleanPhone || !password || !trimmedName) {
      return { error: 'Name, phone and password are required' };
    }

    // Admin access is provisioned in the database, never from a phone number
    // or client-controlled signup metadata.
    const assignedRole = 'customer';

    try {
      // Generate internal service email for Supabase using the phone number.
      const emailLocalPart = cleanPhone || String(Date.now());
      const dummyEmail = `${emailLocalPart}@phermono.local`;

      let userId: string | null = null;
      let signUpWarning: string | null = null;
      if (supabase) {
        const { data: signData, error: signError } = await supabase.auth.signUp({
          email: dummyEmail,
          password,
          options: {
            data: {
              phone: cleanPhone,
              role: assignedRole,
              is_admin: false,
              full_name: trimmedName,
              name: trimmedName,
            },
          },
        });

        if (signError) {
          console.error('Supabase auth.signUp failed:', signError);
          const message = String(signError.message || '').toLowerCase();
          if (message.includes('email') && message.includes('confirm')) {
            return {
              error: 'Email confirmation is required by your Supabase project. Disable email confirmation in Supabase Auth, or confirm the email before signing in.',
            };
          }
          if (message.includes('duplicate') || message.includes('already') || message.includes('exists')) {
            return {
              error: 'This phone number is already registered in the database. Please sign in or use a different number.',
            };
          }
          return { error: signError.message || 'Unable to create account. Please try again.' };
        }

        if (!signData?.user?.id) {
          console.error('Supabase auth.signUp returned no user:', signData);
          return { error: 'Account creation did not return a user. Please try again.' };
        }

        userId = signData.user.id;

        if (!signData.session && signData.user.email_confirmed_at === null) {
          signUpWarning = 'Supabase created the account but email confirmation is required before the user can sign in.';
          console.warn(signUpWarning);
        }
      }

      if (userId && supabase) {
        const profileName = trimmedName;
        const profileRow = {
          id: userId,
          email: dummyEmail,
          role: assignedRole,
          is_admin: false,
          name: profileName,
          full_name: profileName,
          phone: cleanPhone,
          address: address || null,
          governorate: governorate || null,
          created_at: new Date().toISOString(),
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([profileRow], { onConflict: 'id' });

        if (profileError) {
          console.error('Public profiles upsert failed after signup:', profileError);
          const cause = profileError.message || 'Unknown profile save failure';
          return {
            error: `Account creation reached Supabase Auth, but the profile record could not be saved: ${cause}`,
          };
        }
      }

      const newUser: AuthUserWithPassword = {
        name: trimmedName,
        phone: cleanPhone,
        address: address || '',
        governorate: governorate || '',
        password,
        role: assignedRole,
      };

      setUsers((prev) => {
        const next = [...prev, newUser];
        try {
          localStorage.setItem(USERS_KEY, JSON.stringify(next));
        } catch (_) {}
        return next;
      });

      await syncUsersFromProfiles();

      const userSession: AuthUser = {
        name: newUser.name,
        phone: newUser.phone,
        address: newUser.address,
        governorate: newUser.governorate,
        role: 'customer',
      };

      setUser(userSession);
      return { user: userSession };
    } catch (err: any) {
      console.error('Signup failed:', err);
      return { error: err?.message || 'Failed to create account.' };
    }
  };

  const login = async ({ phone, password }: LoginParams) => {
    const identifier = String(phone || '').trim();
    if (!identifier || !password) return { error: 'Phone/email and password required' };

    const cleanPhone = normalizePhone(identifier);
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

            const isAdmin = Boolean(profile && (
              String(profile.role || '').toLowerCase() === 'admin' ||
              String(profile.role || '').toLowerCase() === 'superadmin' ||
              profile.is_admin === true
            ));

            const role = isAdmin ? 'admin' : 'customer';

            const displayName = profile?.name || supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || '';

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

    const isNowAdmin = String(user.role || '').toLowerCase() === 'admin';

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
          role: user.role || 'customer',
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

  const changePassword = async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) => {
    if (!user) return { error: 'Not authenticated' };
    if (!supabase) return { error: 'Authentication service unavailable' };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message || 'Password update failed' };
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
