import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import CategoryView from './CategoryView';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../contexts/DataContext', () => ({
  useData: jest.fn(),
}));

jest.mock('./ProductCard', () => ({
  __esModule: true,
  default: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}));

describe('CategoryView brand filters', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });

    const brands = ['Brand One', 'Brand Two', 'Brand Three', 'Brand Four', 'Brand Five', 'Brand Six', 'Brand Seven', 'Brand Eight', 'Brand Nine'];
    const products = brands.map((brand, index) => ({
      id: index + 1,
      name: `${brand} Product`,
      brand,
      category: 'skincare',
      subcategoryId: 'cleansers',
      sellingPrice: 100 + index,
      price: 100 + index,
      marketPrice: 120 + index,
      rating: 4.5,
      reviews: 10,
      description: 'Test product',
      image: 'x',
      isHidden: false,
      skinType: 'All',
    }));

    (useData as jest.Mock).mockReturnValue({
      products,
      categories: [{
        id: 'skincare',
        label: 'Skincare',
        subcategories: [{ id: 'all', label: 'All' }, { id: 'cleansers', label: 'Cleansers' }],
        brands: [],
      }],
      priceRanges: [],
      brands: brands,
      actions: {
        deleteProduct: jest.fn(),
        deleteBrand: jest.fn(),
        deleteSubcategory: jest.fn(),
      },
    });
  });

  it('does not render a view all button in the brand filter', () => {
    render(
      <CategoryView
        categoryId="skincare"
        onAddToCart={jest.fn()}
        onQuickView={jest.fn()}
        onWishlist={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /view all/i })).not.toBeInTheDocument();
  });
});
