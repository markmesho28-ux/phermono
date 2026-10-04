import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Homepage from './Homepage';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../contexts/DataContext', () => ({
  useData: jest.fn(),
}));

jest.mock('./CategoryBar', () => ({
  __esModule: true,
  default: () => <div>CategoryBar</div>,
}));

jest.mock('./ProductCard', () => ({
  __esModule: true,
  default: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}));

describe('Homepage featured sections', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    (useData as jest.Mock).mockReturnValue({
      products: [
        { id: 'b1', name: 'Best Seller', hero: true, tag: 'best seller', createdAt: '2024-01-10T00:00:00Z', isHidden: false },
        { id: 'n1', name: 'New Arrival 1', createdAt: '2024-02-01T00:00:00Z', isHidden: false },
        { id: 'n2', name: 'New Arrival 2', createdAt: '2024-01-20T00:00:00Z', isHidden: false },
      ],
      categories: [],
    });
  });

  it('shows a loading state before the featured products are prepared', async () => {
    render(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />
    );

    expect(screen.getAllByLabelText('Loading products').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getAllByText('Best Seller').length).toBeGreaterThan(0);
      expect(screen.getByText('New Arrival 1')).toBeInTheDocument();
    });
  });
});
