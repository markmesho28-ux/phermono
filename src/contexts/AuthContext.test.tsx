import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import supabase from '../lib/supabase';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('../lib/supabase', () => ({
  __esModule: true,
  default: {
    auth: {
      getUser: jest.fn(),
      signOut: jest.fn(),
      signInWithPassword: jest.fn(),
    },
    from: jest.fn(),
  },
}));

function SessionReader() {
  const { user } = useAuth();
  return <div>{user ? `${user.name}|${user.role}` : 'guest'}</div>;
}

describe('AuthProvider session restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
  });

  it('does not restore a persisted local auth object as an authenticated session', async () => {
    const persistedUser = {
      name: 'wassef',
      phone: '01225502425',
      address: 'Headquarters',
      governorate: 'Cairo',
      role: 'admin',
    };

    window.localStorage.setItem('phermono_auth_v1', JSON.stringify(persistedUser));

    render(
      <AuthProvider>
        <SessionReader />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('guest')).toBeInTheDocument();
    });
  });

  it('surfaces a Supabase sign-in failure instead of silently falling back when the user exists in profiles', async () => {
    window.localStorage.setItem('phermono_users_v1', JSON.stringify([
      { name: 'wassef', phone: '01225502425', address: 'Headquarters', governorate: 'Cairo', password: 'admin', role: 'admin' },
    ]));

    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table !== 'profiles') {
        return {
          select: jest.fn(),
          eq: jest.fn(),
          maybeSingle: jest.fn(),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'auth-user-id', phone: '01225502425', email: '01225502425@phermono.local', role: 'admin' },
              error: null,
            }),
          }),
        }),
      };
    });

    let authApi: any;
    function LoginHarness() {
      authApi = useAuth();
      return null;
    }

    render(
      <AuthProvider>
        <LoginHarness />
      </AuthProvider>
    );

    let result: { error?: string; user?: any } | undefined;
    await act(async () => {
      result = await authApi.login({ phone: '01225502425', password: 'wrong-password' });
    });

    expect(result?.error).toContain('Invalid login credentials');
    expect(result?.user).toBeUndefined();
  });
});
