import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductCard from './ProductCard';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

const mockToggleHero = jest.fn();
let mockSiteSettings: Record<string, any> = {};

jest.mock('../contexts/DataContext', () => ({
  useData: () => ({
    actions: {
      toggleHero: mockToggleHero,
    },
    siteSettings: mockSiteSettings,
  }),
  getDiscountedPrice: (price: number) => price,
  getPromoDiscountPercent: (settings: Record<string, any> = {}) => Number(settings?.promo_discount_percent ?? 0),
  getBestSellerState: (product: any) => Boolean(product?.hero || product?.isBestSeller || product?.is_best_seller || String(product?.tag || '').toLowerCase() === 'best seller'),
  getCurrentStorePriceForPromo: (generalPrice?: number | null, currentStorePrice?: number | null) => {
    if (typeof currentStorePrice === 'number' && currentStorePrice > 0) return currentStorePrice;
    if (typeof generalPrice === 'number' && generalPrice > 0) return generalPrice;
    return 0;
  },
}));

describe('ProductCard add button responsiveness', () => {
  const product = {
    id: 1,
    name: 'Vitamin C Serum',
    brand: 'Glow Labs',
    category: 'Skin Care',
    originalPrice: 250,
    sellingPrice: 180,
    marketPrice: 250,
    rating: 4.8,
    reviews: 120,
    image: 'https://example.com/product.jpg',
    description: 'Hydrating serum',
  };

  beforeEach(() => {
    mockToggleHero.mockClear();
    mockSiteSettings = {};
  });

  it('fires add-to-cart immediately on the first touch/pointer activation and suppresses duplicate clicks', () => {
    const onAddToCart = jest.fn();
    const onQuickView = jest.fn();
    const onWishlist = jest.fn();

    render(
      <ProductCard
        product={product}
        onAddToCart={onAddToCart}
        onQuickView={onQuickView}
        onWishlist={onWishlist}
        isWishlisted={false}
      />
    );

    const addButton = screen.getByRole('button', { name: /add/i });

    fireEvent.pointerDown(addButton);
    fireEvent.click(addButton);

    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart).toHaveBeenCalledWith(product);
  });

  it('invokes add-to-cart directly from the first touchstart without waiting for the click event', () => {
    const onAddToCart = jest.fn();

    render(
      <ProductCard
        product={product}
        onAddToCart={onAddToCart}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        isWishlisted={false}
      />
    );

    const addButton = screen.getByRole('button', { name: /add/i });

    fireEvent.touchStart(addButton);

    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart).toHaveBeenCalledWith(product);
  });

  it('renders a clean percentage discount label without a boxed background', () => {
    const discountedProduct = {
      ...product,
      sellingPrice: 180,
      marketPrice: 210,
    };

    render(
      <ProductCard
        product={discountedProduct}
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        isWishlisted={false}
      />
    );

    expect(screen.getByText('-14%')).toBeInTheDocument();
    expect(screen.queryByText(/save/i)).not.toBeInTheDocument();
  });

  it('keeps the regular product price visible while a global promotion is active', () => {
    mockSiteSettings = { active_promo: 'percentage_discount', promo_discount_percent: 20 };
    const discountedProduct = {
      ...product,
      sellingPrice: 180,
      marketPrice: 210,
    };

    render(
      <ProductCard
        product={discountedProduct}
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
        isWishlisted={false}
      />
    );

    expect(screen.getByText('EGP 180.00')).toBeInTheDocument();
    expect(screen.queryByText('EGP 144.00')).not.toBeInTheDocument();
    expect(screen.getByText('-20%')).toBeInTheDocument();
  });
});
