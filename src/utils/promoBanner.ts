export interface PromoBannerProductConfig {
  image: string;
  alt: string;
  enabled: boolean;
}

export interface PromoBannerContentConfig {
  campaignLabel: string;
  headline: string;
  badge: string;
}

export interface PromoBannerConfig {
  products: PromoBannerProductConfig[];
  content: PromoBannerContentConfig;
  cta: {
    enabled: boolean;
    text: string;
    url: string;
  };
}

export const PROMO_BANNER_STORAGE_KEY = 'phermono_promo_banner_v1';

export const DEFAULT_PROMO_BANNER_PRODUCTS: PromoBannerProductConfig[] = [
  {
    image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=700&q=80',
    alt: 'Luxury perfume bottle',
    enabled: true,
  },
  {
    image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=700&q=80',
    alt: 'Premium serum bottle',
    enabled: true,
  },
  {
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=700&q=80',
    alt: 'Luxury skincare jar',
    enabled: true,
  },
];

export const DEFAULT_PROMO_BANNER_CONTENT: PromoBannerContentConfig = {
  campaignLabel: 'WINTER SALE',
  headline: 'Up to 60% off curated essentials',
  badge: 'LIMITED TIME',
};

export const DEFAULT_PROMO_BANNER: PromoBannerConfig = {
  products: DEFAULT_PROMO_BANNER_PRODUCTS,
  content: DEFAULT_PROMO_BANNER_CONTENT,
  cta: {
    enabled: false,
    text: '',
    url: '',
  },
};

const sanitizeProduct = (product: Partial<PromoBannerProductConfig> | null | undefined, fallback: PromoBannerProductConfig): PromoBannerProductConfig => ({
  image: typeof product?.image === 'string' ? product.image : fallback.image,
  alt: typeof product?.alt === 'string' ? product.alt : fallback.alt,
  enabled: product?.enabled !== false,
});

const sanitizeContent = (content: Partial<PromoBannerContentConfig> | null | undefined): PromoBannerContentConfig => ({
  campaignLabel: typeof content?.campaignLabel === 'string' ? content.campaignLabel.slice(0, 30) : DEFAULT_PROMO_BANNER_CONTENT.campaignLabel,
  headline: typeof content?.headline === 'string' ? content.headline.slice(0, 80) : DEFAULT_PROMO_BANNER_CONTENT.headline,
  badge: typeof content?.badge === 'string' ? content.badge.slice(0, 25) : DEFAULT_PROMO_BANNER_CONTENT.badge,
});

export const normalizePromoBannerConfig = (value: Partial<PromoBannerConfig> | null | undefined): PromoBannerConfig => {
  const fallbackProducts = DEFAULT_PROMO_BANNER_PRODUCTS.map((p) => ({ ...p }));
  const incomingProducts = Array.isArray(value?.products) ? (value?.products ?? fallbackProducts) : fallbackProducts;

  const products = incomingProducts.slice(0, 3).map((product, index) => sanitizeProduct(product, fallbackProducts[index] || fallbackProducts[0]));

  while (products.length < 3) {
    products.push({ ...fallbackProducts[products.length], enabled: true });
  }

  return {
    products,
    content: sanitizeContent(value?.content),
    cta: {
      enabled: Boolean(value?.cta?.enabled),
      text: typeof value?.cta?.text === 'string' ? value.cta.text.slice(0, 30) : '',
      url: typeof value?.cta?.url === 'string' ? value.cta.url : '',
    },
  };
};

export const getPromoBannerConfig = (): PromoBannerConfig => {
  if (typeof window === 'undefined') return DEFAULT_PROMO_BANNER;

  try {
    const raw = window.localStorage.getItem(PROMO_BANNER_STORAGE_KEY);
    if (!raw) return DEFAULT_PROMO_BANNER;
    const parsed = JSON.parse(raw) as Partial<PromoBannerConfig>;
    return normalizePromoBannerConfig(parsed);
  } catch (error) {
    console.warn('Failed to load promo banner config:', error);
    return DEFAULT_PROMO_BANNER;
  }
};

export const savePromoBannerConfig = (config: PromoBannerConfig): PromoBannerConfig => {
  const normalized = normalizePromoBannerConfig(config);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PROMO_BANNER_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.warn('Failed to save promo banner config:', error);
    }
  }

  return normalized;
};

export const resetPromoBannerConfig = (): PromoBannerConfig => {
  const reset = normalizePromoBannerConfig(DEFAULT_PROMO_BANNER);
  savePromoBannerConfig(reset);
  return reset;
};
