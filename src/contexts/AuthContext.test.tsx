import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import supabase from '../lib/supabase';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('../lib/supabase', () => ({
  __esModule: true,
  default: {
    auth: {
      getUser: jest.fn(),
      signOut: jest.fn(),
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

  it('restores a persisted admin session from localStorage after reload', async () => {
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
      expect(screen.getByText('wassef|admin')).toBeInTheDocument();
    });
  });
});
