import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthModal from './AuthModal';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext');

describe('AuthModal auth flow', () => {
  const loginMock = jest.fn();
  const signupMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      login: loginMock,
      signup: signupMock,
    });
  });

  it('submits the sign-in action only once when the form is submitted', async () => {
    const onClose = jest.fn();
    loginMock.mockResolvedValue({ user: { name: 'Test User', phone: '01000000000', address: '', governorate: 'أسوان', role: 'customer' } });

    render(<AuthModal open={true} onClose={onClose} defaultMode="signup" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    fireEvent.change(screen.getByPlaceholderText('Enter your registered phone number'), {
      target: { value: '01000000000' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'secret123' },
    });

    const submitButton = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
    fireEvent.submit(submitButton.closest('form') as HTMLFormElement);

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('defaults to sign up when opened in guest entry mode and can switch back to sign in', async () => {
    const onClose = jest.fn();

    const { rerender } = render(<AuthModal open={false} onClose={onClose} defaultMode="signup" />);
    rerender(<AuthModal open={true} onClose={onClose} defaultMode="signup" />);

    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Sarah Connor')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Sign Up' })).toHaveClass('bg-brand-black');

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Enter your registered phone number')).toBeInTheDocument());

    rerender(<AuthModal open={false} onClose={onClose} defaultMode="signup" />);
    rerender(<AuthModal open={true} onClose={onClose} defaultMode="signup" />);
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Sarah Connor')).toBeInTheDocument());
  });

  it('keeps the modal open and shows the server error on failed sign in', async () => {
    const onClose = jest.fn();
    loginMock.mockResolvedValue({ error: 'Invalid credentials' });

    render(<AuthModal open={true} onClose={onClose} defaultMode="signup" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    fireEvent.change(screen.getByPlaceholderText('Enter your registered phone number'), {
      target: { value: '01000000000' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'wrongpass' },
    });

    const submitButton = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
