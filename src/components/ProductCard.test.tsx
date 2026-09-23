import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductCard from './ProductCard';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

const mockToggleHero = jest.fn();

jest.mock('../contexts/DataContext', () => ({
  useData: () => ({
    actions: {
      toggleHero: mockToggleHero,
    },
  }),
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
});
