import { resolveCategoryIdForUpdate, isPermissionDeniedOrRlsError, parseSitePromoCommand, getFreeShippingFee, resolveCategoryIdForInsert, resolveCategoryIdForRelation } from './DataContext';
import { looksLikeAdminCommandIntent } from '../components/ChatWidget';

describe('isPermissionDeniedOrRlsError', () => {
  it('detects admin permission and row-level security rejections', () => {
    expect(isPermissionDeniedOrRlsError({ code: '42501', message: 'permission denied for table products' })).toBe(true);
    expect(isPermissionDeniedOrRlsError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(isPermissionDeniedOrRlsError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
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
