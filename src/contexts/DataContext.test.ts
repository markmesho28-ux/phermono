import React, { useRef, useState } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { resolveCategoryIdForUpdate, isPermissionDeniedOrRlsError, parseSitePromoCommand, getFreeShippingFee, resolveCategoryIdForInsert, resolveCategoryIdForRelation, DataProvider, useData, getBestSellerState, mergeBestSellerIntentOverrides, bestSellerIntentStore, resolveBestSellerValue } from './DataContext';
import { AuthProvider, useAuth } from './AuthContext';
import CategoryView from '../components/CategoryView';
import { looksLikeAdminCommandIntent } from '../components/ChatWidget';

jest.mock('../lib/supabase', () => {
  const makeQueryChain = () => ({
    select: jest.fn(() => Promise.resolve({ data: [] })),
    eq: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
    limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    order: jest.fn(() => ({
      limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
    })),
    upsert: jest.fn(() => ({
      select: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: null, error: null })) })),
    })),
  });

  const makeChannel = () => {
    const channel: any = {
      on: jest.fn(() => channel),
      subscribe: jest.fn(() => undefined),
    };
    return channel;
  };

  return {
    __esModule: true,
    default: {
      from: jest.fn(() => makeQueryChain()),
      channel: jest.fn(() => makeChannel()),
      removeChannel: jest.fn(),
      auth: {
        getUser: jest.fn(() => Promise.resolve({ data: { user: null } })),
      },
    },
    SUPABASE_URL: 'https://example.com',
  };
});

describe('isPermissionDeniedOrRlsError', () => {
  it('detects admin permission and row-level security rejections', () => {
    expect(isPermissionDeniedOrRlsError({ code: '42501', message: 'permission denied for table products' })).toBe(true);
    expect(isPermissionDeniedOrRlsError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(isPermissionDeniedOrRlsError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
  });
});

describe('getBestSellerState', () => {
  it('treats hero, is_best_seller and the Best Seller tag as one consistent signal', () => {
    expect(getBestSellerState({ hero: false, isBestSeller: false, is_best_seller: false, tag: null })).toBe(false);
    expect(getBestSellerState({ hero: false, isBestSeller: false, is_best_seller: true, tag: null })).toBe(true);
    expect(getBestSellerState({ hero: false, isBestSeller: false, is_best_seller: false, tag: 'Best Seller' })).toBe(true);
    expect(getBestSellerState({ hero: false, isBestSeller: false, is_best_seller: false, tag: 'New' })).toBe(false);
  });

  it('keeps is_best_seller authoritative even when hero was false in a stale snapshot', () => {
    expect(resolveBestSellerValue({ hero: false, is_best_seller: true, tag: 'New' })).toBe(true);
    expect(resolveBestSellerValue({ hero: false, isBestSeller: false, is_best_seller: false, tag: 'Best Seller' })).toBe(true);
    expect(resolveBestSellerValue({ hero: false, isBestSeller: false, is_best_seller: false, tag: 'New' })).toBe(false);
  });

  it('keeps the user-locked best-seller state when stale background snapshots arrive', () => {
    bestSellerIntentStore['42'] = { value: true, revision: 7, locked: true };

    const merged = mergeBestSellerIntentOverrides([
      { id: 42, hero: false, isBestSeller: false, is_best_seller: false, tag: null },
      { id: 43, hero: false, isBestSeller: false, is_best_seller: false, tag: null },
    ]);

    expect(merged[0]).toMatchObject({
      id: 42,
      hero: true,
      isBestSeller: true,
      is_best_seller: true,
      tag: 'Best Seller',
    });
    expect(merged[1]).toMatchObject({
      id: 43,
      hero: false,
      isBestSeller: false,
      is_best_seller: false,
      tag: null,
    });

    delete bestSellerIntentStore['42'];
  });

  it('persists the best-seller toggle through the authoritative boolean fields while syncing the tag label', async () => {
    const supabaseClient = require('../lib/supabase').default;
    const updates: Record<string, any> = {};
    const selected: Record<string, any> = {};

    supabaseClient.auth.getUser = jest.fn(() => Promise.resolve({ data: { user: { id: 'admin-1' } } }));
    supabaseClient.from.mockImplementation((table: string) => {
      if (table !== 'products') {
        return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      }

      return {
        update: jest.fn((payload) => {
          updates.payload = payload;
          return {
            eq: jest.fn((field, value) => {
              updates.field = field;
              updates.value = value;
              return {
                select: jest.fn(() => ({
                  single: jest.fn(() => Promise.resolve({ data: { id: value, tag: payload.tag, hero: payload.hero, is_best_seller: payload.is_best_seller, updated_at: payload.updated_at }, error: null })),
                })),
              };
            }),
          };
        }),
      };
    });

    const result = await require('./DataContext').persistBestSellerFlag?.(42, true);
    expect(result?.ok).toBe(true);
    expect(updates.field).toBe('id');
    expect(updates.value).toBe(42);
    expect(updates.payload).toEqual({
      hero: true,
      is_best_seller: true,
      tag: 'Best Seller',
      updated_at: expect.any(String),
    });
    expect(Object.keys(updates.payload)).toEqual(['hero', 'is_best_seller', 'tag', 'updated_at']);
    expect(selected).toEqual({});
  });
});

describe('resolveCategoryIdForInsert', () => {
  it('generates a valid UUID when the incoming category id is missing or not a UUID', () => {
    expect(resolveCategoryIdForInsert(undefined)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(resolveCategoryIdForInsert('skincare')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(resolveCategoryIdForInsert('123e4567-e89b-42d3-a456-426614174000')).toBe('123e4567-e89b-42d3-a456-426614174000');
  });
});

describe('resolveCategoryIdForUpdate', () => {
  it('returns a UUID as-is for a precise category id', async () => {
    const supabaseClient = {
      from: jest.fn(),
    };

    await expect(
      resolveCategoryIdForUpdate('123e4567-e89b-42d3-a456-426614174000', [{ id: 'other', label: 'Other' }], supabaseClient as any)
    ).resolves.toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('resolves a category by slug to a single unique database id', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [{ id: 'cat-uuid-123' }], error: null });
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    const supabaseClient = {
      from: jest.fn().mockReturnValue({ select }),
    };

    await expect(resolveCategoryIdForUpdate('skincare', [{ id: 'other', label: 'Other' }], supabaseClient as any)).resolves.toBe('cat-uuid-123');
    expect(supabaseClient.from).toHaveBeenCalledWith('categories');
    expect(select).toHaveBeenCalledWith('id');
    expect(eq).toHaveBeenCalledWith('slug', 'skincare');
  });

  it('resolves a category slug or name to the parent UUID before relation inserts', async () => {
    const categoryRows = [
      { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Hair care', slug: 'hair-care' },
    ];
    const maybeSingle = jest.fn().mockResolvedValue({ data: categoryRows[0], error: null });
    const limit = jest.fn().mockReturnValue({ maybeSingle });
    const or = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ or });
    const supabaseClient = {
      from: jest.fn().mockReturnValue({ select }),
    };

    await expect(resolveCategoryIdForRelation('hair-care', [], supabaseClient as any)).resolves.toBe('123e4567-e89b-42d3-a456-426614174000');
    await expect(resolveCategoryIdForRelation('Hair care', [], supabaseClient as any)).resolves.toBe('123e4567-e89b-42d3-a456-426614174000');
  });
});

describe('getFreeShippingFee', () => {
  it('returns the standard default shipping fee when free shipping is off or below threshold', () => {
    expect(getFreeShippingFee(120, { is_free_shipping_active: false, free_shipping_threshold: 200 }, 50)).toBe(50);
    expect(getFreeShippingFee(120, { is_free_shipping_active: true, free_shipping_threshold: 200 }, 50)).toBe(50);
    expect(getFreeShippingFee(250, { is_free_shipping_active: false, free_shipping_threshold: 200 }, 50)).toBe(50);
  });

  it('returns zero only when free shipping is active and the subtotal meets the threshold', () => {
    expect(getFreeShippingFee(250, { is_free_shipping_active: true, free_shipping_threshold: 200 }, 50)).toBe(0);
  });
});

describe('looksLikeAdminCommandIntent', () => {
  it('recognizes admin intent only for actual admin command patterns', () => {
    expect(looksLikeAdminCommandIntent('make a free shipping for all orders')).toBe(true);
    expect(looksLikeAdminCommandIntent('تفعيل الشحن المجاني')).toBe(true);
    expect(looksLikeAdminCommandIntent('make a 30% off')).toBe(true);
    expect(looksLikeAdminCommandIntent('50% discount on all orders')).toBe(true);
    expect(looksLikeAdminCommandIntent('what are your hair products?')).toBe(false);
    expect(looksLikeAdminCommandIntent('Hi, I need a serum for dry skin')).toBe(false);
  });
});

describe('AuthContext local admin fallback', () => {
  it('logs in the seeded local admin account when Supabase auth rejects the password attempt', async () => {
    localStorage.clear();
    localStorage.setItem('phermono_users_v1', JSON.stringify([
      { name: 'wassef', phone: '01225502425', address: 'Headquarters', governorate: 'Cairo', password: 'admin', role: 'admin' },
    ]));

    const supabaseClient = require('../lib/supabase').default;
    supabaseClient.auth.getUser = jest.fn(() => Promise.resolve({ data: { user: null } }));
    supabaseClient.auth.signInWithPassword = jest.fn(() => Promise.resolve({
      data: { user: null },
      error: { message: 'Invalid credentials' },
    }));

    function AuthProbe() {
      const { user, login } = useAuth();
      return React.createElement(
        'div',
        null,
        React.createElement('button', {
          type: 'button',
          onClick: async () => {
            const result = await login({ phone: '01225502425', password: 'admin' });
            (window as any).__lastAuthResult = result;
          },
        }, user ? `signed:${user.role}` : 'signed:out'),
      );
    }

    render(
      React.createElement(AuthProvider, null, React.createElement(AuthProbe))
    );

    fireEvent.click(screen.getByRole('button', { name: 'signed:out' }));

    await waitFor(() => {
      const result = (window as any).__lastAuthResult;
      expect(result?.error).toBeUndefined();
      expect(result?.user?.role).toBe('admin');
      expect(result?.user?.phone).toBe('01225502425');
    });
  });
});

describe('DataProvider action stability', () => {
  it('keeps the actions object stable across unrelated rerenders so click-driven updates do not cascade the full app', () => {
    function ActionProbe() {
      const { actions } = useData();
      const [count, setCount] = useState(0);
      const previous = useRef(actions);
      const changed = previous.current !== actions;
      previous.current = actions;

      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'action-state' }, String(changed)),
        React.createElement('button', { type: 'button', onClick: () => setCount((value) => value + 1) }, String(count))
      );
    }

    render(
      React.createElement(DataProvider, null, React.createElement(ActionProbe))
    );

    expect(screen.getByTestId('action-state')).toHaveTextContent('false');
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(screen.getByTestId('action-state')).toHaveTextContent('false');
  });

  it('hydrates category brands from the junction table when category_id is not stored on the brand row', async () => {
    const supabaseClient = require('../lib/supabase').default;
    const fromMock = supabaseClient.from;

    fromMock.mockImplementation((table: string) => {
      if (table === 'products') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'orders') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'categories') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'cat-1', name: 'Skincare', slug: 'skincare' }] })) };
      }
      if (table === 'subcategories') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'brands') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'brand-1', name: 'Aesop', slug: 'aesop', category_id: null }] })) };
      }
      if (table === 'category_brands') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ category_id: 'cat-1', brand_id: 'brand-1' }] })) };
      }
      if (table === 'site_settings') {
        return {
          select: jest.fn(() => ({
            order: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve({ data: [] })) })),
          })),
        };
      }
      return { select: jest.fn(() => Promise.resolve({ data: [] })) };
    });

    function BrandProbe() {
      const { categories } = useData();
      return React.createElement('div', { 'data-testid': 'brand-list' }, JSON.stringify(categories[0]?.brands ?? []));
    }

    render(
      React.createElement(DataProvider, null, React.createElement(BrandProbe))
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-list')).toHaveTextContent('Aesop');
    });
  });

  it('resolves a category name to the canonical category UUID before inserting a product', async () => {
    const supabaseClient = require('../lib/supabase').default;
    const categoryUuid = '123e4567-e89b-42d3-a456-426614174000';
    const productInsertPayload: any = {};

    supabaseClient.auth.getUser = jest.fn(() => Promise.resolve({ data: { user: { id: 'admin-1' } } }));
    const profileRow = { id: 'admin-1', role: 'admin', is_admin: true };

    supabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() => Promise.resolve({ data: profileRow, error: null })),
            })),
          })),
        };
      }
      if (table === 'categories') {
        return {
          select: jest.fn(() => Promise.resolve({ data: [{ id: categoryUuid, name: 'Hair care', slug: 'hair-care' }], error: null })),
        };
      }
      if (table === 'subcategories') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [{ id: 'sub-1', name: 'Gel', slug: 'gel' }], error: null })),
              maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'sub-1', name: 'Gel', slug: 'gel' }, error: null })),
            })),
            ilike: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [{ id: 'sub-1', name: 'Gel', slug: 'gel' }], error: null })),
              maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'sub-1', name: 'Gel', slug: 'gel' }, error: null })),
            })),
            or: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [{ id: 'sub-1', name: 'Gel', slug: 'gel' }], error: null })),
              maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'sub-1', name: 'Gel', slug: 'gel' }, error: null })),
            })),
          })),
        };
      }
      if (table === 'products') {
        return {
          insert: jest.fn((values) => {
            productInsertPayload.payload = values[0];
            return {
              select: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({ data: { ...values[0], id: 1 }, error: null })),
              })),
            };
          }),
          select: jest.fn(() => Promise.resolve({ data: [] })),
        };
      }
      if (table === 'brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'orders') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'site_settings') return { select: jest.fn(() => ({ order: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve({ data: [] })) })) })) };
      return { select: jest.fn(() => Promise.resolve({ data: [] })) };
    });

    function ProductInsertProbe() {
      const { categories, actions } = useData();
      return React.createElement(
        'button',
        { type: 'button', onClick: () => actions.addProduct({
          id: Date.now(),
          name: 'Glow Serum',
          brand: 'Aesop',
          category: 'Hair care',
          subcategory: 'Gel',
          sellingPrice: 120,
          marketPrice: 150,
          image: '',
          description: 'Hydrating daily serum',
          rating: 5,
          reviews: 1,
          stock: 10,
          isHidden: false,
        } as any) },
        categories[0]?.id || 'no-cat'
      );
    }

    render(
      React.createElement(AuthProvider, null,
        React.createElement(DataProvider, null, React.createElement(ProductInsertProbe))
      )
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: categoryUuid })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: categoryUuid }));

    await waitFor(() => {
      expect(productInsertPayload.payload.category_id).toBe(categoryUuid);
      expect(productInsertPayload.payload.subcategory_id).toBe('sub-1');
    });
  });

  it('keeps a newly inserted product in its category after refresh and keeps it visible in CategoryView', async () => {
    const supabaseClient = require('../lib/supabase').default;
    const productRow = {
      id: 999,
      name: 'Glow Serum',
      brand: 'Aesop',
      category_id: 'cat-1',
      category: 'cat-1',
      subcategory_id: null,
      subcategory: null,
      selling_price: 120,
      market_price: 150,
      admin_cost: 60,
      stock: 10,
      is_hidden: false,
      created_at: '2024-01-01T00:00:00Z',
      hero: false,
      tag: null,
      image: '',
      description: 'Hydrating daily serum',
      rating: 0,
      reviews: 0,
    };

    supabaseClient.auth.getUser = jest.fn(() => Promise.resolve({ data: { user: { id: 'admin-1' } } }));
    const profileRow = { id: 'admin-1', role: 'admin', is_admin: true };

    let productsSelectCount = 0;
    const productsList = [
      { data: [] },
      { data: [productRow] },
      { data: [productRow] },
    ];

    supabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() => Promise.resolve({ data: profileRow, error: null })),
            })),
          })),
        };
      }
      if (table === 'products') {
        return {
          select: jest.fn(() => Promise.resolve(productsList[Math.min(productsSelectCount++, productsList.length - 1)])),
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: productRow, error: null })),
            })),
          })),
        };
      }
      if (table === 'orders') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'categories') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'cat-1', name: 'Skincare', slug: 'skincare' }] })) };
      }
      if (table === 'subcategories') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'category_brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'site_settings') {
        return {
          select: jest.fn(() => ({
            order: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve({ data: [] })) })),
          })),
        };
      }
      return { select: jest.fn(() => Promise.resolve({ data: [] })) };
    });

    function ProductCategoryProbe() {
      const { actions, products, categories } = useData();
      const visibleCategoryProducts = products.filter((product) => String(product.category) === 'cat-1');

      return React.createElement(
        'div',
        null,
        React.createElement('button', { type: 'button', onClick: () => actions.addProduct({
          id: 999,
          name: 'Glow Serum',
          brand: 'Aesop',
          category: 'cat-1',
          sellingPrice: 120,
          marketPrice: 150,
          image: '',
          description: 'Hydrating daily serum',
          rating: 0,
          reviews: 0,
          stock: 10,
          isHidden: false,
        } as any) }, 'Add product'),
        React.createElement('button', { type: 'button', onClick: () => actions.refreshCatalog?.() }, 'Refresh catalog'),
        React.createElement('div', { 'data-testid': 'product-category-state' }, JSON.stringify(visibleCategoryProducts.map((product) => ({ id: product.id, category: product.category, name: product.name })))),
        React.createElement('div', { 'data-testid': 'category-label' }, JSON.stringify(categories.map((category) => ({ id: category.id, label: category.label })))),
        React.createElement(
          'div',
          { 'data-testid': 'category-view-mount' },
          React.createElement(CategoryView, {
            categoryId: 'cat-1',
            onAddToCart: () => undefined,
            onQuickView: () => undefined,
            onWishlist: () => undefined,
            wishlist: [],
          })
        )
      );
    }

    render(
      React.createElement(AuthProvider, null,
        React.createElement(DataProvider, null, React.createElement(ProductCategoryProbe))
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => {
      expect(screen.getByTestId('product-category-state')).toHaveTextContent('Glow Serum');
      expect(screen.getByTestId('product-category-state')).toHaveTextContent('cat-1');
      expect(screen.getByTestId('category-view-mount')).toHaveTextContent('Glow Serum');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));

    await waitFor(() => {
      expect(screen.getByTestId('product-category-state')).toHaveTextContent('Glow Serum');
      expect(screen.getByTestId('product-category-state')).toHaveTextContent('cat-1');
      expect(screen.getByTestId('category-view-mount')).toHaveTextContent('Glow Serum');
    });
  });

  it('does not persist the full product catalog to localStorage because that synchronous serialization blocks the UI thread during catalog refreshes', async () => {
    localStorage.clear();
    localStorage.setItem('phermono_data_v1', JSON.stringify({
      categories: [{ id: 'cat-1', label: 'Skincare', icon: 'Sparkles', color: '', accent: '', subcategories: [], brands: [] }],
      brands: [],
      products: [{ id: 1, name: 'Alpha Serum' }],
      priceRanges: [],
      orders: [],
    }));

    render(
      React.createElement(DataProvider, null, React.createElement('div', null, 'boot'))
    );

    await waitFor(() => {
      const raw = localStorage.getItem('phermono_data_v1');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw || '{}')).not.toHaveProperty('products');
    });
  });

  it('ignores stale catalog refreshes so older empty responses cannot erase valid product/category state', async () => {
    const supabaseClient = require('../lib/supabase').default;
    const validProduct = {
      id: 42,
      name: 'Glow Serum',
      brand: 'Aesop',
      category_id: 'cat-1',
      category: 'cat-1',
      subcategory_id: 'sub-1',
      subcategory: 'sub-1',
      selling_price: 120,
      market_price: 150,
      admin_cost: 60,
      stock: 10,
      is_hidden: false,
      created_at: '2024-01-01T00:00:00Z',
      hero: false,
      tag: null,
      image: '',
      description: 'Hydrating daily serum',
      rating: 0,
      reviews: 0,
    };

    let productCallCount = 0;
    let resolveFirstRequest: ((value: { data: any[] }) => void) | null = null;

    supabaseClient.auth.getUser = jest.fn(() => Promise.resolve({ data: { user: { id: 'admin-1' } } }));

    supabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'admin-1', role: 'admin', is_admin: true }, error: null })),
            })),
          })),
        };
      }
      if (table === 'products') {
        return {
          select: jest.fn(() => {
            productCallCount += 1;
            if (productCallCount === 1) {
              return new Promise((resolve) => {
                resolveFirstRequest = resolve;
              });
            }
            return Promise.resolve({ data: [validProduct] });
          }),
        };
      }
      if (table === 'orders') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'categories') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'cat-1', name: 'Skincare', slug: 'skincare' }] })) };
      }
      if (table === 'subcategories') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'sub-1', category_id: 'cat-1', name: 'Serums', slug: 'serums' }] })) };
      }
      if (table === 'brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'category_brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'site_settings') {
        return {
          select: jest.fn(() => ({
            order: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve({ data: [] })) })),
          })),
        };
      }
      return { select: jest.fn(() => Promise.resolve({ data: [] })) };
    });

    function CatalogRaceProbe() {
      const { actions, products, categories } = useData();
      const productText = JSON.stringify(products.map((product) => ({
        id: product.id,
        category: product.category,
        brand: product.brand,
        subcategoryId: product.subcategoryId,
      })));
      const categoryText = JSON.stringify(categories.map((category) => ({
        id: category.id,
        label: category.label,
      })));

      return React.createElement(
        'div',
        null,
        React.createElement('button', { type: 'button', onClick: () => actions.refreshCatalog?.() }, 'Refresh catalog'),
        React.createElement('div', { 'data-testid': 'catalog-products' }, productText),
        React.createElement('div', { 'data-testid': 'catalog-categories' }, categoryText)
      );
    }

    render(
      React.createElement(AuthProvider, null,
        React.createElement(DataProvider, null, React.createElement(CatalogRaceProbe)))
    );

    await waitFor(() => expect(productCallCount).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
    await waitFor(() => expect(productCallCount).toBeGreaterThanOrEqual(2));

    resolveFirstRequest?.({ data: [] });

    await waitFor(() => {
      expect(screen.getByTestId('catalog-products')).toHaveTextContent('42');
      expect(screen.getByTestId('catalog-products')).toHaveTextContent('cat-1');
      expect(screen.getByTestId('catalog-products')).toHaveTextContent('sub-1');
    });
  });

  it('keeps valid products when a later empty catalog refresh arrives after initial load', async () => {
    const supabaseClient = require('../lib/supabase').default;
    const validProduct = {
      id: 55,
      name: 'Hydra Lotion',
      brand: 'Aesop',
      category_id: 'cat-1',
      category: 'cat-1',
      subcategory_id: 'sub-1',
      subcategory: 'sub-1',
      selling_price: 140,
      market_price: 170,
      admin_cost: 70,
      stock: 8,
      is_hidden: false,
      created_at: '2024-01-02T00:00:00Z',
      hero: false,
      tag: null,
      image: '',
      description: 'Hydrating daily lotion',
      rating: 0,
      reviews: 0,
    };

    let productCallCount = 0;
    supabaseClient.auth.getUser = jest.fn(() => Promise.resolve({ data: { user: { id: 'admin-1' } } }));

    supabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'admin-1', role: 'admin', is_admin: true }, error: null })),
            })),
          })),
        };
      }
      if (table === 'products') {
        return {
          select: jest.fn(() => {
            productCallCount += 1;
            return Promise.resolve({ data: productCallCount === 1 ? [validProduct] : [] });
          }),
        };
      }
      if (table === 'orders') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'categories') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'cat-1', name: 'Skincare', slug: 'skincare' }] })) };
      }
      if (table === 'subcategories') {
        return { select: jest.fn(() => Promise.resolve({ data: [{ id: 'sub-1', category_id: 'cat-1', name: 'Serums', slug: 'serums' }] })) };
      }
      if (table === 'brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'category_brands') return { select: jest.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'site_settings') {
        return {
          select: jest.fn(() => ({
            order: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve({ data: [] })) })),
          })),
        };
      }
      return { select: jest.fn(() => Promise.resolve({ data: [] })) };
    });

    function EmptyRefreshProbe() {
      const { actions, products } = useData();
      return React.createElement(
        'div',
        null,
        React.createElement('button', { type: 'button', onClick: () => actions.refreshCatalog?.() }, 'Refresh catalog'),
        React.createElement('div', { 'data-testid': 'empty-refresh-products' }, JSON.stringify(products.map((product) => ({ id: product.id, name: product.name }))))
      );
    }

    render(
      React.createElement(AuthProvider, null,
        React.createElement(DataProvider, null, React.createElement(EmptyRefreshProbe)))
    );

    await waitFor(() => expect(screen.getByTestId('empty-refresh-products')).toHaveTextContent('Hydra Lotion'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));

    await waitFor(() => {
      expect(screen.getByTestId('empty-refresh-products')).toHaveTextContent('Hydra Lotion');
      expect(screen.getByTestId('empty-refresh-products')).not.toHaveTextContent('[]');
    });
  });
});

describe('parseSitePromoCommand', () => {
  it('handles relaxed natural-language activation, reset variations, and English percentage offers', () => {
    expect(parseSitePromoCommand('make a free shipping for all orders')).toMatchObject({
      active_promo: 'free_shipping',
      promo_rule: 'free_shipping',
      is_free_shipping_active: true,
    });

    expect(parseSitePromoCommand('make a 30% off on all orders')).toMatchObject({
      active_promo: 'percentage_discount',
      promo_rule: 'percentage_discount',
      promo_discount_percent: 30,
    });

    expect(parseSitePromoCommand('make a 30% off')).toMatchObject({
      active_promo: 'percentage_discount',
      promo_rule: 'percentage_discount',
      promo_discount_percent: 30,
    });

    expect(parseSitePromoCommand('discount on all orders 30%')).toMatchObject({
      active_promo: 'percentage_discount',
      promo_rule: 'percentage_discount',
      promo_discount_percent: 30,
    });

    expect(parseSitePromoCommand('turn off free shipping for all orders')).toMatchObject({
      active_promo: 'none',
      promo_rule: 'none',
      is_free_shipping_active: false,
    });

    expect(parseSitePromoCommand('reset all promo offers')).toMatchObject({
      active_promo: 'none',
      promo_rule: 'none',
      is_free_shipping_active: false,
    });
  });
  it('cancels free shipping when the admin deactivates it', () => {
    expect(parseSitePromoCommand('الغي الشحن المجاني')).toMatchObject({
      active_promo: 'none',
      promo_rule: 'none',
      is_free_shipping_active: false,
    });

    expect(parseSitePromoCommand('stop free shipping')).toMatchObject({
      active_promo: 'none',
      promo_rule: 'none',
      is_free_shipping_active: false,
    });

    expect(parseSitePromoCommand('شيل الشحن المجاني')).toMatchObject({
      active_promo: 'none',
      promo_rule: 'none',
      is_free_shipping_active: false,
    });
  });

  it('detects BOGO and percentage offers in natural language', () => {
    expect(parseSitePromoCommand('أي قطعة عليها قطعة تانية هدية')).toMatchObject({
      active_promo: 'buy_one_get_one',
      promo_rule: 'buy_one_get_one',
      buy_x: 1,
      get_y: 1,
    });

    expect(parseSitePromoCommand('buy one get one free')).toMatchObject({
      active_promo: 'buy_one_get_one',
      promo_rule: 'buy_one_get_one',
      buy_x: 1,
      get_y: 1,
    });

    expect(parseSitePromoCommand('خصم 20% على كل المنتجات')).toMatchObject({
      active_promo: 'percentage_discount',
      promo_rule: 'percentage_discount',
      promo_discount_percent: 20,
    });
  });
});
