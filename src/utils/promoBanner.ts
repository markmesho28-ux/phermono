import supabase, { SUPABASE_URL } from '../lib/supabase';

export interface PromoBannerProductConfig {
  id?: string;
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
  bannerId?: string;
  products: PromoBannerProductConfig[];
  content: PromoBannerContentConfig;
  cta: {
    enabled: boolean;
    text: string;
    url: string;
  };
}

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
  bannerId: undefined,
  products: DEFAULT_PROMO_BANNER_PRODUCTS,
  content: DEFAULT_PROMO_BANNER_CONTENT,
  cta: {
    enabled: false,
    text: '',
    url: '',
  },
};

const sanitizeProduct = (product: Partial<PromoBannerProductConfig> | null | undefined, fallback: PromoBannerProductConfig): PromoBannerProductConfig => ({
  id: typeof product?.id === 'string' ? product.id : fallback.id,
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
    bannerId: typeof value?.bannerId === 'string' ? value.bannerId : undefined,
    products,
    content: sanitizeContent(value?.content),
    cta: {
      enabled: Boolean(value?.cta?.enabled),
      text: typeof value?.cta?.text === 'string' ? value.cta.text.slice(0, 30) : '',
      url: typeof value?.cta?.url === 'string' ? value.cta.url : '',
    },
  };
};

const resolveStoragePublicUrl = (rawValue: string | null | undefined): string => {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const clean = raw.replace(/^\/+/, '').replace(/^products\//i, '');
  if (!clean) return '';

  const storagePath = clean.startsWith('promo-banners/') || clean.startsWith('promotional-banners/')
    ? clean
    : `products/${clean}`;

  const normalized = storagePath.replace(/^products\//i, 'products/');
  return `${SUPABASE_URL}/storage/v1/object/public/${normalized}`;
};

const mapSupabaseBannerRow = (row: any): PromoBannerConfig => {
  const productRows = Array.isArray(row?.promotional_banner_products) ? row.promotional_banner_products : [];
  const products = productRows
    .sort((a: any, b: any) => Number(a?.position ?? 99) - Number(b?.position ?? 99))
    .slice(0, 3)
    .map((product: any) => ({
      id: typeof product?.id === 'string' ? product.id : undefined,
      image: resolveStoragePublicUrl(product?.image_path),
      alt: typeof product?.alt_text === 'string' ? product.alt_text : 'Promotional product',
      enabled: product?.is_enabled !== false && !!product?.image_path,
    }));

  const fallback = DEFAULT_PROMO_BANNER_PRODUCTS.map((product) => ({ ...product }));
  while (products.length < 3) {
    products.push({ ...fallback[products.length], enabled: true });
  }

  return normalizePromoBannerConfig({
    bannerId: row?.id,
    products,
    content: {
      campaignLabel: typeof row?.campaign_label === 'string' ? row.campaign_label : DEFAULT_PROMO_BANNER.content.campaignLabel,
      headline: typeof row?.headline === 'string' ? row.headline : DEFAULT_PROMO_BANNER.content.headline,
      badge: typeof row?.badge_text === 'string' ? row.badge_text : DEFAULT_PROMO_BANNER.content.badge,
    },
    cta: {
      enabled: Boolean(row?.cta_enabled),
      text: typeof row?.cta_text === 'string' ? row.cta_text : '',
      url: typeof row?.cta_url === 'string' ? row.cta_url : '',
    },
  });
};

const getLatestBannerId = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from('promotional_banners')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data?.id ?? null;
};

const createMissingActiveBanner = async (): Promise<string | null> => {
  const existingBannerId = await getLatestBannerId();
  if (existingBannerId) {
    const { data: rows } = await supabase
      .from('promotional_banner_products')
      .select('id')
      .eq('banner_id', existingBannerId);

    if (!rows || rows.length === 0) {
      const insertRows = DEFAULT_PROMO_BANNER_PRODUCTS.map((product, index) => ({
        banner_id: existingBannerId,
        image_path: product.image,
        alt_text: product.alt,
        position: index + 1,
        is_enabled: product.enabled,
      }));

      const { error: insertProductError } = await supabase
        .from('promotional_banner_products')
        .insert(insertRows);

      if (insertProductError) throw insertProductError;
    }

    return existingBannerId;
  }

  const { data: created, error: createError } = await supabase
    .from('promotional_banners')
    .insert([
      {
        campaign_label: DEFAULT_PROMO_BANNER_CONTENT.campaignLabel,
        headline: DEFAULT_PROMO_BANNER_CONTENT.headline,
        badge_text: DEFAULT_PROMO_BANNER_CONTENT.badge,
        cta_enabled: false,
        cta_text: '',
        cta_url: '',
        is_active: true,
      },
    ])
    .select('id')
    .single();

  if (createError) throw createError;

  const insertRows = DEFAULT_PROMO_BANNER_PRODUCTS.map((product, index) => ({
    banner_id: created.id,
    image_path: product.image,
    alt_text: product.alt,
    position: index + 1,
    is_enabled: product.enabled,
  }));

  const { error: insertProductError } = await supabase
    .from('promotional_banner_products')
    .insert(insertRows);

  if (insertProductError) throw insertProductError;

  return created.id;
};

const formatPromoBannerError = (error: any): string => {
  const rawMessage = typeof error?.message === 'string' ? error.message : 'Unknown promotional banner error.';
  const lower = rawMessage.toLowerCase();

  if (lower.includes('row level security') || lower.includes('permission denied') || lower.includes('policy')) {
    return 'Supabase rejected the promotional banner update because the logged-in user is not authorized. Verify the admin auth session and the promotional banner RLS policies.';
  }

  if (lower.includes('no rows')) {
    return 'No promotional banner row matched the requested banner ID.';
  }

  return rawMessage;
};

export const ensurePromoBannerExists = async (): Promise<string | null> => {
  const bannerId = await getLatestBannerId();
  if (bannerId) return bannerId;

  return createMissingActiveBanner();
};

export const fetchPromoBannerConfig = async (): Promise<PromoBannerConfig> => {
  try {
    const bannerId = await ensurePromoBannerExists();
    if (!bannerId) return normalizePromoBannerConfig(DEFAULT_PROMO_BANNER);

    const { data, error } = await supabase
      .from('promotional_banners')
      .select('id, campaign_label, headline, badge_text, cta_enabled, cta_text, cta_url, promotional_banner_products(*)')
      .eq('id', bannerId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      return normalizePromoBannerConfig(DEFAULT_PROMO_BANNER);
    }

    return mapSupabaseBannerRow(data);
  } catch (error) {
    console.warn('Failed to load promo banner config from Supabase:', error);
    return normalizePromoBannerConfig(DEFAULT_PROMO_BANNER);
  }
};

const uploadImageToSupabase = async (dataUrl: string): Promise<{ path: string; publicUrl: string }> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';
  const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const storageBuckets = ['products', 'promo-banners', 'promotional-banners'];

  let lastError: any = null;

  for (const bucket of storageBuckets) {
    const storagePath = `${bucket}/${uniqueName}`;
    const uploadResult = await supabase.storage.from(bucket).upload(storagePath.replace(`${bucket}/`, ''), blob, {
      contentType: mimeType,
      upsert: true,
    });

    if (!uploadResult.error) {
      const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath.replace(`${bucket}/`, '')).data.publicUrl;
      return { path: storagePath, publicUrl };
    }

    lastError = uploadResult.error;
  }

  throw new Error(lastError?.message || 'Image upload failed.');
};

export const savePromoBannerContent = async (config: PromoBannerConfig): Promise<PromoBannerConfig> => {
  const bannerId = config.bannerId || (await ensurePromoBannerExists());
  if (!bannerId) {
    throw new Error('No promotional banner exists to update. Ensure a banner row exists and the admin session is authorized to edit it.');
  }

  const cleanContent = sanitizeContent(config.content);
  const { data, error } = await supabase
    .from('promotional_banners')
    .update({
      campaign_label: cleanContent.campaignLabel,
      headline: cleanContent.headline,
      badge_text: cleanContent.badge,
      cta_enabled: Boolean(config.cta?.enabled),
      cta_text: typeof config.cta?.text === 'string' ? config.cta.text.slice(0, 40) : '',
      cta_url: typeof config.cta?.url === 'string' ? config.cta.url : '',
    })
    .eq('id', bannerId)
    .select('id, campaign_label, headline, badge_text, cta_enabled, cta_text, cta_url, promotional_banner_products(*)')
    .maybeSingle();

  if (error) {
    throw new Error(formatPromoBannerError(error));
  }

  if (!data) {
    // If update didn't return a single row (unexpected), reload current banner config
    return fetchPromoBannerConfig();
  }

  return mapSupabaseBannerRow(data);
};

export const savePromoBannerProductImage = async ({
  bannerId,
  productId,
  position,
  fileDataUrl,
  alt,
}: {
  bannerId?: string;
  productId?: string;
  position: number;
  fileDataUrl: string | null;
  alt?: string;
}): Promise<PromoBannerConfig> => {
  const activeBannerId = bannerId || (await ensurePromoBannerExists());
  if (!activeBannerId) {
    throw new Error('No promotional banner exists to update. Ensure a promo banner row exists and the admin session can write to it.');
  }

  let resolvedStoragePath = '';
  if (fileDataUrl && fileDataUrl.trim()) {
    const upload = await uploadImageToSupabase(fileDataUrl);
    resolvedStoragePath = upload.path;
  }

  const updatePayload: Record<string, any> = {
    image_path: resolvedStoragePath,
    alt_text: typeof alt === 'string' ? alt.slice(0, 150) : '',
    is_enabled: Boolean(resolvedStoragePath),
  };

  let targetQuery = supabase
    .from('promotional_banner_products')
    .update(updatePayload);

  if (productId) {
    targetQuery = targetQuery.eq('id', productId);
  } else {
    targetQuery = targetQuery.eq('banner_id', activeBannerId).eq('position', position);
  }

  const { data, error } = await targetQuery
    .select('id, banner_id, image_path, alt_text, position, is_enabled, banner:banner_id (id, campaign_label, headline, badge_text, cta_enabled, cta_text, cta_url)')
    .maybeSingle();

  if (error) {
    throw new Error(formatPromoBannerError(error));
  }

  if (!data) {
    // Update did not return a single product row — refresh full banner config as a safe fallback
    return fetchPromoBannerConfig();
  }

  const fullBannerId = data?.banner_id || activeBannerId;
  const { data: reloaded, error: reloadError } = await supabase
    .from('promotional_banners')
    .select('id, campaign_label, headline, badge_text, cta_enabled, cta_text, cta_url, promotional_banner_products(*)')
    .eq('id', fullBannerId)
    .maybeSingle();

  if (reloadError) {
    throw new Error(formatPromoBannerError(reloadError));
  }

  if (!reloaded) {
    return fetchPromoBannerConfig();
  }

  return mapSupabaseBannerRow(reloaded);
};

export const deletePromoBannerProductImage = async (productId?: string, bannerId?: string): Promise<PromoBannerConfig> => {
  const activeBannerId = bannerId || (await ensurePromoBannerExists());
  if (!activeBannerId) {
    throw new Error('No promotional banner exists to update. Ensure a promo banner row exists and the admin session can write to it.');
  }

  let targetQuery = supabase
    .from('promotional_banner_products')
    .update({
      image_path: '',
      alt_text: '',
      is_enabled: false,
    });

  if (productId) {
    targetQuery = targetQuery.eq('id', productId);
  } else {
    targetQuery = targetQuery.eq('banner_id', activeBannerId);
  }

  const { error } = await targetQuery.select().maybeSingle();
  if (error) {
    throw new Error(formatPromoBannerError(error));
  }

  // If the update affected no rows, still reload the config to reflect DB state
  return fetchPromoBannerConfig();
};

export const resetPromoBannerConfig = async (): Promise<PromoBannerConfig> => {
  const bannerId = await ensurePromoBannerExists();
  if (!bannerId) {
    return normalizePromoBannerConfig(DEFAULT_PROMO_BANNER);
  }

  const { error: bannerError } = await supabase
    .from('promotional_banners')
    .update({
      campaign_label: DEFAULT_PROMO_BANNER_CONTENT.campaignLabel,
      headline: DEFAULT_PROMO_BANNER_CONTENT.headline,
      badge_text: DEFAULT_PROMO_BANNER_CONTENT.badge,
      cta_enabled: false,
      cta_text: '',
      cta_url: '',
    })
    .eq('id', bannerId);

  if (bannerError) {
    throw new Error(bannerError.message || 'Failed to reset banners.');
  }

  const { error: productError } = await supabase
    .from('promotional_banner_products')
    .delete()
    .eq('banner_id', bannerId);

  if (productError) {
    throw new Error(productError.message || 'Failed to reset banner products.');
  }

  const insertRows = DEFAULT_PROMO_BANNER_PRODUCTS.map((product, index) => ({
    banner_id: bannerId,
    image_path: product.image,
    alt_text: product.alt,
    position: index + 1,
    is_enabled: product.enabled,
  }));

  const { error: insertError } = await supabase
    .from('promotional_banner_products')
    .insert(insertRows);

  if (insertError) {
    throw new Error(insertError.message || 'Failed to repopulate default banner products.');
  }

  return fetchPromoBannerConfig();
};

export const getPromoBannerConfig = fetchPromoBannerConfig;
export const savePromoBannerConfig = savePromoBannerContent;
