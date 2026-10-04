import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';

jest.mock('./contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./contexts/DataContext', () => ({
  useData: jest.fn(),
  getCartPromoDiscount: jest.fn(() => 0),
  getFreeShippingFee: jest.fn(() => 50),
}));

describe('App overlay interactions', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', {
      value: jest.fn(),
      writable: true,
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
});
