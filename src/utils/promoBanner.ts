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

export const MIDDLE_PROMO_BANNER_PRODUCT_ID = '065575c0-3eee-4310-8180-c5afdbbb73c2';

export const DEFAULT_PROMO_BANNER_PRODUCTS: PromoBannerProductConfig[] = [
  {
    image: '',
    alt: 'Promotional product slot',
    enabled: false,
  },
  {
    id: MIDDLE_PROMO_BANNER_PRODUCT_ID,
    image: '',
    alt: 'Promotional product slot',
    enabled: false,
  },
  {
    image: '',
    alt: 'Promotional product slot',
    enabled: false,
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
    products.push({ ...fallbackProducts[products.length], image: '', alt: 'Promotional product slot', enabled: false });
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

export const buildPromoBannerConfigFromRows = (rows: any[], bannerId?: string): PromoBannerConfig => {
  const productRows = Array.isArray(rows) ? rows : [];
  const fallback = DEFAULT_PROMO_BANNER_PRODUCTS.map((product) => ({ ...product }));
  const orderedRows = [...productRows].sort((a: any, b: any) => {
    const positionA = Number(a?.position ?? 0);
    const positionB = Number(b?.position ?? 0);
    if (positionA !== positionB) return positionA - positionB;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });

  const byPosition = new Map<number, any>();
  orderedRows.forEach((row: any) => {
    const position = Number(row?.position ?? 0);
    if (!Number.isFinite(position) || position <= 0) return;
    if (!byPosition.has(position)) {
      byPosition.set(position, row);
    }
  });

  const products = [1, 2, 3].map((position) => {
    const row = byPosition.get(position) ?? orderedRows[position - 1] ?? null;
    const fallbackProduct = fallback[position - 1] || fallback[0];

    if (!row) {
      return {
        ...fallbackProduct,
        id: position === 2 ? MIDDLE_PROMO_BANNER_PRODUCT_ID : fallbackProduct.id,
        image: '',
        alt: 'Promotional product slot',
        enabled: false,
      };
    }

    return {
      id: typeof row?.id === 'string' ? row.id : position === 2 ? MIDDLE_PROMO_BANNER_PRODUCT_ID : undefined,
      image: resolveStoragePublicUrl(row?.image_path),
      alt: typeof row?.alt_text === 'string' ? row.alt_text : `Promotional product ${position}`,
      enabled: row?.is_enabled !== false && !!row?.image_path,
    };
  });

  return normalizePromoBannerConfig({
    bannerId,
    products,
    content: DEFAULT_PROMO_BANNER.content,
    cta: { enabled: false, text: '', url: '' },
  });
};

const mapSupabaseBannerRow = (row: any): PromoBannerConfig => {
  const productRows = Array.isArray(row?.promotional_banner_products) ? row.promotional_banner_products : [];
  const config = buildPromoBannerConfigFromRows(productRows, row?.id);

  return normalizePromoBannerConfig({
    bannerId: row?.id,
    products: config.products,
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
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data?.id) return data.id;

  const fallback = await supabase
    .from('promotional_banners')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallback.error && fallback.error.code !== 'PGRST116') {
    throw fallback.error;
  }

  return fallback.data?.id ?? null;
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
        ...(product.id ? { id: product.id } : {}),
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
    ...(product.id ? { id: product.id } : {}),
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

const fetchPromoBannerConfigById = async (bannerId: string): Promise<PromoBannerConfig> => {
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
};

export const fetchPromoBannerConfig = async (): Promise<PromoBannerConfig> => {
  try {
    const bannerId = await ensurePromoBannerExists();
    if (!bannerId) return normalizePromoBannerConfig(DEFAULT_PROMO_BANNER);
    return await fetchPromoBannerConfigById(bannerId);
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
    .single();

  if (error) {
    throw new Error(formatPromoBannerError(error));
  }

  const refreshed = await fetchPromoBannerConfigById(bannerId);
  return refreshed && refreshed.content.headline ? refreshed : mapSupabaseBannerRow(data);
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
  const totalStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const activeBannerId = bannerId || (await ensurePromoBannerExists());
  if (!activeBannerId) {
    throw new Error('No promotional banner exists to update. Ensure a promo banner row exists and the admin session can write to it.');
  }

  // Use the existing promotional_banner_products.id for the middle product
  const isMiddle = position === 2 || productId === MIDDLE_PROMO_BANNER_PRODUCT_ID;
  const effectiveProductId = isMiddle ? (productId || MIDDLE_PROMO_BANNER_PRODUCT_ID) : productId;

  let resolvedStoragePath = '';
  const uploadStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (fileDataUrl && fileDataUrl.trim()) {
    const trimmed = fileDataUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      // Already an uploaded HTTP/HTTPS URL — reuse directly without re-uploading
      resolvedStoragePath = trimmed;
    } else if (trimmed.startsWith('data:')) {
      const upload = await uploadImageToSupabase(trimmed);
      resolvedStoragePath = upload.publicUrl || upload.path || '';
      if (!resolvedStoragePath) {
        console.warn('uploadImageToSupabase returned no path or publicUrl for the uploaded image.');
      }
    } else {
      resolvedStoragePath = trimmed;
    }
  }
  const uploadMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - uploadStart);

  const normalizedResolvedPath = String(resolvedStoragePath || '').replace(/^\/+/, '');
  const updatePayload: Record<string, any> = {
    image_path: normalizedResolvedPath,
    alt_text: typeof alt === 'string' ? alt.slice(0, 150) : '',
    is_enabled: Boolean(normalizedResolvedPath),
  };

  let targetQuery = supabase
    .from('promotional_banner_products')
    .update(updatePayload);

  if (effectiveProductId) {
    targetQuery = targetQuery.eq('id', effectiveProductId);
  } else {
    targetQuery = targetQuery.eq('banner_id', activeBannerId).eq('position', position);
  }

  const updateStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { data: updatedRows, error: updateError } = await targetQuery
    .select('id, banner_id, image_path, alt_text, position, is_enabled');
  const updateMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - updateStart);

  if (updateError) {
    throw new Error(formatPromoBannerError(updateError));
  }

  if (!updatedRows || (Array.isArray(updatedRows) && updatedRows.length === 0)) {
    const insertPayload = {
      ...(isMiddle ? { id: MIDDLE_PROMO_BANNER_PRODUCT_ID } : {}),
      banner_id: activeBannerId,
      position,
      image_path: normalizedResolvedPath,
      alt_text: typeof alt === 'string' ? alt.slice(0, 150) : '',
      is_enabled: Boolean(normalizedResolvedPath),
    } as any;

    const insertStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { error: insertError } = await supabase
      .from('promotional_banner_products')
      .insert(insertPayload);
    const insertMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - insertStart);

    if (insertError) {
      throw new Error(formatPromoBannerError(insertError));
    }

    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
      console.debug('[promoBanner] image insert completed', { insertMs, position, bannerId: activeBannerId });
    }
  }

  const totalMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - totalStart);
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
    console.debug('[promoBanner] image save trace', {
      totalMs,
      uploadMs,
      updateMs,
      position,
      bannerId: activeBannerId,
      productId: effectiveProductId,
      hasUploadedImage: Boolean(normalizedResolvedPath),
    });
  }

  return fetchPromoBannerConfigById(activeBannerId);
};

export const deletePromoBannerProductImage = async (productId?: string, bannerId?: string, position?: number): Promise<PromoBannerConfig> => {
  const activeBannerId = bannerId || (await ensurePromoBannerExists());
  if (!activeBannerId) {
    throw new Error('No promotional banner exists to update. Ensure a promo banner row exists and the admin session can write to it.');
  }

  // Use the existing promotional_banner_products.id for the middle product
  const isMiddle = position === 2 || productId === MIDDLE_PROMO_BANNER_PRODUCT_ID;
  const effectiveProductId = isMiddle ? (productId || MIDDLE_PROMO_BANNER_PRODUCT_ID) : productId;
  const effectivePosition = isMiddle ? 2 : (position ?? 1);

  // Read existing row to determine if a storage object should be removed
  const lookupQuery = effectiveProductId
    ? supabase.from('promotional_banner_products').select('id, banner_id, image_path, alt_text, position, is_enabled').eq('id', effectiveProductId).maybeSingle()
    : supabase.from('promotional_banner_products').select('id, banner_id, image_path, alt_text, position, is_enabled').eq('banner_id', activeBannerId).eq('position', effectivePosition).maybeSingle();

  const { data: existingRow, error: lookupErr } = await lookupQuery;
  if (lookupErr) {
    throw new Error('Failed to lookup promo product for deletion: ' + formatPromoBannerError(lookupErr));
  }

  // Attempt to remove the storage object if the path appears to be a Supabase storage public URL or storage path
  try {
    const rawPath = String(existingRow?.image_path || '').trim();
    if (rawPath) {
      // If it's a public URL, derive the storage path after /storage/v1/object/public/
      let bucket: string | null = null;
      let objectPath: string | null = null;

      if (/^https?:\/\//i.test(rawPath)) {
        try {
          const u = new URL(rawPath);
          const marker = '/storage/v1/object/public/';
          const idx = u.pathname.indexOf(marker);
          if (idx !== -1) {
            const remainder = u.pathname.slice(idx + marker.length).replace(/^\/+/, '');
            // remainder starts with bucket/... or just path depending on URL shape
            const parts = remainder.split('/');
            if (parts.length > 1) {
              bucket = parts.shift() || null;
              objectPath = parts.join('/');
            }
          }
        } catch (e) {
          // ignore
        }
      } else if (/^[^/]+\/.+/.test(rawPath)) {
        // format like 'bucket/path/to/object'
        const parts = rawPath.replace(/^\/+/, '').split('/');
        if (parts.length > 1) {
          bucket = parts.shift() || null;
          objectPath = parts.join('/');
        }
      }

      if (bucket && objectPath) {
        try {
          await supabase.storage.from(bucket).remove([objectPath]);
        } catch (remErr) {
          // Do not fail the whole operation if storage deletion fails; just log
          console.warn('Failed to remove storage object for promo product image:', remErr);
        }
      }
    }
  } catch (e) {
    console.warn('Error while attempting to remove promo product storage object:', e);
  }

  // Now clear the DB row's image fields
  let targetQuery = supabase
    .from('promotional_banner_products')
    .update({
      image_path: '',
      alt_text: '',
      is_enabled: false,
    });

  if (effectiveProductId) {
    targetQuery = targetQuery.eq('id', effectiveProductId);
  } else {
    targetQuery = targetQuery.eq('banner_id', activeBannerId).eq('position', effectivePosition);
  }

  const { error } = await targetQuery.select().maybeSingle();
  if (error) {
    throw new Error(formatPromoBannerError(error));
  }

  // Return refreshed canonical banner config
  return fetchPromoBannerConfigById(activeBannerId);
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
    ...(product.id ? { id: product.id } : {}),
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
