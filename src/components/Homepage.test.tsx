import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Homepage from './Homepage';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import supabase from '../lib/supabase';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../contexts/DataContext', () => ({
  useData: jest.fn(),
}));

jest.mock('../lib/supabase', () => ({
  __esModule: true,
  default: {
    from: jest.fn(),
  },
}));

jest.mock('../utils/promoBanner', () => ({
  DEFAULT_PROMO_BANNER: {
    bannerId: 'banner-1',
    content: { headline: 'Big sale' },
    products: [],
  },
  MIDDLE_PROMO_BANNER_PRODUCT_ID: 'middle-product',
  fetchPromoBannerConfig: jest.fn().mockResolvedValue({
    bannerId: 'banner-1',
    content: { headline: 'Big sale' },
    products: [],
  }),
  savePromoBannerContent: jest.fn(),
  savePromoBannerProductImage: jest.fn(),
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
  const productRows = [
    { id: 'b1', name: 'Best Seller', hero: true, tag: 'Best Seller', created_at: '2024-01-10T00:00:00Z', is_hidden: false, image: 'https://example.com/test.jpg', brand: 'Brand', selling_price: 100, market_price: 120 },
    { id: 'n1', name: 'New Arrival 1', created_at: '2024-02-01T00:00:00Z', is_hidden: false, image: 'https://example.com/test2.jpg', brand: 'Brand', selling_price: 90, market_price: 110 },
  ];

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

    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((column: string) => {
          if (column === 'is_hidden') {
            return {
              or: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [productRows[0]], error: null }),
                }),
              }),
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: productRows, error: null }),
              }),
            };
          }

          return {
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: productRows, error: null }),
            }),
          };
        }),
      }),
    }));
  });

  it('starts the featured product fetch even when the global catalog is still empty', async () => {
    (useData as jest.Mock).mockReturnValue({ products: [], categories: [] });

    render(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />
    );

    await waitFor(() => {
      expect((supabase.from as jest.Mock)).toHaveBeenCalledWith('products');
    });
  });

  it('renders the homepage featured products once the async fetch resolves', async () => {
    render(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Best Seller').length).toBeGreaterThan(0);
      expect(screen.getByText('New Arrival 1')).toBeInTheDocument();
    });
  });

  it('keeps featured products visible when the product list rerenders during a fetch', async () => {
    let resolveBestSellerQuery: ((value: any) => void) | undefined;
    let resolveArrivalQuery: ((value: any) => void) | undefined;

    const makeDeferredQuery = (setter: (resolver: (value: any) => void) => void) =>
      new Promise((resolve) => {
        setter(resolve);
      });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table !== 'products') {
        return { select: jest.fn() };
      }

      return {
        select: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockImplementation((column: string) => {
            if (column === 'is_hidden') {
              return {
                or: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue(
                      makeDeferredQuery((resolver) => {
                        resolveBestSellerQuery = resolver;
                      }),
                    ),
                  }),
                }),
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue(
                    makeDeferredQuery((resolver) => {
                        resolveArrivalQuery = resolver;
                    }),
                  ),
                }),
              };
            }

            return {
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue(
                  makeDeferredQuery((resolver) => {
                    resolveArrivalQuery = resolver;
                  }),
                ),
              }),
            };
          }),
        })),
      };
    });

    const { rerender } = render(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />,
    );

    rerender(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />,
    );

    resolveBestSellerQuery?.({ data: [productRows[0]] });
    resolveArrivalQuery?.({ data: [productRows[1]] });

    await waitFor(() => {
      expect(screen.getAllByText('Best Seller').length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });

  it('treats is_best_seller as a real best-seller signal and keeps new arrivals newest-first', async () => {
    const newerArrival = { id: 'n3', name: 'Newest Arrival', created_at: '2024-03-01T00:00:00Z', is_hidden: false, image: 'https://example.com/new.jpg', brand: 'Brand', selling_price: 120, market_price: 140, is_best_seller: false };
    const olderArrival = { id: 'n2', name: 'Older Arrival', created_at: '2024-02-15T00:00:00Z', is_hidden: false, image: 'https://example.com/old.jpg', brand: 'Brand', selling_price: 110, market_price: 130, is_best_seller: false };
    const bestSeller = { id: 'b2', name: 'Flagged Best Seller', created_at: '2024-02-01T00:00:00Z', is_hidden: false, image: 'https://example.com/best.jpg', brand: 'Brand', selling_price: 170, market_price: 190, is_best_seller: true };

    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((column: string) => {
          if (column === 'is_hidden') {
            return {
              or: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [bestSeller], error: null }),
                }),
              }),
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [newerArrival, olderArrival], error: null }),
              }),
            };
          }
          return {
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [newerArrival, olderArrival], error: null }),
            }),
          };
        }),
      }),
    }));

    render(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Flagged Best Seller')).toBeInTheDocument();
      expect(screen.getAllByText('Newest Arrival')[0]).toBeInTheDocument();
    });
  });

  it('keeps already-loaded products visible while a background refresh is pending', async () => {
    const pending = new Promise(() => undefined);
    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((column: string) => {
          if (column === 'is_hidden') {
            return {
              or: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(pending) }),
              }),
              order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(pending) }),
            };
          }
          return { order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(pending) }) };
        }),
      }),
    }));

    (useData as jest.Mock).mockReturnValue({
      products: [
        { id: 'persisted-1', name: 'Persisted Best Seller', hero: true, tag: 'Best Seller', createdAt: '2024-01-10T00:00:00Z', isHidden: false },
        { id: 'persisted-2', name: 'Persisted Arrival', createdAt: '2024-02-01T00:00:00Z', isHidden: false },
      ],
      categories: [],
    });

    render(
      <Homepage
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        wishlist={[]}
      />
    );

    expect(screen.getAllByText('Persisted Best Seller').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Persisted Arrival').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Loading products')).not.toBeInTheDocument();
  });
});
