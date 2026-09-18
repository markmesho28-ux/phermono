import { getInitialCart } from '../App';

describe('cart persistence', () => {
  const CART_KEY = 'phermono_cart_v1';

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns empty array when localStorage has no cart data', () => {
    expect(getInitialCart()).toEqual([]);
  });

  it('loads valid cart items from localStorage on initialization', () => {
    const mockCart = [
      {
        id: 101,
        name: 'Luxury Face Serum',
        brand: 'Phermono',
        category: 'skincare',
        sellingPrice: 150,
        price: 150,
        rating: 5,
        reviews: 12,
        image: 'https://example.com/serum.jpg',
        description: 'Anti-aging serum',
        qty: 2,
      },
      {
        id: 102,
        name: 'Velvet Hair Mist',
        brand: 'Phermono',
        category: 'haircare',
        sellingPrice: 90,
        price: 90,
        rating: 4.8,
        reviews: 9,
        image: 'https://example.com/hair.jpg',
        description: 'Fragrant mist',
        qty: 1,
      },
    ];

    localStorage.setItem(CART_KEY, JSON.stringify(mockCart));
    const result = getInitialCart();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(101);
    expect(result[0].qty).toBe(2);
    expect(result[0].price).toBe(150);
    expect(result[1].id).toBe(102);
    expect(result[1].qty).toBe(1);
  });

  it('sanitizes items with invalid quantity or missing prices safely', () => {
    const dirtyCart = [
      {
        id: 201,
        name: 'Valid Product',
        sellingPrice: 85,
        rating: 5,
        reviews: 1,
        image: '',
        description: '',
        qty: 1.5,
      },
      {
        id: 202,
        name: 'Zero Qty Product',
        sellingPrice: 50,
        rating: 4,
        reviews: 0,
        image: '',
        description: '',
        qty: 0,
      },
      {
        name: 'Missing ID Product',
        qty: 3,
      },
      null,
      'not an object',
    ];

    localStorage.setItem(CART_KEY, JSON.stringify(dirtyCart));
    const result = getInitialCart();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(201);
    expect(result[0].qty).toBe(1);
    expect(result[0].price).toBe(85);
  });

  it('recovers gracefully from JSON parse errors', () => {
    localStorage.setItem(CART_KEY, 'invalid json syntax{{{');
    expect(getInitialCart()).toEqual([]);
  });
});
