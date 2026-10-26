import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import supabase from './lib/supabase';

jest.mock('./components/Homepage', () => ({
  __esModule: true,
  default: ({ onWishlist }: any) => (
    <button
      type="button"
      aria-label="Toggle Favorite List"
      onClick={() => onWishlist({
        id: 42,
        name: 'Test Product',
        brand: 'Brand',
        category: 'skincare',
        rating: 4.5,
        reviews: 10,
        image: 'x',
        description: 'desc',
        isHidden: false,
      })}
    >
      Toggle Favorite List
    </button>
  ),
}));
jest.mock('./components/CategoryView', () => () => <div data-testid="category-view" />);

jest.mock('./contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./contexts/DataContext', () => ({
  useData: jest.fn(),
  getCartPromoDiscount: jest.fn(() => 0),
  getFreeShippingFee: jest.fn(() => 50),
}));

jest.mock('./lib/supabase', () => ({
  __esModule: true,
  default: {
    auth: {
      getUser: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from: jest.fn(),
  },
}));

describe('App overlay interactions', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, 'scrollTo', {
      value: jest.fn(),
      writable: true,
    });

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      logout: jest.fn(),
      login: jest.fn(),
      signup: jest.fn(),
    });

    (useData as jest.Mock).mockReturnValue({
      products: [],
      categories: [
        { id: 'home', label: 'Home Overview', icon: 'Sparkles', color: '', accent: '', image: '', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
        { id: 'skincare', label: 'skincare', icon: 'Sparkles', color: '', accent: '', image: '', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
      ],
      actions: {
        refreshCatalog: jest.fn(),
        deleteCategory: jest.fn(),
        addCategory: jest.fn(),
        updateCategory: jest.fn(),
      },
      orders: [],
      siteSettings: { promo_banner_text: '' },
      updateSiteSettings: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('closes the auth modal when a navigation action is chosen while it is open', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /home overview/i })[0]);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens guest auth entry points in sign up mode by default', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Sign Up' })).toHaveClass('bg-brand-black');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bag' }));
    expect(screen.getByRole('button', { name: 'Sign Up' })).toHaveClass('bg-brand-black');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track Orders' }));
    expect(screen.getByRole('button', { name: 'Sign Up' })).toHaveClass('bg-brand-black');
  });

  it('does not re-trigger the catalog refresh on repeated renders while the catalog is still empty', () => {
    sessionStorage.setItem('phermono_active_category_v1', 'skincare');
    const refreshCatalog = jest.fn();
    (useData as jest.Mock).mockReturnValue({
      products: [],
      categories: [
        { id: 'home', label: 'Home Overview', icon: 'Sparkles', color: '', accent: '', image: '', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
        { id: 'skincare', label: 'skincare', icon: 'Sparkles', color: '', accent: '', image: '', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
      ],
      actions: { refreshCatalog, deleteCategory: jest.fn(), addCategory: jest.fn(), updateCategory: jest.fn() },
      orders: [],
      siteSettings: { promo_banner_text: '' },
      updateSiteSettings: jest.fn().mockResolvedValue(undefined),
    });

    const { rerender } = render(<App />);
    expect(refreshCatalog).toHaveBeenCalledTimes(1);

    rerender(<App />);
    expect(refreshCatalog).toHaveBeenCalledTimes(1);
  });

  it('loads a signed-in user\'s favorite list from Supabase instead of localStorage', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        name: 'Test User',
        phone: '1234567890',
        address: 'Test address',
        governorate: 'Cairo',
        role: 'customer',
      },
      logout: jest.fn(),
      login: jest.fn(),
      signup: jest.fn(),
    });

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    });

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      callback('SIGNED_IN', { user: { id: 'auth-user-id' } });
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table !== 'user_favorites') {
        return {
          select: jest.fn(),
          eq: jest.fn(),
          order: jest.fn(),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [{ product_id: 42 }],
              error: null,
            }),
          }),
        }),
      };
    });

    (useData as jest.Mock).mockReturnValue({
      products: [
        { id: 42, name: 'Test Product', brand: 'Brand', category: 'skincare', rating: 4.5, reviews: 10, image: 'x', description: 'desc' },
      ],
      categories: [],
      actions: { refreshCatalog: jest.fn(), deleteCategory: jest.fn(), addCategory: jest.fn(), updateCategory: jest.fn() },
      orders: [],
      siteSettings: { promo_banner_text: '' },
      updateSiteSettings: jest.fn().mockResolvedValue(undefined),
    });

    render(<App />);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('user_favorites');
    });
  });

  it('keeps guest/localStorage behavior when there is no valid Supabase auth session', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      logout: jest.fn(),
      login: jest.fn(),
      signup: jest.fn(),
    });

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      callback('SIGNED_OUT', null);
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    render(<App />);

    await waitFor(() => {
      expect(supabase.from).not.toHaveBeenCalledWith('user_favorites');
    });
  });

  it('blocks the localStorage favorite fallback when an app user exists without a real Supabase session', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: {
        name: 'wassef',
        phone: '01225502425',
        address: 'Headquarters',
        governorate: 'Cairo',
        role: 'admin',
      },
      logout: jest.fn(),
      login: jest.fn(),
      signup: jest.fn(),
    });

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      callback('INITIAL_SESSION', null);
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    (useData as jest.Mock).mockReturnValue({
      products: [
        { id: 42, name: 'Test Product', brand: 'Brand', category: 'skincare', rating: 4.5, reviews: 10, image: 'x', description: 'desc' },
      ],
      categories: [],
      actions: { refreshCatalog: jest.fn(), deleteCategory: jest.fn(), addCategory: jest.fn(), updateCategory: jest.fn() },
      orders: [],
      siteSettings: { promo_banner_text: '' },
      updateSiteSettings: jest.fn().mockResolvedValue(undefined),
    });

    render(<App />);

    fireEvent.click(screen.getAllByLabelText('Toggle Favorite List')[0]);

    await waitFor(() => {
      expect(localStorage.getItem('phermono_wishlist_v1:01225502425')).toBeNull();
      expect(supabase.from).not.toHaveBeenCalledWith('user_favorites');
    });
  });
});
