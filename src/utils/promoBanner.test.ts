import {
  MIDDLE_PROMO_BANNER_PRODUCT_ID,
  DEFAULT_PROMO_BANNER_PRODUCTS,
  buildPromoBannerConfigFromRows,
  normalizePromoBannerConfig,
} from './promoBanner';

describe('promoBanner middle product configuration and mapping', () => {
  it('defines the existing MIDDLE_PROMO_BANNER_PRODUCT_ID correctly', () => {
    expect(MIDDLE_PROMO_BANNER_PRODUCT_ID).toBe('065575c0-3eee-4310-8180-c5afdbbb73c2');
  });

  it('assigns MIDDLE_PROMO_BANNER_PRODUCT_ID to the middle product in DEFAULT_PROMO_BANNER_PRODUCTS', () => {
    expect(DEFAULT_PROMO_BANNER_PRODUCTS[1].id).toBe(MIDDLE_PROMO_BANNER_PRODUCT_ID);
    // Left and right products default to undefined IDs
    expect(DEFAULT_PROMO_BANNER_PRODUCTS[0].id).toBeUndefined();
    expect(DEFAULT_PROMO_BANNER_PRODUCTS[2].id).toBeUndefined();
  });

  it('normalizes promo banner config while preserving middle product ID', () => {
    const config = normalizePromoBannerConfig({
      bannerId: 'banner-123',
      products: [
        { image: 'https://example.com/left.jpg', alt: 'Left', enabled: true },
        { id: MIDDLE_PROMO_BANNER_PRODUCT_ID, image: 'https://example.com/mid.jpg', alt: 'Middle', enabled: true },
        { id: 'right-id', image: 'https://example.com/right.jpg', alt: 'Right', enabled: true },
      ],
      content: {
        campaignLabel: 'SUMMER',
        headline: 'Big sale',
        badge: 'NEW',
      },
    });

    expect(config.bannerId).toBe('banner-123');
    expect(config.products[0].image).toBe('https://example.com/left.jpg');
    expect(config.products[1].id).toBe(MIDDLE_PROMO_BANNER_PRODUCT_ID);
    expect(config.products[1].image).toBe('https://example.com/mid.jpg');
    expect(config.products[2].id).toBe('right-id');
  });

  it('falls back to MIDDLE_PROMO_BANNER_PRODUCT_ID when middle product ID is omitted in partial config', () => {
    const config = normalizePromoBannerConfig({
      bannerId: 'banner-123',
      products: [
        { image: 'https://example.com/left.jpg', alt: 'Left', enabled: true },
        { image: 'https://example.com/mid.jpg', alt: 'Middle', enabled: true },
        { image: 'https://example.com/right.jpg', alt: 'Right', enabled: true },
      ],
    });

    expect(config.products[1].id).toBe(MIDDLE_PROMO_BANNER_PRODUCT_ID);
  });

  it('preserves all existing product rows when rebuilding banner state from DB rows', () => {
    const config = buildPromoBannerConfigFromRows([
      { id: 'left-row-id', banner_id: 'banner-123', image_path: 'https://example.com/left.jpg', alt_text: 'Left', position: 1, is_enabled: true },
      { id: 'middle-row-id', banner_id: 'banner-123', image_path: 'https://example.com/mid.jpg', alt_text: 'Middle', position: 2, is_enabled: true },
      { id: 'right-row-id', banner_id: 'banner-123', image_path: 'https://example.com/right.jpg', alt_text: 'Right', position: 3, is_enabled: true },
    ], 'banner-123');

    expect(config.bannerId).toBe('banner-123');
    expect(config.products).toHaveLength(3);
    expect(config.products[0].id).toBe('left-row-id');
    expect(config.products[1].id).toBe('middle-row-id');
    expect(config.products[2].id).toBe('right-row-id');
    expect(config.products[0].image).toBe('https://example.com/left.jpg');
    expect(config.products[1].image).toBe('https://example.com/mid.jpg');
    expect(config.products[2].image).toBe('https://example.com/right.jpg');
  });
});
