import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import supabase, { SUPABASE_URL } from '../lib/supabase';
import type { Category, CategorySubcategory, DataContextValue, Order, Product, PriceRange, SiteSettings } from '../types';
import { normalizeOrderItems } from '../utils/orderPrice';

const DataContext = createContext<DataContextValue | null>(null);
const STORAGE_KEY = 'phermono_data_v1';
const EMPTY_DATA = {
  categories: [] as Category[],
  brands: [] as string[],
  products: [] as Product[],
  priceRanges: [] as PriceRange[],
  orders: [] as Order[],
};

const DEFAULT_SITE_SETTINGS: SiteSettings = {
  free_shipping_threshold: 200,
  active_promo: 'none',
  is_free_shipping_active: false,
  promo_banner_text: '',
  promo_discount_percent: 0,
  promotion_scope: 'all',
  promo_rule: 'none',
  buy_x: 0,
  get_y: 0,
  promo_start_at: null,
  promo_end_at: null,
};

const SITE_SETTINGS_CACHE_KEY = 'phermono_site_settings_v1';

const readCachedSiteSettings = (): Partial<SiteSettings> | null => {
  try {
    const raw = localStorage.getItem(SITE_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
};

const writeCachedSiteSettings = (settings: Partial<SiteSettings>) => {
  try {
    localStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify({ ...DEFAULT_SITE_SETTINGS, ...settings }));
  } catch (_) {
    // ignore cache write failures
  }
};

export const getEffectiveSiteSettings = (settings: Partial<SiteSettings> = {}): SiteSettings => ({
  ...DEFAULT_SITE_SETTINGS,
  ...settings,
});

export const getPromoDiscountPercent = (settings: Partial<SiteSettings> = {}): number => {
  const value = Number(settings.promo_discount_percent ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
};

export const getFreeShippingFee = (subtotal: number, settings: Partial<SiteSettings> = {}, fallbackFee = 50): number => {
  const threshold = Number(settings.free_shipping_threshold ?? DEFAULT_SITE_SETTINGS.free_shipping_threshold ?? 200);
  const normalizedFallbackFee = Number.isFinite(Number(fallbackFee)) ? Number(fallbackFee) : 50;
  const activeFreeShipping = Boolean(settings.is_free_shipping_active);
  const qualifiesForFreeShipping = activeFreeShipping && Number.isFinite(threshold) && subtotal >= threshold;

  if (qualifiesForFreeShipping) {
    return 0;
  }

  return normalizedFallbackFee;
};

export const getDiscountedPrice = (basePrice: number, settings: Partial<SiteSettings> = {}): number => {
  const rate = getPromoDiscountPercent(settings) / 100;
  const normalizedBase = Number(basePrice) || 0;
  return Number((normalizedBase * (1 - rate)).toFixed(2));
};

export const getCartPromoDiscount = (items: Array<{ price: number; qty: number }>, settings: Partial<SiteSettings> = {}): number => {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
  const discountPercent = getPromoDiscountPercent(settings);
  if (discountPercent > 0) {
    return Number((subtotal * (discountPercent / 100)).toFixed(2));
  }

  const promoRule = String(settings.promo_rule || settings.active_promo || '').toLowerCase();
  const buyX = Number(settings.buy_x ?? 0);
  const getY = Number(settings.get_y ?? 0);
  if (promoRule.includes('buy') && buyX > 0 && getY > 0) {
    const qualifyingUnits = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const freeUnits = Math.floor(qualifyingUnits / (buyX + getY)) * getY;
    const averagePrice = items.length > 0 ? subtotal / items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) : 0;
    return Number((averagePrice * freeUnits).toFixed(2));
  }

  return 0;
};

const normalizeArabicCommandText = (value: string): string => {
  const normalized = String(value ?? '').trim();
  const digitsMap: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5',
    '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5',
    '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };

  let result = normalized
    .replace(/[\u0640\u0610-\u061A\u064B-\u065F]/g, '')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[\u200C\u200D]/g, '');

  result = Array.from(result).map((char) => digitsMap[char] || char).join('');
  result = result
    .replace(/\s+/g, ' ')
    .replace(/[\u2013\u2014\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
};

const extractFirstNumber = (value: string): number | null => {
  const normalized = normalizeArabicCommandText(value);
  const regex = /(\d{1,6})/g;
  const matches = normalized.match(regex);
  if (!matches || matches.length === 0) return null;

  const candidate = Number(matches[0]);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
};

export const parseSitePromoCommand = (command: string): Partial<SiteSettings> => {
  const text = String(command ?? '').trim();
  if (!text) return {};

  const normalized = normalizeArabicCommandText(text);
  const lower = normalized.toLowerCase();
  const updates: Partial<SiteSettings> = {};

  const triggerKeywords = /(free shipping|shipping free|free delivery|delivery free|sale|percent|percentage|discount|offer|promo|campaign|شحن مجانى|الشحن المجانى|شحن مجاني|الشحن المجاني|الشحن مجانا|توصيل مجاني|الشحن مجاني|التوصيل المجاني|العرض|تفعيل|إيقاف|تعطيل|تحديث|هدية|gift|buy one|get one|bogo|باقي|فوق|اوردر|order|طلب|خصم|تخفيض|تخلي|off|الغي|الغى|cancel|stop|disable|remove|reset)/i;
  if (!triggerKeywords.test(normalized)) {
    return {};
  }

  const shippingVariant = /(free shipping|shipping free|free delivery|delivery free|الشحن|شحن|التوصيل|توصيل|شحن مجانى|الشحن المجانى|شحن مجاني|الشحن المجاني|الشحن مجانا|التوصيل المجاني|توصيل مجاني|توصيل مجانى|شحن مجان|مجان شحن|مجان التوصيل|شحنه مجاني|شحنه مجانى|مجاني)/i;
  const shippingDisable = /(disable|deactivate|turn off|off|تعطيل|إيقاف|قف|توقيف|أوقف|غلق|لاغي|ألغاء|الغى|الغي|اغلاق|خليها|بلاش|stop|cancel|remove|reset|clear|none|لا عرض|خلاص|أزل|سحب|نهي|شيل|إزالة)/i;
  const shippingEnable = /(activate|enable|turn on|on|تفعيل|تشغيل|افتح|enabled|اشتغل|فعل|شغل|خلي|خلّى|خلها|خلى)/i;

  const isGlobalReset = /(reset|clear all|remove all|cancel all|disable all|no promo|لا يوجد عرض|لا توجد عروض|ازالة كل العروض|مسح كل|إعادة تعيين|اعادة ضبط|reset to default|default)/i.test(normalized)
    || /(اغلاق|إيقاف|الغى|الغي|إلغاء|cancel|stop|shil|شيل|remove|reset).*(promo|offer|عرض|العرض|campaign|حملة|شحن|توصيل|الشحن)/i.test(normalized);

  if (isGlobalReset) {
    updates.active_promo = 'none';
    updates.promo_rule = 'none';
    updates.promo_banner_text = '';
    updates.promo_discount_percent = 0;
    updates.buy_x = 0;
    updates.get_y = 0;
    updates.free_shipping_threshold = 200;
    updates.is_free_shipping_active = false;
    updates.promotion_scope = 'all';
    return updates;
  }

  const hasShippingFeature = /(شحن|توصيل|shipping|delivery)/i.test(normalized);

  if (hasShippingFeature && shippingDisable.test(normalized)) {
    updates.is_free_shipping_active = false;
    updates.active_promo = 'none';
    updates.promo_rule = 'none';
    updates.promo_banner_text = '';
    updates.promo_discount_percent = 0;
    updates.buy_x = 0;
    updates.get_y = 0;
    return updates;
  }

  const freeShippingActivationPattern = /(make|set|create|apply|start)\s*(?:a\s+)?(?:free\s+)?shipping|(?:enable|activate|turn\s*on|turnon|start)\s*(?:free\s+)?shipping|(?:free\s+shipping|الشحن\s*المجاني|الشحن\s*المجانى|شحن\s*مجاني|شحن\s*مجانى)\s*(?:for|ل|على)?\s*(?:all\s+orders|كل\s*الطلبات|الطلبات)?/i;

  if (shippingVariant.test(normalized) && (shippingEnable.test(normalized) || freeShippingActivationPattern.test(normalized))) {
    updates.is_free_shipping_active = true;
    updates.active_promo = 'free_shipping';
    updates.promo_rule = 'free_shipping';
    updates.promo_banner_text = 'Free shipping';
  }

  const directShippingThresholdPatterns = [
    /(?:اوردر|order|طلب|الطلب|)\s*(?:فوق|اعلى|أعلى|اكبر|أكبر|اكثر|أكثر|over|above|more than)\s*(?:ال)?\s*(\d{1,6}|[٠-٩]{1,6})\s*(?:جنيه|جنيهات|ج.م|egp|جنيه مصرى|جنيهات مصريه|pounds|£)?\s*(?:.*)?(?:شحن|توصيل)\s*(?:مجان|مجاني|مجانا|مجانى)/i,
    /(?:شحن|توصيل)\s*(?:مجان|مجاني|مجانا|مجانى)\s*(?:.*)?(?:فوق|اعلى|أعلى|اكبر|أكبر|اكثر|أكثر|over|above|more than)\s*(?:ال)?\s*(\d{1,6}|[٠-٩]{1,6})\s*(?:جنيه|جنيهات|ج.م|egp|جنيه مصرى|جنيهات مصريه|pounds|£)?/i,
    /(?:فوق\s*(?:ال)?\s*(\d{1,6}|[٠-٩]{1,6})\s*(?:جنيه|جنيهات|ج.م|egp|جنيه مصرى|جنيهات مصريه|pounds|£))(?:(?!$).)*?(?:شحن|توصيل)\s*(?:مجان|مجاني|مجانا|مجانى)/i,
    /(?:أوردر|order|طلب|الطلب)[\s\S]{0,35}(?:فوق|اعلى|أعلى|اكبر|أكبر|اكثر|أكثر|over|above|more than)[\s\S]{0,20}(\d{1,6}|[٠-٩]{1,6})/i,
    /(?:فوق|اعلى|أعلى|اكبر|أكبر|اكثر|أكثر|over|above|more than)[\s\S]{0,20}(\d{1,6}|[٠-٩]{1,6})[\s\S]{0,30}(?:شحن|توصيل)\s*(?:مجان|مجاني|مجانا|مجانى)/i,
  ];

  let thresholdMatch: RegExpMatchArray | null = null;
  for (const pattern of directShippingThresholdPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      thresholdMatch = match;
      break;
    }
  }

  if (!thresholdMatch) {
    const explicitValue = extractFirstNumber(normalized);
    const thresholdContext = /(فوق|اعلى|أعلى|اكبر|أكبر|اكثر|أكثر|over|above|more than|الحد الأدنى|حد أدنى|minimum|threshold|اوردر|order|طلب)/i.test(normalized);
    if (thresholdContext && shippingVariant.test(normalized) && explicitValue) {
      thresholdMatch = [normalized, String(explicitValue)];
    }
  }

  if (thresholdMatch) {
    const parsedValue = Number(String(thresholdMatch[1] || thresholdMatch[0]).replace(/[^0-9]/g, ''));
    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      updates.free_shipping_threshold = parsedValue;
      updates.is_free_shipping_active = true;
      updates.active_promo = 'free_shipping';
      updates.promo_rule = 'free_shipping';
      updates.promo_banner_text = `Free shipping over ${parsedValue}`;
    }
  }

  const bogoPatterns = [
    /(?:buy\s*)(\d+)\s*(?:get|gets|واحد|احصل على|اتنين|two|3|4|5)?\s*(\d+)?\s*(?:free|مجانا|مجاناً|هدية)/i,
    /(?:اشتري|خلي|buy)\s*(\d+)\s*(?:واحد|و|احصل|get)\s*(?:على)?\s*(\d+)?\s*(?:مجانا|هدية|free)/i,
    /(?:buy\s*one\s*get\s*one|bogo|buy 1 get 1|buy one get one|اشتري واحد واحصل على واحد|واحد هدية|هدية مجانية|قطعة هدية|gift with purchase|gift)/i,
    /(?:أي\s*قطعة\s*عليها\s*قطعة\s*تانية\s*هدية|قطعة\s*عليها\s*قطعة\s*تانية\s*هدية|قطعة\s*تاني\s*هدية|أي\s*قطعة\s*على\s*قطعة\s*هدية)/i,
  ];

  const buyXGetYMatch = bogoPatterns.map((pattern) => normalized.match(pattern)).find(Boolean);
  if (buyXGetYMatch) {
    const buyCount = Number(buyXGetYMatch[1] || 1);
    const freeCount = Number(buyXGetYMatch[2] || 1);

    updates.active_promo = 'buy_one_get_one';
    updates.promo_rule = 'buy_one_get_one';
    updates.buy_x = buyCount > 0 ? buyCount : 1;
    updates.get_y = freeCount > 0 ? freeCount : 1;
    updates.promo_banner_text = `Buy ${updates.buy_x} Get ${updates.get_y} Free`;
  }

  const percentMatch = lower.match(/(?:make\s+(?:a\s+)?)?(\d{1,2})\s*%\s*(?:off|discount|sale|offer)/i)
    || lower.match(/(?:make\s+(?:a\s+)?)?(?:discount|offer|sale|off)\s*(?:on|for)?\s*(?:all\s+orders|all\s+products|everything|all\s+items|the\s+store)?\s*(\d{1,2})\s*(?:%|٪)/i)
    || lower.match(/(\d{1,2})\s*%/i)
    || normalized.match(/(\d{1,2})\s*٪/i)
    || normalized.match(/(?:خصم|تخفيض|discount|percentage|percent|offer|off|sale)[\s\S]{0,20}(\d{1,2})/i)
    || normalized.match(/(\d{1,2})\s*(?:%|٪)\s*(?:off|discount|sale|offer)/i)
    || normalized.match(/(?:discount|offer|sale|off)\s*(?:on|for)?\s*(?:all\s+orders|all\s+products|everything|all\s+items|the\s+store)?\s*(\d{1,2})\s*(?:%|٪)/i)
    || normalized.match(/(?:خصم|تخفيض)\s*(?:على|كل|ال)?[\s\S]{0,20}(\d{1,2})\s*(?:%|٪)/i);
  if (percentMatch) {
    const percentValue = Number((percentMatch[1] ?? percentMatch[0] ?? '0').toString().replace(/[^0-9]/g, ''));
    if (Number.isFinite(percentValue) && percentValue >= 0 && percentValue <= 100) {
      updates.promo_discount_percent = Math.max(0, Math.min(100, percentValue));
      updates.active_promo = 'percentage_discount';
      updates.promo_rule = 'percentage_discount';
      updates.promotion_scope = /skincare|skin care|بشرة|beauty|مكياج|cosmetics|مستحضرات/i.test(normalized) ? 'skincare' : 'all';
      updates.promo_banner_text = `${percentValue}% off on your order`;
    }
  }

  if (shippingVariant.test(normalized) && !shippingDisable.test(normalized) && !shippingEnable.test(normalized) && !thresholdMatch && Object.keys(updates).length === 0) {
    updates.active_promo = 'free_shipping';
    updates.promo_rule = 'free_shipping';
    updates.is_free_shipping_active = true;
    updates.promo_banner_text = 'Free shipping';
  } else if (/(gift|هدية|قطعة هدية|piece gift|offer with free gift|هدية مجانية|مكافأة|present)/i.test(normalized) && !buyXGetYMatch) {
    updates.active_promo = 'gift_with_purchase';
    updates.promo_rule = 'gift_with_purchase';
    updates.promo_banner_text = 'Gift with purchase';
  } else if (/(clear|disable|remove|none|لا عرض|خلاص|أزل|سحب|نهي|إلغاء|end promo|remove promo|cancel promo)/i.test(normalized) && /(promo|campaign|عرض|برومو|حملة|offer|discount)/i.test(normalized)) {
    updates.active_promo = 'none';
    updates.promo_rule = 'none';
    updates.promo_discount_percent = 0;
    updates.buy_x = 0;
    updates.get_y = 0;
    updates.promo_banner_text = '';
  }

  const explicitPromoMatch = lower.match(/(?:set\s+active\s+promo\s+to|promo\s+to|active promo\s+is|العرض\s+النشط\s+هو|حدد\s+العرض\s+النشط|ضع\s+عرض\s+)\s*([a-z0-9\s-]+)/i)
    || normalized.match(/(?:العرض\s+النشط\s+هو|حدد\s+العرض\s+النشط|ضع\s+عرض\s+)\s*([\u0600-\u06FFa-z0-9\s-]+)/i);
  if (explicitPromoMatch) {
    const label = explicitPromoMatch[1].trim();
    if (label && label.toLowerCase() !== 'none' && !/لا\s*عرض|none/i.test(label)) {
      updates.active_promo = label.toLowerCase().replace(/\s+/g, '_');
      updates.promo_rule = label.toLowerCase().replace(/\s+/g, '_');
      updates.promo_banner_text = label;
    }
  }

  if (Object.keys(updates).length === 0) {
    return {};
  }

  if (!('promo_banner_text' in updates) && updates.active_promo && updates.active_promo !== 'none') {
    updates.promo_banner_text = updates.active_promo.replace(/_/g, ' ');
  }

  if (updates.active_promo === 'none' || /^(none|لا عرض|لا توجد عروض|cancelled|cancelled promo|مسح|إلغاء)$/i.test(String(updates.active_promo || ''))) {
    updates.active_promo = 'none';
    updates.promo_rule = 'none';
    updates.promo_banner_text = '';
    updates.promo_discount_percent = 0;
    updates.buy_x = 0;
    updates.get_y = 0;
  }

  return updates;
};

// Hard-coded live schema facts for the `products` table.
// Confirmed columns: id, name, category_id, brand (text), selling_price, market_price, admin_cost, image, description,
// rating, reviews, hero, created_at, updated_at.
// After migration we will persist product -> subcategory in `products.subcategory_id` (TEXT) referencing `subcategories.id`.
const PRODUCT_SCHEMA = {
  productsHasCategoryId: true,
  productsHasCategory: false,
  // We expect to persist subcategory relationships in products.subcategory_id
  productsHasSubcategoryId: true,
  productsHasSubcategory: false,
  productsHasBrandId: false,
  productsHasBrand: true,
} as const;

const isUuid = (v: string | undefined | null): boolean => {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v));
};

const slugify = (value: string) => {
  const base = String(value || '').trim();
  if (!base) return `item-${Date.now()}`;

  const normalized = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized || `item-${Date.now()}`;
};

export const createUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
};

export const createCategoryId = (): string => createUuid();

export const resolveCategoryIdForInsert = (candidate?: string | null): string => {
  const trimmed = String(candidate ?? '').trim();
  if (trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }

  return createUuid();
};

export const resolveCategoryIdForUpdate = async (
  candidateId: string,
  currentCategories: Category[] = [],
  supabaseClient: any = supabase,
): Promise<string> => {
  const raw = String(candidateId ?? '').trim();
  if (!raw) return candidateId;
  if (isUuid(raw)) return raw;

  const localMatch = currentCategories.find((category) =>
    category.id === raw ||
    slugify(category.label) === raw ||
    category.label.toLowerCase() === raw.toLowerCase()
  );

  if (localMatch && isUuid(localMatch.id)) {
    return localMatch.id;
  }

  const candidates = Array.from(new Set([raw, slugify(raw)]));

  for (const value of candidates) {
    if (!value) continue;

    try {
      const { data, error } = await supabaseClient
        .from('categories')
        .select('id')
        .eq('slug', value)
        .limit(1);

      if (!error && Array.isArray(data) && data[0]?.id) return String(data[0].id);
    } catch (_) {}

    try {
      const { data, error } = await supabaseClient
        .from('categories')
        .select('id')
        .eq('name', value)
        .limit(1);

      if (!error && Array.isArray(data) && data[0]?.id) return String(data[0].id);
    } catch (_) {}
  }

  return raw;
};

export const resolveCategoryIdForRelation = async (
  candidateId: string | null | undefined,
  currentCategories: Category[] = [],
  supabaseClient: any = supabase,
): Promise<string | null> => {
  const raw = String(candidateId ?? '').trim();
  if (!raw) return null;

  // If the value is already a UUID, verify it actually exists as a row in the
  // categories table before returning it. Returning a locally-generated UUID that
  // has not yet been committed to Supabase (or was since deleted) will cause a
  // foreign key constraint violation on the subcategories insert.
  if (isUuid(raw)) {
    // Fast-path: check local categories state first (no network round-trip needed
    // when the category was already fetched/inserted in this session).
    const localHit = currentCategories.find((c) => c.id === raw && isUuid(c.id));
    if (localHit) return raw;

    // Not found locally — do a targeted DB lookup to confirm the row exists.
    try {
      const { data, error } = await supabaseClient
        .from('categories')
        .select('id')
        .eq('id', raw)
        .limit(1)
        .maybeSingle();
      if (!error && data?.id) return String(data.id);
    } catch (_) {}

    // UUID not found in DB — fall through to slug/name resolution below.
  }

  // Non-UUID input: try to resolve via local state label/slug match.
  const localMatch = currentCategories.find(
    (category) =>
      String(category.id) === raw ||
      slugify(category.label) === raw ||
      category.label.toLowerCase() === raw.toLowerCase(),
  );
  if (localMatch && isUuid(localMatch.id)) return localMatch.id;

  // Final fallback: query Supabase by slug or name.
  const candidates = Array.from(new Set([raw, slugify(raw)]));
  for (const value of candidates) {
    if (!value) continue;
    try {
      const { data, error } = await supabaseClient
        .from('categories')
        .select('id')
        .or(`id.eq.${value},slug.eq.${value},name.eq.${value}`)
        .limit(1)
        .maybeSingle();
      if (!error && data?.id) return String(data.id);
    } catch (_) {}
  }

  // All resolution attempts exhausted — return null. Callers must treat null as
  // "category not found" and must NOT proceed with a subcategory insert.
  return null;
};

const mapCategoryRow = (row: any, subcategoryRows: any[] = [], brandRows: any[] = []): Category => ({
  id: String(row?.id || ''),
  label: row?.name ?? row?.label ?? row?.slug ?? '',
  icon: row?.icon ?? 'Sparkles',
  color: row?.color ?? '',
  accent: row?.accent ?? '',
  image: row?.image ? normalizeProductImage(row.image) : '',
  subcategories: (subcategoryRows || [])
    .filter((sub) => String(sub?.category_id) === String(row?.id))
    .map((sub) => ({
      // Only use the actual UUID from the DB. Never fall back to slug/name/label —
      // those are not valid FK values and would cause FK violations if used as category_id
      // in subsequent subcategory operations.
      id: isUuid(String(sub?.id ?? '')) ? String(sub.id) : '',
      label: sub?.name ?? sub?.label ?? sub?.slug ?? '',
    }))
    .filter((sub) => !!sub.id), // drop any rows that don't have a real UUID id
  brands: (brandRows || [])
    .filter((brand) => String(brand?.category_id) === String(row?.id))
    .map((brand) => String(brand?.name ?? brand?.label ?? brand?.slug ?? ''))
    .filter(Boolean),
});

const toNumberOrUndefined = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

// Recursively remove any property named `price` from objects/arrays to avoid sending
// legacy/deleted `price` columns to Supabase.
const removePriceKeys = (value: any): any => {
  if (Array.isArray(value)) return value.map(removePriceKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      if (k === 'price') continue;
      out[k] = removePriceKeys((value as any)[k]);
    }
    return out;
  }
  return value;
};

// Resolve a subcategory identifier (id, slug, name, or object) to a canonical DB id when possible.
const resolveSubcategoryId = async (value: any): Promise<string | null> => {
  if (!value) return null;

  // If given an object like { id } or { slug } or { name }, prefer id then slug/name
  if (typeof value === 'object') {
    try {
      if (value?.id) return String(value.id);
      if (value?.slug) value = String(value.slug);
      else if (value?.name) value = String(value.name);
      else value = '';
    } catch (_) {
      value = '';
    }
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // If it's already a UUID, return as-is
  if (isUuid(raw)) return raw;

  // Try a few prioritized lookups: exact slug, exact name, slugified, then case-insensitive partial matches.
  const slugCandidate = slugify(raw);
  try {
    // Exact slug
    try {
      const { data: bySlug } = await supabase.from('subcategories').select('id').eq('slug', raw).limit(1).maybeSingle();
      if (bySlug && (bySlug as any).id) return String((bySlug as any).id);
    } catch (_) {}

    // Exact name
    try {
      const { data: byName } = await supabase.from('subcategories').select('id').eq('name', raw).limit(1).maybeSingle();
      if (byName && (byName as any).id) return String((byName as any).id);
    } catch (_) {}

    // Slugified match
    if (slugCandidate && slugCandidate !== raw) {
      try {
        const { data: bySlug2 } = await supabase.from('subcategories').select('id').eq('slug', slugCandidate).limit(1).maybeSingle();
        if (bySlug2 && (bySlug2 as any).id) return String((bySlug2 as any).id);
      } catch (_) {}
    }

    // Case-insensitive contains on slug and name as a last resort
    try {
      const { data: bySlugIlike } = await supabase.from('subcategories').select('id').ilike('slug', `%${raw}%`).limit(1).maybeSingle();
      if (bySlugIlike && (bySlugIlike as any).id) return String((bySlugIlike as any).id);
    } catch (_) {}

    try {
      const { data: byNameIlike } = await supabase.from('subcategories').select('id').ilike('name', `%${raw}%`).limit(1).maybeSingle();
      if (byNameIlike && (byNameIlike as any).id) return String((byNameIlike as any).id);
    } catch (_) {}
  } catch (e) {
    // ignore resolution errors; caller will decide fallback
  }

  return null;
};

const normalizeProductImage = (value: any): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  // do not return blob/data URLs directly; caller should upload them before saving
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return '';
  if (raw.startsWith('/')) {
    if (raw.startsWith('/storage/')) return `${SUPABASE_URL}${raw}`;
    return `${SUPABASE_URL}/storage/v1/object/public${raw}`;
  }

  const storagePath = raw.replace(/^\/+/, '');
  const candidates = ['products', 'images', 'uploads', 'assets'];
  const bucket = candidates.find((name) => storagePath.toLowerCase().startsWith(`${name}/`));
  if (bucket) {
    const remainder = storagePath.slice(bucket.length + 1);
    if (remainder) return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${remainder}`;
  }

  return raw;
};

const resolvePersistedProductImage = (row: any): string | null => {
  const candidates = [
    row?.image,
    Array.isArray(row?.images) ? row.images.find((item: any) => !!String(item ?? '').trim()) : null,
    row?.image_url,
    row?.imageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return null;
};

export const uploadImageFile = async (file: File, bucket = 'products', folder = ''): Promise<string> => {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (!allowedTypes.has(file.type)) {
    throw new Error('Unsupported image type. Use PNG, JPG, WEBP, or GIF.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExtension}`;
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  const path = `${cleanFolder ? `${cleanFolder}/` : ''}${fileName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: '31536000',
  });

  if (error) throw new Error(error.message || 'Image upload failed.');
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Supabase did not return a public image URL.');
  return data.publicUrl;
};

// Upload data/blob image strings to Supabase Storage and return a public URL.
const uploadImageIfNeeded = async (value: any, bucket = 'products', folder = ''): Promise<string | null> => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw; // already an absolute URL

  // Only handle data: or blob: or plain filenames.
  if (!raw.startsWith('data:') && !raw.startsWith('blob:') && !raw.startsWith('/')) {
    // treat as storage path candidate
    // normalize to public URL if it matches common bucket patterns
    const normalized = normalizeProductImage(raw);
    if (normalized) return normalized;
  }

  try {
    // Convert data/blob URL to Blob
    const response = await fetch(raw);
    const blob = await response.blob();
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(blob.type)) {
      console.warn('Image upload rejected: unsupported MIME type.');
      return null;
    }
    if (blob.size > 5 * 1024 * 1024) {
      console.warn('Image upload rejected: file exceeds 5 MB.');
      return null;
    }
    const ext = (blob.type && blob.type.split('/')[1]) ? blob.type.split('/')[1].split(';')[0] : 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const path = `${folder ? `${folder.replace(/^\/+|\/+$/g, '')}/` : ''}${fileName}`;

    const uploadRes = await supabase.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: blob.type,
      cacheControl: '31536000',
    });
    if (uploadRes.error) {
      console.warn('Image upload failed:', uploadRes.error.message || uploadRes.error);
      return null;
    }

    // Construct public URL (prefer SDK helper when available)
    try {
      const maybe = supabase.storage.from(bucket).getPublicUrl(path);
      // supabase-js may return { data: { publicUrl } } or { publicURL }
      if (maybe && typeof maybe === 'object') {
        // data.publicUrl
        if ((maybe as any).data && (maybe as any).data.publicUrl) return (maybe as any).data.publicUrl;
        // data.publicURL
        if ((maybe as any).data && (maybe as any).data.publicURL) return (maybe as any).data.publicURL;
        // publicURL
        if ((maybe as any).publicURL) return (maybe as any).publicURL;
        // publicUrl
        if ((maybe as any).publicUrl) return (maybe as any).publicUrl;
      }
    } catch (e) {
      // ignore and fallback to manual construction
    }

    // Fallback manual construction: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
    return publicUrl;
  } catch (err) {
    console.warn('Failed to upload/convert image:', err);
    return null;
  }
};

const isMissingColumnError = (error: any) => {
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
  return /column .* does not exist|does not exist|unknown column/i.test(message);
};

export const isPermissionDeniedOrRlsError = (error: any): boolean => {
  const code = String(error?.code ?? '').toUpperCase();
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

  return (
    code === '42501' ||
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    /permission denied/i.test(message) ||
    /row level security/i.test(message) ||
    /rls/i.test(message) ||
    /jwt expired/i.test(message) ||
    /not authenticated/i.test(message) ||
    /unauthorized/i.test(message)
  );
};

const persistBestSellerFlag = async (productId: number, nextValue: boolean): Promise<boolean> => {
  if (!supabase) return false;

  const columnName = 'hero';

  try {
    const { error } = await supabase
      .from('products')
      .update({
        [columnName]: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (error) throw error;
    return true;
  } catch (e: any) {
    console.warn('Supabase best seller sync failed:', e?.message || e);
    return false;
  }
};

function getInitialData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...EMPTY_DATA,
          ...parsed,
          categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        };
      }
    }
  } catch (e) {
    // ignore storage access issues
  }

  return { ...EMPTY_DATA };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(() => getInitialData());
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [brands, setBrands] = useState<string[]>(initial.brands);
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [priceRanges] = useState<PriceRange[]>(initial.priceRanges);
  const [orders, setOrders] = useState<Order[]>(initial.orders);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => ({ ...DEFAULT_SITE_SETTINGS, ...(readCachedSiteSettings() || {}) }));

  useEffect(() => {
    if (categories.length === 0 && products.length === 0 && brands.length === 0) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('LocalStorage cleanup error:', e);
      }
      return;
    }

    const payload = { categories, brands, products, priceRanges, orders };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [categories, brands, products, priceRanges, orders]);

  const updateSiteSettings = async (updates: Partial<SiteSettings>) => {
    const baseSettings = { ...DEFAULT_SITE_SETTINGS, ...siteSettings };
    const nextState = { ...baseSettings, ...updates };
    const onlyBannerTextUpdate = Object.keys(updates || {}).every((key) => key === 'promo_banner_text');

    if (!onlyBannerTextUpdate && (updates.active_promo === 'none' || updates.is_free_shipping_active === false)) {
      nextState.active_promo = 'none';
      nextState.promo_rule = 'none';
      nextState.is_free_shipping_active = false;
      nextState.promo_banner_text = '';
      nextState.promo_discount_percent = 0;
      nextState.buy_x = 0;
      nextState.get_y = 0;
      nextState.promotion_scope = 'all';
      nextState.free_shipping_threshold = 200;
    }

    const persistedState = getEffectiveSiteSettings(nextState);
    setSiteSettings(persistedState);
    writeCachedSiteSettings(persistedState);

    if (!supabase) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('site_settings')
        .upsert([
          {
            key: 'site_config',
            value: persistedState,
            updated_at: new Date().toISOString(),
          }
        ], { onConflict: 'key' })
        .select()
        .single();

      if (error) {
        console.warn('Site settings update failed:', error.message || error);
        setSiteSettings(persistedState);
        return;
      }

      const nextValue = (data && (data as any).value) || persistedState;
      const merged = getEffectiveSiteSettings(nextValue);
      setSiteSettings(merged);
      writeCachedSiteSettings(merged);
      window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: merged }));
    } catch (error) {
      console.warn('Site settings update exception:', error);
      setSiteSettings(persistedState);
    }
  };

  const applyPromoCommand = async (command: string): Promise<Partial<SiteSettings>> => {
    const parsed = parseSitePromoCommand(command);
    if (!Object.keys(parsed).length) {
      return {};
    }

    await updateSiteSettings(parsed);
    return parsed;
  };

  // Sync initial data from Supabase when available. This runs once after mount.
  const [, setLoading] = useState(true);
  const [, setRemoteError] = useState<string | null>(null);
  // Schema is hard-coded from confirmed live DB columns (see PRODUCT_SCHEMA above).
  // No runtime probing needed — avoids spurious 400 requests on every mount.
  const [schemaInfo] = useState(PRODUCT_SCHEMA);
  // brandsHaveCategory is determined at runtime from the actual brands rows returned by Supabase.
  const [brandsHaveCategory, setBrandsHaveCategory] = useState(false);
  // Use canonical subcategory column name; code expects `subcategory_id` to exist after migration
  const [productSubcategoryColumn, setProductSubcategoryColumn] = useState<string | null>('subcategory_id');
  const didInitialFetchRef = useRef(false);
  const productsRef = useRef(products);
  const productSubcategoryColumnRef = useRef(productSubcategoryColumn);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    productSubcategoryColumnRef.current = productSubcategoryColumn;
  }, [productSubcategoryColumn]);

  useEffect(() => {
    const handleSiteSettingsUpdate = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail || typeof detail !== 'object') return;

      setSiteSettings((prev) => {
        const merged = getEffectiveSiteSettings({ ...prev, ...detail });
        writeCachedSiteSettings(merged);
        return merged;
      });
    };

    window.addEventListener('site-settings-updated', handleSiteSettingsUpdate);
    return () => {
      window.removeEventListener('site-settings-updated', handleSiteSettingsUpdate);
    };
  }, []);

  useEffect(() => {
    if (!supabase || didInitialFetchRef.current) return;
    didInitialFetchRef.current = true;

    let mounted = true;
    const fetchRemote = async () => {
      setLoading(true);
      try {
        const [
          { data: productsData },
          { data: ordersData },
          { data: categoriesData },
          { data: subcategoriesData },
          { data: brandsData },
          { data: settingsData },
        ] = await Promise.all([
          supabase.from('products').select('*'),
          supabase.from('orders').select('*'),
          supabase.from('categories').select('*'),
          supabase.from('subcategories').select('*'),
          supabase.from('brands').select('*'),
          supabase.from('site_settings').select('*').order('updated_at', { ascending: false }).limit(100),
        ]);

        if (!mounted) return;

        const categoriesArray = Array.isArray(categoriesData) ? categoriesData : [];
        const nextCategories = categoriesArray.map((row: any) => mapCategoryRow(row, subcategoriesData || [], brandsData || []));
        const nextBrands = Array.isArray(brandsData)
          ? (brandsData as any[])
              .filter((brand: any) => !brand?.category_id)
              .map((brand: any) => String(brand?.name ?? brand?.label ?? brand?.slug ?? ''))
              .filter(Boolean)
          : [];

        const categoriesById: Record<string, Category> = Object.fromEntries(
          nextCategories.map((category) => [String(category.id), category])
        );
        const categoriesBySlug: Record<string, Category> = {};
        nextCategories.forEach((category) => {
          const label = String(category.label || '').trim();
          if (label) {
            categoriesBySlug[label.toLowerCase()] = category;
            categoriesBySlug[slugify(label).toLowerCase()] = category;
          }
        });

        let detectedColumn: string | null = productSubcategoryColumnRef.current;
        if (Array.isArray(productsData) && productsData.length > 0) {
          const sample = productsData[0] || {};
          const possible = ['subcategory_id', 'sub_category_id', 'subcategory', 'sub_category'];
          const detected = possible.find((k) => Object.prototype.hasOwnProperty.call(sample, k)) ?? null;
          if (!productSubcategoryColumnRef.current) setProductSubcategoryColumn(detected);
          detectedColumn = detected ?? productSubcategoryColumnRef.current;
        }

        let normalizedProducts: Product[] = [];
        if (Array.isArray(productsData) && productsData.length > 0) {
          const subLookup: Record<string, string> = {};
          if (Array.isArray(subcategoriesData)) {
            (subcategoriesData as any[]).forEach((s: any) => {
              const sid = s?.id ? String(s.id) : '';
              const slug = s?.slug ? String(s.slug) : '';
              const name = s?.name ? String(s.name) : '';
              if (sid) subLookup[sid] = sid;
              if (slug) subLookup[slug] = sid || slug;
              if (name) subLookup[name.toLowerCase().trim()] = sid || name.toLowerCase().trim();
              if (slug) subLookup[slug.toLowerCase().trim()] = sid || slug.toLowerCase().trim();
            });
          }

          normalizedProducts = (productsData as any[]).map((r) => {
            let categoryVal: any = r.category_id ?? r.category ?? null;
            if (categoryVal && typeof categoryVal === 'string') {
              const key = categoryVal.trim();
              const mappedCategory = categoriesById[key] ?? categoriesBySlug[key.toLowerCase()];
              if (mappedCategory) {
                categoryVal = mappedCategory.id;
              }
            }

            let subVal: any = null;
            const col = detectedColumn;
            const tryLookup = (v: string | undefined | null) => {
              if (!v) return null;
              const raw = String(v).trim();
              if (!raw) return null;
              if (subLookup[raw]) return String(subLookup[raw]);
              const lower = raw.toLowerCase();
              if (subLookup[lower]) return String(subLookup[lower]);
              return null;
            };

            if (col && Object.prototype.hasOwnProperty.call(r, col) && r[col] !== undefined && r[col] !== null && String(r[col]).trim() !== '') {
              const val = r[col];
              if (/id$/i.test(col)) {
                subVal = String(val);
                const mapped = tryLookup(subVal);
                if (mapped) subVal = mapped;
              } else {
                const candidate = String(val).trim();
                const mapped = tryLookup(candidate) || tryLookup(candidate.toLowerCase());
                subVal = mapped ?? candidate;
              }
            } else if (r.subcategory_id !== undefined && r.subcategory_id !== null && String(r.subcategory_id).trim() !== '') {
              const candidate = String(r.subcategory_id).trim();
              subVal = tryLookup(candidate) || candidate;
            } else if (r.subcategory !== undefined && r.subcategory !== null && String(r.subcategory).trim() !== '') {
              const candidate = String(r.subcategory).trim();
              const mapped = tryLookup(candidate) || tryLookup(candidate.toLowerCase());
              subVal = mapped ?? candidate;
            }

            const bestSellerFlag = Boolean(r.hero ?? (String(r.tag || '').toLowerCase() === 'best seller'));
            const imageValue = resolvePersistedProductImage(r);
            const descriptionValue = r.description ?? r.details ?? r.long_description ?? null;
            const dbSellingPrice = toNumberOrUndefined(r.selling_price);
            const dbMarketPrice = toNumberOrUndefined(r.market_price);
            const dbAdminCost = toNumberOrUndefined(r.admin_cost);
            const dbStock = toNumberOrUndefined(r.stock);
            const normalizedImage = normalizeProductImage(imageValue);

            let persistedSubId: string | null = null;
            if (col && r[col] !== undefined && r[col] !== null && String(r[col]).trim() !== '') {
              if (/id$/i.test(col)) persistedSubId = String(r[col]);
              else {
                const candidate = String(r[col]).trim();
                if (subLookup[candidate]) persistedSubId = String(subLookup[candidate]);
              }
            } else if (r.subcategory_id !== undefined && r.subcategory_id !== null && String(r.subcategory_id).trim() !== '') {
              persistedSubId = String(r.subcategory_id);
            } else if (r.subcategory !== undefined && r.subcategory !== null && isUuid(String(r.subcategory))) {
              persistedSubId = String(r.subcategory);
            }

            return {
              id: r.id ?? Date.now(),
              name: r.name ?? r.label ?? '',
              brand: r.brand ?? r.brand_name ?? '',
              createdAt: r.created_at ?? r.createdAt ?? null,
              category: categoryVal ?? null,
              subcategory: subVal ?? null,
              subcategoryId: persistedSubId ?? null,
              originalPrice: dbMarketPrice ?? null,
              sellingPrice: dbSellingPrice ?? null,
              marketPrice: dbMarketPrice ?? null,
              adminCost: dbAdminCost ?? null,
              stock: dbStock ?? 0,
              isHidden: Boolean(r.is_hidden),
              cost: dbAdminCost ?? null,
              rating: r.rating ?? 0,
              reviews: r.reviews ?? 0,
              skinType: r.skin_type ?? null,
              tag: r.tag ?? (bestSellerFlag ? 'Best Seller' : null),
              hero: r.hero ?? bestSellerFlag,
              image: normalizedImage,
              image_url: normalizedImage,
              description: descriptionValue ?? null,
              details: descriptionValue ?? null,
            } as any;
          });

          setProducts(normalizedProducts as any);
        }

        if (nextCategories.length > 0) {
          setCategories(nextCategories);
        }
        setBrands(nextBrands);

        const detectedBrandsHaveCategory = Array.isArray(brandsData) && (brandsData as any[]).some(b => b && Object.prototype.hasOwnProperty.call(b, 'category_id'));
        setBrandsHaveCategory(detectedBrandsHaveCategory);

        if (Array.isArray(brandsData) && brandsData.length > 0) {
          setCategories(prev => prev.map(cat => ({ ...cat, brands: (brandsData as any[]).filter(b => String(b.category_id) === String(cat.id)).map(b => String(b.name)) } as any)));
        }
        if (Array.isArray(ordersData)) {
          setOrders(ordersData.map((row: any) => {
            const createdAt = row.createdAt ?? row.created_at ?? row.order_date ?? row.date ?? new Date().toISOString();
            const itemsNormalized = normalizeOrderItems(Array.isArray(row.items) ? row.items : [], normalizedProducts.length ? normalizedProducts : productsRef.current);
            const persistedTotal = Number(row.total) || itemsNormalized.reduce((s: number, it: any) => s + Number(it.total_price || 0), 0);
            return {
              ...row,
              createdAt,
              items: itemsNormalized,
              total: persistedTotal,
            };
          }) as any);
        }

        const settingsMap = Array.isArray(settingsData) ? settingsData : [];
        const configRow = settingsMap.find((item: any) => String(item?.key ?? '').toLowerCase() === 'site_config') || settingsMap[0] || null;
        const cachedSettings = readCachedSiteSettings() || {};
        const remoteSettings = ((configRow?.value as Partial<SiteSettings>) || cachedSettings) as Partial<SiteSettings>;
        const mergedSettings = getEffectiveSiteSettings({ ...cachedSettings, ...remoteSettings });
        setSiteSettings(mergedSettings);
        writeCachedSiteSettings(mergedSettings);

        setRemoteError(null);
        setLoading(false);
      } catch (err) {
        console.warn('Supabase sync failed:', err);
        setRemoteError(String(err));
        setLoading(false);
      }
    };

    void fetchRemote();
    return () => { mounted = false; };
  }, []);

  // In-app confirmation modal state and helper
  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; resolve?: (v: boolean) => void }>({ open: false, message: '' });
  const requestConfirm = (message: string) => new Promise<boolean>((resolve) => {
    setConfirmState({ open: true, message, resolve });
  });
  const handleConfirm = () => {
    try { confirmState.resolve?.(true); } catch (e) { /* ignore */ }
    setConfirmState({ open: false, message: '' });
  };
  const handleCancel = () => {
    try { confirmState.resolve?.(false); } catch (e) { /* ignore */ }
    setConfirmState({ open: false, message: '' });
  };

  // Helper to verify admin permissions reliably
  const verifyAdminPermission = async (actionDesc = 'perform this action'): Promise<boolean> => {
    // Authorization must come from the current Supabase session and protected
    // profile fields, never from a serialized client-side session.
    if (supabase) {
      try {
        const { data } = await supabase.auth.getUser();
        const supaUser = (data as any)?.user;
        if (supaUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', supaUser.id)
            .maybeSingle();

          if (profile && (
            String(profile.role || '').toLowerCase() === 'admin' ||
            String(profile.role || '').toLowerCase() === 'superadmin' ||
            profile.is_admin === true
          )) {
            return true;
          }
        }
      } catch (_) {}
    }

    alert(`Admin sign-in required to ${actionDesc}. Please sign in with an admin account.`);
    return false;
  };

  // Categories
  const addCategory = async (cat: Category) => {
    const label = String(cat?.label || '').trim();
    if (!label || !supabase) return;

    // Ensure only real authenticated admins may perform writes
    try {
      const isAllowed = await verifyAdminPermission('create categories');
      if (!isAllowed) return;

      let finalImage = String(cat.image || '').trim();
      if (finalImage && (finalImage.startsWith('data:') || finalImage.startsWith('blob:'))) {
        try {
          const uploaded = await uploadImageIfNeeded(finalImage, 'products', 'categories');
          if (uploaded) finalImage = uploaded;
        } catch (err) {
          console.warn('Category image storage upload failed, keeping inline data:', err);
        }
      }

      const slug = slugify(label);
      const safeId = resolveCategoryIdForInsert(cat?.id);
      const payload: any = { id: safeId, name: label, slug, description: '', metadata: {}, image: finalImage };
      const { data, error } = await supabase.from('categories').insert([payload]).select().single();
      if (error) {
        console.warn('Supabase category insert failed:', error.message || error);
        if ((error as any)?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) {
          const { data: fallback } = await supabase.from('categories').select('*').eq('slug', slug).limit(1).maybeSingle();
          if (fallback && fallback.id) {
            const resolvedCategory: Category = {
              ...cat,
              id: fallback.id,
              label: fallback.name ?? label,
              icon: cat.icon || 'Sparkles',
              color: cat.color ?? '',
              accent: cat.accent ?? '',
              image: fallback.image ? normalizeProductImage(fallback.image) : finalImage,
              subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [{ id: 'all', label: 'All' }],
              brands: Array.isArray(cat.brands) ? cat.brands : [],
            };
            setCategories(prev => [...prev.filter((item) => item.id !== resolvedCategory.id), resolvedCategory]);
            return;
          }
        }
        alert('Failed to create category: ' + (error.message || String(error)));
        return;
      }

      if (!data || !data.id) {
        alert('Failed to create category: Database did not return a valid ID.');
        return;
      }

      const newCategory: Category = {
        ...cat,
        id: data.id,
        label: data.name ?? label,
        icon: cat.icon || 'Sparkles',
        color: cat.color ?? '',
        accent: cat.accent ?? '',
        image: data.image ? normalizeProductImage(data.image) : finalImage,
        subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [{ id: 'all', label: 'All' }],
        brands: Array.isArray(cat.brands) ? cat.brands : [],
      };
      setCategories(prev => [...prev.filter((item) => item.id !== newCategory.id), newCategory]);
    } catch (e: any) {
      console.warn('Supabase category write error:', e?.message || e);
      alert('Failed to create category: ' + (e?.message || String(e)));
    }
  };
  const updateCategory = async (id: string, updates: Partial<Category>) => {
    if (!supabase) return;

    const isAllowed = await verifyAdminPermission('update categories');
    if (!isAllowed) return;

    // Local optimistic update kept until server confirms
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    try {
      const row: any = {};
      if (updates.label !== undefined) {
        row.name = updates.label;
        row.slug = slugify(String(updates.label || ''));
      }
      if (updates.icon !== undefined) row.icon = updates.icon;
      if (updates.color !== undefined) row.color = updates.color;
      if (updates.image !== undefined) {
        let finalImage = String(updates.image || '').trim();
        if (finalImage && (finalImage.startsWith('data:') || finalImage.startsWith('blob:'))) {
          try {
            const uploaded = await uploadImageIfNeeded(finalImage, 'products', 'categories');
            if (uploaded) finalImage = uploaded;
          } catch (err) {
            console.warn('Category image storage upload failed, keeping inline data:', err);
          }
        }
        row.image = finalImage;
        setCategories(prev => prev.map(c => c.id === id ? { ...c, image: finalImage } : c));
      }

      if (Object.keys(row).length === 0) return;

      const effectiveId = await resolveCategoryIdForUpdate(id, categories, supabase);
      const isUuidValue = isUuid(effectiveId);

      let targetQuery = supabase.from('categories').update(row);
      if (isUuidValue) {
        targetQuery = targetQuery.eq('id', effectiveId);
      } else {
        const exactSlug = slugify(String(effectiveId || ''));
        targetQuery = targetQuery.eq('slug', exactSlug).limit(1);
      }

      const { error } = await targetQuery;
      if (error && error.code !== 'PGRST116') {
        console.warn('Supabase category update failed:', error.message || error);
        // revert local change by refetching or leaving as-is; here we log and alert
        alert('Failed to update category: ' + (error.message || String(error)));
      }
    } catch (e: any) {
      if (e?.code !== 'PGRST116') {
        console.warn('Supabase category update error:', e?.message || e);
        alert('Failed to update category: ' + (e?.message || String(e)));
      }
    }
  };
  const deleteCategory = async (id: string) => { await deleteCategoryRemote(id); };

  // Ensure deletes wait for Supabase confirmation before updating local state
  const deleteCategoryRemote = async (id: string) => {
    // Confirm with admin before destructive delete
    try {
      const ok = await requestConfirm('Delete this category and all its sub-items? This cannot be undone.');
      if (!ok) return;
    } catch (e) {
      return;
    }

    const isMissingColumnError = (error: any) => {
      const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
      return /column .* does not exist|does not exist|unknown column/i.test(message);
    };

    const categoryMeta = categories.find((cat) => cat.id === id) ?? null;
    const categoryName = categoryMeta?.label ?? '';
    const categorySlug = categoryName ? slugify(categoryName) : '';
    const categoryBrandNames = categoryMeta && Array.isArray(categoryMeta.brands) ? categoryMeta.brands : [];

    const deletedBrandNamesSet = new Set<string>(categoryBrandNames.map((b) => b.toLowerCase()));

    if (!supabase) {
      // Local fallback mode when Supabase is not configured
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => ({
            ...c,
            brands: Array.isArray(c.brands) ? c.brands.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())) : [],
          }))
      );
      setBrands((prev) => prev.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())));
      setProducts((prev) =>
        prev.filter((p) => {
          const matchesCategoryId = p.category === id;
          const matchesCategoryName = categoryName && p.category === categoryName;
          const matchesCategorySlug = categorySlug && p.category === categorySlug;
          const matchesBrand = p.brand && deletedBrandNamesSet.has(String(p.brand).toLowerCase());
          return !(matchesCategoryId || matchesCategoryName || matchesCategorySlug || matchesBrand);
        })
      );
      return;
    }

    try {
      // 1) Delete products belonging to this category using only columns that actually exist.
      const productMatchers = Array.from(new Set([id, categoryName, categorySlug].filter(Boolean)));

      if (schemaInfo.productsHasCategoryId) {
        const { error: prodErr1 } = await supabase.from('products').delete().eq('category_id', id);
        if (prodErr1 && !isMissingColumnError(prodErr1)) {
          console.warn('Failed to delete products by category_id before deleting category:', prodErr1);
          alert('Failed to delete category products: ' + (prodErr1.message || String(prodErr1)));
          return;
        }
      }

      if (schemaInfo.productsHasCategory) {
        for (const value of productMatchers) {
          const { error: prodErr2 } = await supabase.from('products').delete().eq('category', value);
          if (prodErr2 && !isMissingColumnError(prodErr2)) {
            console.warn('Failed to delete products by category before deleting category:', prodErr2);
            alert('Failed to delete category products: ' + (prodErr2.message || String(prodErr2)));
            return;
          }
        }
      }

      // 2) Delete subcategories for category
      const { error: subErr } = await supabase.from('subcategories').delete().eq('category_id', id);
      if (subErr && !isMissingColumnError(subErr)) {
        console.warn('Failed to delete subcategories for category:', subErr);
        alert('Failed to delete category subcategories: ' + (subErr.message || String(subErr)));
        return;
      }

      // 3) Find all brands associated with this category to ensure explicit deletion
      const associatedBrands: Array<{ id?: string; name?: string; slug?: string }> = [];

      // Query brands by category_id (id or slug)
      try {
        const { data: dbBrands } = await supabase
          .from('brands')
          .select('id, name, slug, category_id')
          .eq('category_id', id);
        if (Array.isArray(dbBrands)) {
          associatedBrands.push(...dbBrands);
        }
      } catch (err) {
        console.debug('Could not select brands by category_id:', err);
      }

      if (categorySlug && categorySlug !== id) {
        try {
          const { data: dbBrandsSlug } = await supabase
            .from('brands')
            .select('id, name, slug, category_id')
            .eq('category_id', categorySlug);
          if (Array.isArray(dbBrandsSlug)) {
            associatedBrands.push(...dbBrandsSlug);
          }
        } catch (_) {}
      }

      // Query brands linked via category_brands junction table
      try {
        const { data: junctionRows } = await supabase
          .from('category_brands')
          .select('brand_id')
          .eq('category_id', id);
        if (Array.isArray(junctionRows) && junctionRows.length > 0) {
          for (const row of junctionRows) {
            if (row?.brand_id) {
              associatedBrands.push({ id: row.brand_id });
            }
          }
        }
      } catch (_) {
        // junction table might not exist
      }

      // Also collect brands matching categoryMeta.brands
      for (const bName of categoryBrandNames) {
        if (!associatedBrands.some((b) => String(b.name || '').toLowerCase() === bName.toLowerCase())) {
          try {
            const { data: found } = await supabase
              .from('brands')
              .select('id, name, slug')
              .eq('name', bName)
              .limit(1)
              .maybeSingle();
            if (found) {
              associatedBrands.push(found);
            } else {
              associatedBrands.push({ name: bName, slug: slugify(bName) });
            }
          } catch (_) {
            associatedBrands.push({ name: bName, slug: slugify(bName) });
          }
        }
      }

      // Populate deletedBrandNamesSet with all names, slugs, and IDs
      associatedBrands.forEach((b) => {
        if (b.name) deletedBrandNamesSet.add(b.name.toLowerCase());
        if (b.slug) deletedBrandNamesSet.add(b.slug.toLowerCase());
        if (b.id) deletedBrandNamesSet.add(String(b.id).toLowerCase());
      });

      // 4) Clean up category_brands junction table for this category and associated brands
      try {
        await supabase.from('category_brands').delete().eq('category_id', id);
      } catch (_) {}

      for (const brand of associatedBrands) {
        if (brand.id) {
          try {
            await supabase.from('category_brands').delete().eq('brand_id', brand.id);
          } catch (_) {}
        }
      }

      // 5) Explicitly delete all associated brands from the `brands` table in Supabase
      // First: delete by category_id directly
      const { error: brandErr } = await supabase.from('brands').delete().eq('category_id', id);
      if (brandErr && !isMissingColumnError(brandErr)) {
        console.warn('Failed to delete brands by category_id:', brandErr);
      }
      if (categorySlug && categorySlug !== id) {
        try {
          await supabase.from('brands').delete().eq('category_id', categorySlug);
        } catch (_) {}
      }

      // Next: delete each associated brand by id or name
      for (const brand of associatedBrands) {
        if (brand.id) {
          const { error: delByIdErr } = await supabase.from('brands').delete().eq('id', brand.id);
          if (delByIdErr && !isMissingColumnError(delByIdErr)) {
            console.warn('Failed to delete brand by id:', brand.id, delByIdErr);
          }
        } else if (brand.name) {
          const { error: delByNameErr } = await supabase.from('brands').delete().eq('name', brand.name);
          if (delByNameErr && !isMissingColumnError(delByNameErr)) {
            console.warn('Failed to delete brand by name:', brand.name, delByNameErr);
          }
        }
      }

      // 6) Delete the category row itself
      const { error: catErr } = await supabase.from('categories').delete().eq('id', id);
      if (catErr) {
        console.warn('Supabase category delete failed:', catErr);
        alert('Failed to delete category: ' + (catErr.message || String(catErr)));
        return;
      }

      // 7) Update local state immediately after successful database deletion
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== id)
          .map((c) => ({
            ...c,
            brands: Array.isArray(c.brands) ? c.brands.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())) : [],
          }))
      );
      setBrands((prev) => prev.filter((b) => !deletedBrandNamesSet.has(b.toLowerCase())));
      setProducts((prev) =>
        prev.filter((p) => {
          const matchesCategoryId = p.category === id;
          const matchesCategoryName = categoryName && p.category === categoryName;
          const matchesCategorySlug = categorySlug && p.category === categorySlug;
          const matchesBrand = p.brand && deletedBrandNamesSet.has(String(p.brand).toLowerCase());
          return !(matchesCategoryId || matchesCategoryName || matchesCategorySlug || matchesBrand);
        })
      );
    } catch (e: any) {
      console.warn('Supabase category delete error:', e?.message || e);
      alert('Failed to delete category: ' + (e?.message || String(e)));
    }
  };

  // Subcategories
  const addSubcategory = async (categoryId: string, sub: CategorySubcategory) => {
    const label = String(sub?.label || '').trim();
    if (!label || !supabase) return;

    try {
      const isAllowed = await verifyAdminPermission('create subcategories');
      if (!isAllowed) return;

      // ── Step 1: Resolve category_id to a confirmed-live UUID ──────────────────
      // resolveCategoryIdForRelation:
      //   • if input is already a UUID → checks local state first (no network),
      //     then queries the DB to confirm the row exists before returning it
      //   • if input is a slug/name → resolves via local state or DB query
      //   • returns null if nothing resolves to a real, existing category row
      const resolvedCategoryId = await resolveCategoryIdForRelation(categoryId, categories, supabase);

      if (!resolvedCategoryId || !isUuid(resolvedCategoryId)) {
        console.error('addSubcategory: could not resolve a valid category UUID', { categoryId, resolvedCategoryId });
        alert(
          `Cannot add subcategory: the parent category could not be found in the database.\n\n` +
          `Value received: "${categoryId}"\n` +
          `Resolved to: "${resolvedCategoryId ?? 'null'}"\n\n` +
          `Ensure the parent category has been saved to Supabase before adding subcategories.`
        );
        return;
      }

      // Proactively ensure the parent category exists in Supabase so foreign key constraints are met
      const localCategory = categories.find((c) => c.id === resolvedCategoryId || c.id === categoryId);
      if (localCategory) {
        const catSlug = slugify(localCategory.label || localCategory.id);
        try {
          await supabase.from('categories').upsert(
            [
              {
                id: resolvedCategoryId,
                name: localCategory.label || 'Category',
                label: localCategory.label || 'Category',
                slug: catSlug,
                icon: localCategory.icon || 'Sparkles',
                color: localCategory.color || '',
                accent: localCategory.accent || '',
              },
            ],
            { onConflict: 'id' }
          );
        } catch (catUpsertErr) {
          console.warn('Parent category ensure-upsert notice:', catUpsertErr);
        }
      }

      // ── Step 2: Idempotency — check if this subcategory already exists ────────
      const slug = slugify(label);
      console.debug('addSubcategory: resolved', { input: categoryId, resolved: resolvedCategoryId, slug });

      const { data: existing, error: existingErr } = await supabase
        .from('subcategories')
        .select('*')
        .eq('category_id', resolvedCategoryId)
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        console.warn('addSubcategory: duplicate-check query failed (non-fatal, proceeding to insert):', existingErr);
      }

      if (existing) {
        // Already exists — sync local state and return without inserting
        const inbound = { id: String(existing.id), label: existing.name ?? label };
        setCategories(prev => prev.map(c => {
          if (c.id !== resolvedCategoryId) return c;
          const arr = Array.isArray(c.subcategories) ? c.subcategories : [];
          return { ...c, subcategories: arr.some(s => s.id === inbound.id) ? arr : [...arr, inbound] } as any;
        }));
        return existing as any;
      }

      // ── Step 3: Insert with a guaranteed-UUID category_id ────────────────────
      const payload: Record<string, unknown> = {
        id: createUuid(),
        category_id: resolvedCategoryId,   // ← always a UUID confirmed to exist in DB
        name: label,
        slug,
        description: '',
        metadata: {},
      };
      console.debug('addSubcategory: inserting payload', payload);

      const insertRes = await supabase.from('subcategories').insert([payload]).select().single();
      console.debug('addSubcategory: insert response', { data: insertRes.data, error: insertRes.error });

      if (insertRes.error) {
        // Race-condition duplicate: another request inserted the same slug concurrently
        if (
          (insertRes.error as any)?.code === '23505' ||
          String(insertRes.error?.message ?? '').toLowerCase().includes('duplicate')
        ) {
          const { data: fallback } = await supabase
            .from('subcategories')
            .select('*')
            .eq('category_id', resolvedCategoryId)
            .eq('slug', slug)
            .limit(1)
            .maybeSingle();
          if (fallback) {
            const inbound = { id: String(fallback.id), label: fallback.name ?? label };
            setCategories(prev => prev.map(c => {
              if (c.id !== resolvedCategoryId) return c;
              const arr = Array.isArray(c.subcategories) ? c.subcategories : [];
              return { ...c, subcategories: arr.some(s => s.id === inbound.id) ? arr : [...arr, inbound] } as any;
            }));
            return fallback as any;
          }
        }
        console.error('addSubcategory: insert failed', insertRes.error);
        alert('Failed to create subcategory: ' + (insertRes.error.message || String(insertRes.error)));
        return;
      }

      // ── Step 4: Sync confirmed row into local state ───────────────────────────
      const created = insertRes.data as any;
      if (!created?.id) {
        // Supabase returned no row — verify by refetching
        const { data: verify } = await supabase
          .from('subcategories')
          .select('*')
          .eq('category_id', resolvedCategoryId)
          .eq('slug', slug)
          .limit(1)
          .maybeSingle();
        if (!verify) {
          alert('Subcategory insert did not return a valid row. Check Supabase RLS policies.');
          return;
        }
        const inbound = { id: String(verify.id), label: verify.name ?? label };
        setCategories(prev => prev.map(c => {
          if (c.id !== resolvedCategoryId) return c;
          const arr = (Array.isArray(c.subcategories) ? c.subcategories : []).filter(s => s.id !== inbound.id);
          return { ...c, subcategories: [...arr, inbound] } as any;
        }));
        return verify as any;
      }

      const inbound = { id: String(created.id), label: created.name ?? label };
      setCategories(prev => prev.map(c => {
        if (c.id !== resolvedCategoryId) return c;
        const arr = (Array.isArray(c.subcategories) ? c.subcategories : []).filter(s => s.id !== inbound.id);
        return { ...c, subcategories: [...arr, inbound] } as any;
      }));
      return created as any;

    } catch (e: any) {
      console.error('addSubcategory: unexpected error', e);
      alert('Failed to create subcategory: ' + (e?.message || String(e)));
    }
  };

  const updateSubcategory = async (categoryId: string, subId: string, updates: Partial<CategorySubcategory>) => {
    if (!supabase) return;

    const isAllowed = await verifyAdminPermission('update subcategories');
    if (!isAllowed) return;

    // Optimistic local update
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      return { ...c, subcategories: c.subcategories.map(s => s.id === subId ? { ...s, ...updates } : s) } as any;
    }));

    try {
      const row: any = {};
      if (updates.label !== undefined) {
        row.name = updates.label;
        row.slug = slugify(String(updates.label || ''));
      }
      if (Object.keys(row).length === 0) return;
      const isSubUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId);
      let subQuery = supabase.from('subcategories').update(row);
      if (isSubUuid) {
        subQuery = subQuery.eq('id', subId);
      } else {
        subQuery = subQuery.or(`slug.eq.${subId},name.eq.${subId}`);
      }
      const { error } = await subQuery;
      if (error && error.code !== 'PGRST116') {
        console.warn('Supabase subcategory update failed:', error.message || error);
        alert('Failed to update subcategory: ' + (error.message || String(error)));
      }
    } catch (e: any) {
      if (e?.code !== 'PGRST116') {
        console.warn('Supabase subcategory update error:', e?.message || e);
        alert('Failed to update subcategory: ' + (e?.message || String(e)));
      }
    }
  };

  // Delete a subcategory only after Supabase confirms deletion
  const deleteSubcategory = async (categoryId: string, subId: string) => {
    if (!supabase) return;
    try {
      const ok = await requestConfirm('Delete this subcategory? This cannot be undone.');
      if (!ok) return;
      
      // 1) Delete products in DB that reference this subcategory
      // Delete products referencing this subcategory using the exact detected column when possible
      if (productSubcategoryColumn) {
        try {
          const { error: pErr } = await supabase.from('products').delete().eq(productSubcategoryColumn, subId);
          if (pErr) {
            console.warn(`Failed to delete products by ${productSubcategoryColumn}:`, pErr);
            alert('Failed to delete subcategory products: ' + (pErr.message || String(pErr)));
            return;
          }
        } catch (e) {
          console.debug('Error deleting products by detected subcategory column:', e);
          return;
        }
      } else {
        if (schemaInfo.productsHasSubcategoryId) {
          const { error: pErr } = await supabase.from('products').delete().eq('subcategory_id', subId);
          if (pErr) {
            console.warn('Failed to delete products by subcategory_id:', pErr);
            alert('Failed to delete subcategory products: ' + (pErr.message || String(pErr)));
            return;
          }
        }
        if (schemaInfo.productsHasSubcategory) {
          const { error: pErr2 } = await supabase.from('products').delete().eq('subcategory', subId);
          if (pErr2) {
            console.warn('Failed to delete products by subcategory:', pErr2);
            alert('Failed to delete subcategory products: ' + (pErr2.message || String(pErr2)));
            return;
          }
        }
      }

      // 2) Delete subcategory row
      const { error } = await supabase.from('subcategories').delete().eq('id', subId);
      if (error) {
        console.warn('Supabase subcategory delete failed:', error);
        alert('Failed to delete subcategory: ' + (error.message || String(error)));
        return;
      }

      // 3) Update local state
      setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, subcategories: c.subcategories.filter(s => s.id !== subId) } : c ));
      setProducts(prev => prev.filter(p => !(p.category === categoryId && p.subcategoryId === subId)));
    } catch (e: any) {
      console.warn('Supabase subcategory delete error:', e?.message || e);
      alert('Failed to delete subcategory: ' + (e?.message || String(e)));
    }
  };

  // Brands
  const addBrand = async (name: string, categoryId?: string, logo?: string) => {
    const clean = String(name || '').trim();
    if (!clean || !supabase) return;

    try {
      const isAllowed = await verifyAdminPermission('create brands');
      if (!isAllowed) return;

      const resolvedCategoryId = categoryId ? await resolveCategoryIdForRelation(categoryId, categories, supabase) : null;
      if (categoryId && (!resolvedCategoryId || !isUuid(resolvedCategoryId))) {
        alert('Could not resolve the parent category ID. Please choose a valid category before adding a brand.');
        return;
      }

      // Use normalized slug for lookups
      const slug = slugify(clean);
      const hasCategoryId = brandsHaveCategory;

      // Check for existing brand (avoid duplicates). If brands are scoped by category, check within that category.
      let existingQuery = supabase.from('brands').select('*').eq('slug', slug).limit(1);
      if (hasCategoryId && resolvedCategoryId) existingQuery = existingQuery.eq('category_id', resolvedCategoryId);
      const { data: existing } = await existingQuery;
      if (Array.isArray(existing) && existing.length > 0 && existing[0]) {
        const row = existing[0] as any;
        const brandName = row.name ?? clean;

        if (hasCategoryId && row?.category_id) {
          // Category-scoped brand: attach only to the owning category locally
          setCategories(prev => prev.map(c => {
            if (c.id !== String(row.category_id)) return c;
            const existingBrands = Array.isArray(c.brands) ? c.brands : [];
            const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (existsInCategory) return c;
            return { ...c, brands: [...existingBrands, brandName] };
          }));
        } else if (hasCategoryId && categoryId) {
          // brands table supports category_id but the existing row lacked it; attach to provided categoryId and
          // also keep it in global list
          setBrands(prev => {
            const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (exists) return prev;
            return [...prev, brandName];
          });
          setCategories(prev => prev.map(c => {
            if (c.id !== categoryId) return c;
            const existingBrands = Array.isArray(c.brands) ? c.brands : [];
            const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (existsInCategory) return c;
            return { ...c, brands: [...existingBrands, brandName] };
          }));
        } else {
          // Global brands: add to global list and to all categories' brand lists
          setBrands(prev => {
            const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
            if (exists) return prev;
            return [...prev, brandName];
          });
          setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
        }

        return existing[0] as any;
      }

      // Not found — insert. Always generate a real UUID to avoid null-id database errors.
      const payload: any = {
        id: createUuid(),
        name: clean,
        slug,
        description: '',
        metadata: {},
      };

      if (logo) {
        const uploadedLogo = await uploadImageIfNeeded(logo, 'products', 'brands');
        if (uploadedLogo) payload.logo = uploadedLogo;
      }

      // If caller provided a categoryId, prefer to persist it into `category_id` so the brand is scoped.
      // Attempt to resolve the category id first; include it in the payload and fall back if the DB rejects.
      if (resolvedCategoryId) {
        payload.category_id = String(resolvedCategoryId);
      }

      // Do not use slug/text values as the id. A generated UUID is required to satisfy the DB schema.

      // Try inserting including `category_id` when provided. If the insert fails due to a missing column,
      // retry without `category_id` to preserve compatibility with older schemas.
      let insertRes: any;
      try {
        insertRes = await supabase.from('brands').insert([payload]).select().single();
      } catch (err) {
        // SDK-level error, attempt fallback
        insertRes = { error: err };
      }
      let data = insertRes.data;
      let error = insertRes.error;
      if (error) {
        // If the DB rejected `category_id` (column doesn't exist), retry without it
        const msg = String(error?.message || error || '').toLowerCase();
        if ((msg.includes('column') && msg.includes('category_id')) || (error?.code === '42703')) {
          const fallback = { ...payload };
          delete fallback.category_id;
          try {
            const res2 = await supabase.from('brands').insert([fallback]).select().single();
            data = res2.data;
            error = res2.error;
          } catch (err2) {
            data = null;
            error = err2;
          }
        }
      }
      if (error) {
        console.warn('Supabase brand insert failed:', error.message || error);
        if ((error as any)?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) {
          // Conflict: brand already exists (race). Try to fetch the existing row deterministically.
          const { data: fallback } = await supabase.from('brands').select('*').eq('slug', slug).limit(1).maybeSingle();
          if (fallback) {
            const brandName = (fallback as any).name ?? clean;
            const existingBrandId = (fallback as any).id ?? null;
            const existingBrandCategory = (fallback as any).category_id ?? null;

            // If caller provided a categoryId and the DB supports category scoping, try to attach the existing brand
            // to that category. Prefer updating the brands row to set category_id; if that fails (missing column),
            // try creating a category_brands junction row.
            if (resolvedCategoryId) {
              const desiredCatId = String(resolvedCategoryId);
              if (existingBrandCategory && String(existingBrandCategory) === desiredCatId) {
                // already scoped correctly
                setCategories(prev => prev.map(c => {
                  if (String(c.id) !== desiredCatId) return c;
                  const existingBrands = Array.isArray(c.brands) ? c.brands : [];
                  const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
                  if (existsInCategory) return c;
                  return { ...c, brands: [...existingBrands, brandName] };
                }));
              } else if (existingBrandId) {
                // Try to update brands.category_id when possible
                try {
                  const { error: updErr } = await supabase.from('brands').update({ category_id: desiredCatId }).eq('id', existingBrandId);
                  if (!updErr) {
                    setCategories(prev => prev.map(c => {
                      if (String(c.id) !== desiredCatId) return c;
                      const existingBrands = Array.isArray(c.brands) ? c.brands : [];
                      const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
                      if (existsInCategory) return c;
                      return { ...c, brands: [...existingBrands, brandName] };
                    }));
                    // Also remove from global list if present
                    setBrands(prev => prev.filter(b => String(b).toLowerCase() !== brandName.toLowerCase()));
                    return fallback as any;
                  }
                } catch (err) {
                  // ignore update failure and fall back to junction table
                }

                // Try junction table fallback
                try {
                  await supabase.from('category_brands').insert([{ category_id: desiredCatId, brand_id: existingBrandId }]);
                  setCategories(prev => prev.map(c => {
                    if (String(c.id) !== desiredCatId) return c;
                    const existingBrands = Array.isArray(c.brands) ? c.brands : [];
                    const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
                    if (existsInCategory) return c;
                    return { ...c, brands: [...existingBrands, brandName] };
                  }));
                  setBrands(prev => prev.filter(b => String(b).toLowerCase() !== brandName.toLowerCase()));
                  return fallback as any;
                } catch (_) {
                  // if fallback fails, continue to global attach below
                }
              }
            }

            // Default: attach as global brand (no category scope)
            setBrands(prev => (prev.some(b => b.toLowerCase() === brandName.toLowerCase()) ? prev : [...prev, brandName]));
            setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
            return fallback as any;
          }
        }
        alert('Failed to create brand: ' + (error.message || String(error)));
        return;
      }

      const brandName = data?.name ?? clean;
      // Determine an effective category scope: prefer the DB-returned `category_id`, fall back to the caller-provided `categoryId`.
      const insertedCategoryId = (data && data.category_id) ? String(data.category_id) : null;
      const effectiveCategoryId = insertedCategoryId ?? (resolvedCategoryId ? String(resolvedCategoryId) : null);

      if (effectiveCategoryId) {
        // Attach the new brand only to the effective category locally (do not make it global)
        setCategories(prev => prev.map(c => {
          if (String(c.id) !== String(effectiveCategoryId)) return c;
          const existingBrands = Array.isArray(c.brands) ? c.brands : [];
          const existsInCategory = existingBrands.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (existsInCategory) return c;
          return { ...c, brands: [...existingBrands, brandName] };
        }));
      } else {
        // No category scope — treat as global brand
        setBrands(prev => {
          const exists = prev.some(b => String(b).toLowerCase() === brandName.toLowerCase());
          if (exists) return prev;
          return [...prev, brandName];
        });
        setCategories(prev => prev.map(c => ({ ...c, brands: Array.from(new Set([...(c.brands || []), brandName])) } as any)));
      }

      return data as any;
    } catch (e: any) {
      console.warn('Supabase brand write error:', e?.message || e);
      alert('Failed to create brand: ' + (e?.message || String(e)));
    }
  };

    const sanitizeProductPayload = (input: Record<string, any>) => {
      const allowed = new Set([
      'id',
      'name',
      'brand',
      'brand_id',
      'category',
      'category_id',
        'subcategory',
        'subcategory_id',
      'selling_price',
      'market_price',
      'admin_cost',
      'image',
      'images',
      'description',
      'tag',
      'hero',
              'is_hidden',
      'created_at',
      'updated_at',
    ]);

      // Allow the exact detected subcategory DB column name (e.g., 'sub_category_id')
      if (productSubcategoryColumn) {
        allowed.add(productSubcategoryColumn);
      }

    const cleaned: Record<string, any> = {};
    Object.keys(input || {}).forEach((key) => {
      if (allowed.has(key) && input[key] !== undefined && input[key] !== null) {
        cleaned[key] = input[key];
      }
    });

    // The live schema uses: selling_price, market_price, admin_cost, image, images, description.
    // The `price` column has been removed from the database.
    const unsupported = ['price', 'rating', 'reviews', 'original_price', 'skin_type', 'general_price', 'cost', 'store', 'image_url', 'imageUrl', 'title', 'is_best_seller', 'details', 'long_description'];
    unsupported.forEach((key) => delete cleaned[key]);

    return cleaned;
  };

  const mapProductUpdatesToRow = (updates: Partial<Product>) => {
    const row: Record<string, any> = {};

    if (updates.name !== undefined) row.name = updates.name;
    if (updates.brand !== undefined) {
      if (schemaInfo.productsHasBrandId) row.brand_id = updates.brand;
      else row.brand = updates.brand;
    }
    if (updates.category !== undefined) {
      if (schemaInfo.productsHasCategoryId) row.category_id = updates.category;
      else row.category = updates.category;
    }
    if (updates.subcategory !== undefined) {
      // Respect the exact DB column name for subcategory if detected, else fall back to schemaInfo
      if (productSubcategoryColumn) {
        // write to the exact column name
        row[productSubcategoryColumn] = updates.subcategory;
      } else if (schemaInfo.productsHasSubcategoryId) {
        row.subcategory_id = updates.subcategory;
      } else {
        row.subcategory = updates.subcategory;
      }
    }
    const rawSelling = toNumberOrUndefined((updates as any).sellingPrice);
    const rawMarket = toNumberOrUndefined((updates as any).marketPrice ?? (updates as any).originalPrice);
    if (rawSelling !== undefined) row.selling_price = rawSelling;
    if (rawMarket !== undefined) row.market_price = rawMarket;
    if (updates.tag !== undefined) row.tag = updates.tag;
    if (updates.hero !== undefined) row.hero = updates.hero;
    if (updates.isHidden !== undefined) row.is_hidden = Boolean(updates.isHidden);

    // Map cost if provided (from form.adminCost or updates.cost), using the actual DB column name.
    const rawCost = toNumberOrUndefined((updates as any).adminCost ?? (updates as any).cost);
    if (rawCost !== undefined) {
      row.admin_cost = rawCost;
    }

    const nextImage = (updates as any).image_url ?? (updates as any).image ?? updates.image;
    if ((updates as any).image_url !== undefined || updates.image !== undefined) {
      row.image = normalizeProductImage(nextImage) || null;
      if (row.image) {
        row.images = [row.image];
      } else {
        delete row.images;
      }
    }
    const nextDescription = (updates as any).description ?? (updates as any).details ?? updates.description;
    if ((updates as any).description !== undefined || (updates as any).details !== undefined) row.description = nextDescription;

    row.updated_at = new Date().toISOString();
    return sanitizeProductPayload(row);
  };

  const addProduct = async (prod: Product): Promise<number> => {
    const tempId = Date.now();
    if (!supabase) return tempId;

    try {
      const isAllowed = await verifyAdminPermission('create products');
      if (!isAllowed) return tempId;

      // Prepare payload based on discovered schema (do not probe per-call)
      // Build a strict allowlist to avoid sending stale or unsupported columns to Supabase.
      const payload: any = {};
      payload.name = prod.name;
      const imageValue = (prod as any).image_url ?? (prod as any).image ?? null;
      const descriptionValue = (prod as any).description ?? (prod as any).details ?? null;

      if (schemaInfo.productsHasBrandId) {
        let brandId: any = null;
        if (prod.brand) {
          const created = await addBrand(prod.brand, prod.category || undefined);
          if (created && (created as any).id) brandId = (created as any).id;
          else {
            const slug = slugify(prod.brand || '');
            const { data: found } = await supabase.from('brands').select('id').eq('slug', slug).limit(1).maybeSingle();
            if (found && (found as any).id) brandId = (found as any).id;
          }
        }
        if (brandId) payload.brand_id = brandId;
      } else if (schemaInfo.productsHasBrand) {
        payload.brand = prod.brand ?? null;
      }

      if (schemaInfo.productsHasCategoryId) payload.category_id = prod.category ?? null;
      else if (schemaInfo.productsHasCategory) payload.category = prod.category ?? null;

      // Determine exact subcategory DB value and require a canonical id when persisting
      if (productSubcategoryColumn && /id$/i.test(String(productSubcategoryColumn))) {
        let subId: any = null;
        if (prod.subcategory) {
          if (isUuid(String(prod.subcategory))) subId = String(prod.subcategory);
          else {
            try {
              const { data: found } = await supabase.from('subcategories').select('id').or(`slug.eq.${String(prod.subcategory)},name.eq.${String(prod.subcategory)}`).limit(1).maybeSingle();
              if (found && found.id) subId = String(found.id);
            } catch (e) {
              // ignore resolution errors
            }
          }
        }

        // If caller provided a subcategory value but we couldn't resolve it to an id, fail explicitly
        if (prod.subcategory && !subId) {
          alert('Failed to persist product: selected subcategory could not be resolved to an id. Ensure the subcategory exists in the database.');
          return tempId;
        }

        payload[productSubcategoryColumn] = subId ?? null;
      } else if (schemaInfo.productsHasSubcategory) {
        // legacy fallback (should not be used once migration is applied)
        payload.subcategory = prod.subcategory ?? null;
      }

      const parsedSell = toNumberOrUndefined((prod as any).sellingPrice);
      const parsedMarket = toNumberOrUndefined((prod as any).marketPrice ?? (prod as any).originalPrice);
      const parsedAdmin = toNumberOrUndefined((prod as any).adminCost ?? (prod as any).cost);

      if (parsedSell !== undefined) payload.selling_price = parsedSell;
      if (parsedMarket !== undefined) payload.market_price = parsedMarket;

      let finalImage: string | null = null;
      try {
        finalImage = await uploadImageIfNeeded(imageValue ?? prod.image ?? null);
      } catch (e) {
        console.warn('uploadImageIfNeeded failed for addProduct:', e);
      }
      const finalImageUrl = finalImage || normalizeProductImage(imageValue ?? prod.image ?? null) || null;
      payload.image = finalImageUrl;
      if (finalImageUrl) payload.images = [finalImageUrl];

      payload.description = descriptionValue ?? prod.description ?? null;

      // Map adminCost to the actual product column in the live schema.
      if (parsedAdmin !== undefined) payload.admin_cost = parsedAdmin;
      if (prod.stock !== undefined) payload.stock = Math.max(0, Math.floor(Number(prod.stock) || 0));
      if (prod.isHidden !== undefined) payload.is_hidden = Boolean(prod.isHidden);

      if (prod.hero !== undefined) payload.hero = prod.hero;
      payload.created_at = new Date().toISOString();
      payload.updated_at = new Date().toISOString();

      const cleanPayload = sanitizeProductPayload(payload);
      try {
        console.debug('DataContext:addProduct payload', cleanPayload);
      } catch (e) {}

      let remoteData: any = null;
      const { data, error } = await supabase.from('products').insert([cleanPayload]).select().single();
      if (error) {
        console.warn('Supabase product insert failed:', error.message || error);
        alert('Failed to create product: ' + (error.message || String(error)));
        return tempId;
      }
      remoteData = data;

      // Map returned row into app Product shape
      const returned = remoteData as any;
      const persistedImage = resolvePersistedProductImage(returned) ?? returned.image ?? null;
      const dbSellingPrice = toNumberOrUndefined(returned.selling_price);
      const dbMarketPrice = toNumberOrUndefined(returned.market_price);
      const dbAdminCost = toNumberOrUndefined(returned.admin_cost);
      const dbStock = toNumberOrUndefined(returned.stock);
      // Derive persisted subcategory id from returned row when available
      let returnedSubId: string | null = null;
      if (productSubcategoryColumn && returned[productSubcategoryColumn] !== undefined && returned[productSubcategoryColumn] !== null && String(returned[productSubcategoryColumn]).trim() !== '') {
        if (/id$/i.test(productSubcategoryColumn)) returnedSubId = String(returned[productSubcategoryColumn]);
        else {
          const cand = String(returned[productSubcategoryColumn]).trim();
          returnedSubId = cand && isUuid(cand) ? cand : null;
        }
      } else if (returned.subcategory_id !== undefined && returned.subcategory_id !== null && String(returned.subcategory_id).trim() !== '') {
        returnedSubId = String(returned.subcategory_id);
      } else if (returned.subcategory !== undefined && returned.subcategory !== null && isUuid(String(returned.subcategory))) {
        returnedSubId = String(returned.subcategory);
      }

      const inserted: Product = {
        id: returned.id ?? Date.now(),
        name: returned.name ?? '',
        brand: (schemaInfo.productsHasBrandId ? (returned.brand_id ?? returned.brand) : returned.brand) ?? prod.brand ?? '',
        category: (schemaInfo.productsHasCategoryId ? (returned.category_id ?? returned.category) : returned.category) ?? prod.category ?? null,
        subcategory: (schemaInfo.productsHasSubcategoryId
          ? (returned.subcategory_id !== undefined && returned.subcategory_id !== null ? String(returned.subcategory_id) : (returned.subcategory !== undefined && returned.subcategory !== null ? String(returned.subcategory) : null))
          : (returned.subcategory !== undefined && returned.subcategory !== null ? String(returned.subcategory) : null)) ?? (prod.subcategory !== undefined && prod.subcategory !== null ? String(prod.subcategory) : null),
        subcategoryId: returnedSubId ?? null,
        createdAt: returned.created_at ?? returned.createdAt ?? null,
        originalPrice: dbMarketPrice ?? null,
        sellingPrice: dbSellingPrice ?? null,
        marketPrice: dbMarketPrice ?? null,
        adminCost: dbAdminCost ?? null,
        stock: dbStock ?? 0,
        isHidden: Boolean(returned.is_hidden),
        cost: dbAdminCost ?? null,
        rating: returned.rating ?? 0,
        reviews: returned.reviews ?? 0,
        skinType: returned.skin_type ?? null,
        tag: returned.tag ?? null,
        hero: returned.hero ?? false,
        image: normalizeProductImage(persistedImage),
        description: returned.description ?? null,
      } as any;

      setProducts(prev => [inserted, ...prev.filter(p => p.id !== inserted.id)]);
      return inserted.id;
    } catch (e: any) {
      console.warn('Supabase product write error:', e?.message || e);
      alert('Failed to create product: ' + (e?.message || String(e)));
      return tempId;
    }
  };
  const updateProduct = (id: number, updates: Partial<Product>) => {
    // send mapped update to remote
    void (async () => {
      try {
        if (!supabase) return;

        const isAllowed = await verifyAdminPermission('update products');
        if (!isAllowed) return;

        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

        // Prepare updates for mapping. If the DB expects a subcategory_id, resolve
        // any incoming subcategory value (slug/name) to the canonical id first.
        const updatesForMapping: Partial<Product> = { ...updates };
        if (schemaInfo.productsHasSubcategoryId && (updatesForMapping as any).subcategory !== undefined && (updatesForMapping as any).subcategory !== null) {
          const rawSub = String((updatesForMapping as any).subcategory);
          if (!isUuid(rawSub)) {
            try {
              const resolved = await resolveSubcategoryId(rawSub);
              if (resolved) (updatesForMapping as any).subcategory = resolved;
              else {
                alert('Failed to update product: provided subcategory could not be resolved to an id.');
                return;
              }
            } catch (e) {
              alert('Failed to update product: could not resolve subcategory.');
              return;
            }
          }
        }

        const row = mapProductUpdatesToRow(updatesForMapping);
        if (Object.keys(row).length === 0) return;

        // If image update is a data/blob URL, upload it first to obtain a persistent public URL
        if ((updates as any).image !== undefined && typeof (updates as any).image === 'string') {
          const imgVal = (updates as any).image;
          if (imgVal.startsWith('data:') || imgVal.startsWith('blob:') || (!/^https?:\/\//i.test(imgVal) && !imgVal.startsWith('/'))) {
            try {
              const uploaded = await uploadImageIfNeeded(imgVal);
              if (uploaded) {
                row.image = uploaded;
                row.images = [uploaded];
              } else {
                delete row.image;
                delete row.images;
              }
            } catch (e) {
              console.warn('Failed to upload image during product update:', e);
              delete row.image;
              delete row.images;
            }
          }
        }

        const { error } = await supabase.from('products').update(row).eq('id', id).select().single();
        if (error) {
          if (isMissingColumnError(error)) {
            console.warn('Supabase product update failed because the live DB schema is missing a column:', error.message || error);
            return;
          }
          if (isPermissionDeniedOrRlsError(error)) {
            console.warn('Supabase product update was blocked by admin auth or row-level security:', error.message || error);
            alert('Failed to update product: admin access or the products RLS policy denied the change. Verify the admin session and the products update policy.');
            return;
          }
          console.warn('Supabase product update failed:', error.message || error);
          alert('Failed to update product: ' + (error.message || String(error)));
          return;
        }

        if (updates.hero !== undefined) {
          await persistBestSellerFlag(id, Boolean(updates.hero));
        }
      } catch (e: any) {
        console.warn('Supabase product update error:', e?.message || e);
        alert('Failed to update product: ' + (e?.message || String(e)));
      }
    })();
  };
  const deleteProduct = async (id: number) => {
    if (!supabase) return;
    try {
      const ok = await requestConfirm('Delete this product? This action cannot be undone.');
      if (!ok) return;
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        console.warn('Supabase product delete failed:', error.message || error);
        alert('Failed to delete product: ' + (error.message || String(error)));
        return;
      }
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      console.warn('Supabase product delete error:', e?.message || e);
      alert('Failed to delete product: ' + (e?.message || String(e)));
    }
  };

  // Admin-only: clear core tables while preserving admin profiles
  const adminClearDatabase = async () => {
    if (!supabase) return;
    try {
      const isAllowed = await verifyAdminPermission('reset database');
      if (!isAllowed) return;

      // WARNING: The following deletes are destructive. They remove ALL rows from the listed tables.
      const ok = await requestConfirm('WARNING: This will permanently clear core tables (products, orders, brands, subcategories, categories) and remove non-admin profiles. Proceed?');
      if (!ok) return;
      // Execution order matters to satisfy FK constraints: delete child tables first.
      // 1) products, orders
      await supabase.from('products').delete().neq('id', '');
      await supabase.from('orders').delete().neq('id', '');
      // 2) brands, subcategories
      await supabase.from('brands').delete().neq('id', '');
      await supabase.from('subcategories').delete().neq('id', '');
      // 3) categories
      await supabase.from('categories').delete().neq('id', '');

      // 4) Remove non-admin profiles while preserving admin accounts
      await supabase.from('profiles').delete().not('role', 'eq', 'admin').not('is_admin', 'eq', true);

      // Refresh local state
      setProducts([]);
      setCategories([]);
      setBrands([]);
      setOrders([]);
      console.log('Admin database clear completed');
    } catch (e: any) {
      console.warn('Admin DB clear failed:', e?.message || e);
      alert('Failed to clear database: ' + (e?.message || String(e)));
    }
  };
  const toggleHero = async (id: number) => {
    const currentProduct = products.find((p) => p.id === id);
    const currentBestSeller = Boolean(
      currentProduct?.hero ||
      String(currentProduct?.tag || '').toLowerCase() === 'best seller'
    );
    const nextValue = !currentBestSeller;

    // Optimistic UI update: respond instantly so the star lights up on click.
    setProducts(prev => prev.map((p) => p.id === id ? {
      ...p,
      hero: nextValue,
      tag: nextValue ? 'Best Seller' : (p.tag === 'Best Seller' ? null : p.tag),
    } : p));

    try {
      await persistBestSellerFlag(id, nextValue);
    } catch (e: any) {
      console.warn('Best seller toggle sync failed gracefully:', e?.message || e);
      // Do not undo the optimistic UI update here; preserve the immediate user feedback.
    }
  };

  const updateBrand = async (oldName: string, newName: string) => {
    const clean = String(newName || '').trim();
    if (!clean) return;
    if (!supabase) return;

    const isAllowed = await verifyAdminPermission('update brands');
    if (!isAllowed) return;
    // Optimistic local updates
    setBrands(prev => prev.map(b => b === oldName ? clean : b));
    setCategories(prev => prev.map(c => {
      const existing = Array.isArray(c.brands) ? c.brands : [];
      return {
        ...c,
        brands: existing.map(b => b === oldName ? clean : b),
      };
    }));
    setProducts(prev => prev.map(p => p.brand === oldName ? { ...p, brand: clean } : p));

    try {
      // Find the brand row by name to get its id, then update by id to be explicit
      // Attempt to scope update to the category that currently lists this brand to avoid cross-category updates
      const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === String(oldName).toLowerCase()));
      const brandingQuery = scopedCategory
        ? supabase.from('brands').select('id, category_id').eq('name', oldName).eq('category_id', scopedCategory.id).limit(1).maybeSingle()
        : supabase.from('brands').select('id, category_id').eq('name', oldName).limit(1).maybeSingle();
      const { data: found } = await brandingQuery;
      if (found && found.id) {
        const { error } = await supabase.from('brands').update({ name: clean, slug: slugify(clean) }).eq('id', found.id).select().single();
        if (error) {
          console.warn('Supabase brand update failed:', error.message || error);
          alert('Failed to update brand: ' + (error.message || String(error)));
        }
      } else {
        // fallback: update by name if id not found
        // Fallback: update possibly-ungrouped brand rows by name
        const { error } = await supabase.from('brands').update({ name: clean, slug: slugify(clean) }).eq('name', oldName);
        if (error) {
          console.warn('Supabase brand update failed (fallback):', error.message || error);
          alert('Failed to update brand: ' + (error.message || String(error)));
        }
      }
    } catch (e: any) {
      console.warn('Supabase brand update error', e?.message || e);
      alert('Failed to update brand: ' + (e?.message || String(e)));
    }
  };

  const deleteBrand = async (nameOrId: string) => {
    const target = String(nameOrId || '').trim();
    if (!target) return;

    try {
      const ok = await requestConfirm('Delete this brand? This cannot be undone.');
      if (!ok) return;

      let brandId: string | number | null = null;
      let brandName: string = target;
      let brandSlug: string = slugify(target);

      if (!supabase) {
        const matchBrand = (val: any) => {
          if (!val) return false;
          const s = String(val).trim().toLowerCase();
          return s === target.toLowerCase() || s === brandSlug.toLowerCase();
        };
        setBrands(prev => prev.filter(b => !matchBrand(b)));
        setCategories(prev => prev.map(c => {
          const existing = Array.isArray(c.brands) ? c.brands : [];
          return { ...c, brands: existing.filter(b => !matchBrand(b)) };
        }));
        setProducts(prev => prev.filter(p => !matchBrand(p.brand)));
        return;
      }

      // 1) Find the brand row in Supabase to get its canonical id, name, slug and category scope
      try {
        let foundRow: any = null;
        // Prefer to scope to the category that currently shows this brand locally
        const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === target.toLowerCase()));

        const tryQueries = [];
        if (isUuid(target)) tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('id', target).limit(1).maybeSingle());
        // If we have a scoped category, prefer brand rows in that category
        if (scopedCategory) {
          tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('name', target).eq('category_id', scopedCategory.id).limit(1).maybeSingle());
          tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('slug', slugify(target)).eq('category_id', scopedCategory.id).limit(1).maybeSingle());
        }
        // Generic fallbacks
        tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('name', target).limit(1).maybeSingle());
        tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').ilike('name', target).limit(1).maybeSingle());
        tryQueries.push(supabase.from('brands').select('id, name, slug, category_id').eq('slug', slugify(target)).limit(1).maybeSingle());

        for (const q of tryQueries) {
          try {
            const { data } = await q;
            if (data) { foundRow = data; break; }
          } catch (_) { /* ignore single query failures */ }
        }

        if (foundRow) {
          brandId = foundRow.id;
          if (foundRow.name) brandName = foundRow.name;
          if (foundRow.slug) brandSlug = foundRow.slug;
        } else if (isUuid(target)) {
          brandId = target;
        }
      } catch (err) {
        console.debug('Error resolving brand before deletion:', err);
      }

      // 2) Clean up referencing rows in junction table if present
      if (brandId) {
        try {
          await supabase.from('category_brands').delete().eq('brand_id', brandId);
        } catch (_) {
          // ignore if junction table does not exist
        }
      }

      // 3) Delete referencing products (by brand_id or brand name) scoped to category when possible
      const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === target.toLowerCase()));
      if (brandId && schemaInfo.productsHasBrandId) {
        let delQ = supabase.from('products').delete().eq('brand_id', brandId);
        if (scopedCategory) delQ = delQ.eq('category_id', scopedCategory.id);
        const { error: perr } = await delQ;
        if (perr) {
          console.warn('Failed to delete products by brand_id:', perr);
          alert('Failed to delete brand products: ' + (perr.message || String(perr)));
          return;
        }
      }
      if (schemaInfo.productsHasBrand) {
        const brandNamesToDelete = Array.from(new Set([brandName, target].filter(Boolean)));
        for (const bName of brandNamesToDelete) {
          let delQ = supabase.from('products').delete().eq('brand', bName);
            if (scopedCategory) {
              if (schemaInfo.productsHasCategoryId) {
                delQ = delQ.eq('category_id', scopedCategory.id);
              } else if (schemaInfo.productsHasCategory) {
                delQ = delQ.eq('category', scopedCategory.id);
              }
            }
          const { error: perr2 } = await delQ;
          if (perr2) {
            console.warn('Failed to delete products by brand name:', perr2);
            alert('Failed to delete brand products: ' + (perr2.message || String(perr2)));
            return;
          }
        }
      }

      // 4) Execute delete query against brands table
      let delErr: any = null;
      // Track which category (if any) this deleted brand belonged to so we update local state narrowly
      let deletedBrandCategoryId: string | null = null;
      if (brandId) {
        // If this brand row has a category scope, delete only that row; otherwise delete by id
        const { data: brandRow } = await supabase.from('brands').select('category_id').eq('id', brandId).limit(1).maybeSingle();
        if (brandRow && brandRow.category_id) {
          deletedBrandCategoryId = String(brandRow.category_id);
          const { error } = await supabase.from('brands').delete().eq('id', brandId).eq('category_id', brandRow.category_id);
          delErr = error;
        } else {
          // global brand (no category_id)
          const { error } = await supabase.from('brands').delete().eq('id', brandId);
          delErr = error;
        }
      } else {
        // If we have a scopedCategory, delete by name within that category only (tolerant to missing category_id column)
        const scopedCategory = categories.find(cat => Array.isArray(cat.brands) && cat.brands.some(b => String(b).toLowerCase() === target.toLowerCase()));
        if (scopedCategory) {
          deletedBrandCategoryId = scopedCategory.id;
          try {
            const { error } = await supabase.from('brands').delete().eq('name', brandName).eq('category_id', scopedCategory.id);
            // If delete returned a missing-column error, treat as successful local deletion (DB cannot represent scope)
            if (error && isMissingColumnError(error)) {
              delErr = null;
            } else {
              delErr = error;
            }
          } catch (err) {
            // SDK/transport errors - if it's a missing-column issue, ignore; else propagate
            if (String(err).toLowerCase().includes('column') && String(err).toLowerCase().includes('category_id')) {
              delErr = null;
            } else {
              delErr = err;
            }
          }
        } else {
          // global delete by name/slug
          const { error } = await supabase.from('brands').delete().eq('name', brandName);
          delErr = error;
          if (delErr) {
            const { error: slugErr } = await supabase.from('brands').delete().eq('slug', brandSlug);
            delErr = slugErr;
          }
        }
      }
      if (delErr) {
        console.warn('Supabase brand delete failed:', delErr);
        alert('Failed to delete brand: ' + (delErr.message || String(delErr)));
        return;
      }

      // 5) Update local state immediately after successful database deletion
      const matchBrand = (val: any) => {
        if (!val) return false;
        const s = String(val).trim().toLowerCase();
        return (
          s === target.toLowerCase() ||
          (brandName && s === brandName.toLowerCase()) ||
          (brandId != null && s === String(brandId).toLowerCase()) ||
          (brandSlug && s === brandSlug.toLowerCase())
        );
      };

      // Update local state narrowly: if the deleted brand belonged to a specific category, only remove it from that
      // category's `brands` list. If it was a global brand (no category_id), remove from global `brands` and from all categories.
      if (deletedBrandCategoryId) {
        // Remove from the specific category's brand list only
        setCategories(prev => prev.map(c => {
          if (c.id !== deletedBrandCategoryId) return c;
          const existing = Array.isArray(c.brands) ? c.brands : [];
          return { ...c, brands: existing.filter(b => !matchBrand(b)) };
        }));
        // Remove products matching the brand across the category scope
        setProducts(prev => prev.filter(p => !(String(p.category) === String(deletedBrandCategoryId) && matchBrand(p.brand))));
      } else {
        // Global brand deletion: remove from global list and from every category's brand lists
        setBrands(prev => prev.filter(b => !matchBrand(b)));
        setCategories(prev => prev.map(c => {
          const existing = Array.isArray(c.brands) ? c.brands : [];
          return { ...c, brands: existing.filter(b => !matchBrand(b)) };
        }));
        setProducts(prev => prev.filter(p => !matchBrand(p.brand)));
      }
    } catch (e: any) {
      console.warn('Supabase brand delete error:', e?.message || e);
      alert('Failed to delete brand: ' + (e?.message || String(e)));
    }
  };
  

  // Orders
  const addOrder = (order: Omit<Order, 'id' | 'createdAt'> & { id?: number | string; createdAt?: number | string }) => {
    const rawId = (order as any).id ?? Date.now();
    const id = String(rawId);
    const createdAt = (order as any).createdAt || (order as any).created_at || (order as any).date || (order as any).order_date || new Date().toISOString();
    // Normalize items immediately for local state so UI shows prices right away
    const itemsNormalizedLocal = normalizeOrderItems(Array.isArray((order as any).items) ? (order as any).items : [], products || []);
    const o: Order = { ...order, id, createdAt, status: order.status || 'pending', items: itemsNormalizedLocal } as Order;
    setOrders(prev => [...prev, o]);

    // Persist order to Supabase with proper mapping and error surfacing
    if (supabase) {
      (async () => {
        try {
          const itemsNormalized = normalizeOrderItems(Array.isArray(o.items) ? o.items : [], products);
          const rpcItems = (itemsNormalized || []).map((item: any) => ({
            id: item.id,
            qty: Number(item.qty) || 1,
          }));

          // Pricing, availability, stock decrement, and order insertion happen
          // together in the database transaction. Client prices are ignored.
          const { data, error } = await supabase.rpc('create_order_with_stock', {
            p_name: String(o.name || 'Customer').trim(),
            p_phone: String(o.phone || '').trim(),
            p_governorate: o.governorate || null,
            p_address: o.address || null,
            p_items: rpcItems,
            p_shipping: Number((o as any).shipping) || 0,
          });

          const returned = (Array.isArray(data) ? data[0] : data) as any;
          if (error || !returned) {
            setOrders(prev => prev.filter(item => String(item.id) !== String(o.id)));
            console.error('Transactional order creation failed:', error?.message || error);
            alert('Order could not be placed: ' + (error?.message || 'Please try again.'));
          } else {
            setOrders(prev => prev.map(item => String(item.id) === String(o.id)
              ? ({ ...item, ...returned, id: returned.id, createdAt: returned.created_at || returned.createdAt || item.createdAt })
              : item));
            console.debug('DataContext:addOrder successfully persisted order:', returned.id);
          }
        } catch (e: any) {
          console.error('Supabase order write exception:', e?.message || e);
          alert('Warning: Order displayed in UI, but database save encountered an error: ' + (e?.message || String(e)));
        }
      })();
    }

    return id;
  };
  const updateOrder = (id: number | string, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => String(o.id) === String(id) ? { ...o, ...updates } : o));
    try {
      if (supabase) {
        (async () => {
          try {
            // Normalize any provided items and persist explicit unit_price/total_price keys; never send `price`.
            const cleaned = { ...updates } as any;
            if (cleaned.items) {
              const normalized = normalizeOrderItems(Array.isArray(cleaned.items) ? cleaned.items : [], products || []);
              cleaned.items = (normalized || []).map((it: any) => {
                const qty = Number(it.qty) || 1;
                const unit = Number(it.unit_price ?? it.unitPrice ?? it.price) || 0;
                const totalP = Number(it.total_price ?? it.totalPrice) || +(unit * qty).toFixed(2);
                const { price, unitPrice, totalPrice, total_price, ...rest } = it as any;
                return {
                  ...rest,
                  unit_price: unit,
                  total_price: totalP,
                };
              });
              cleaned.items = removePriceKeys(cleaned.items);
            }
            await supabase.from('orders').update(cleaned).eq('id', id);
          } catch (e) {
            console.warn('Supabase order update failed', e);
          }
        })();
      }
    } catch (e) {
      console.warn('Supabase order update error', e);
    }
  };
  const deleteOrder = async (id: number | string) => {
    try {
      const ok = await requestConfirm('Delete this order? This cannot be undone.');
      if (!ok) return;
    } catch (e) {
      return;
    }

    if (supabase) {
      try {
        // Explicitly target primary key column `id` with count: 'exact' and .select() to verify rows affected
        const { data, error, count } = await supabase
          .from('orders')
          .delete({ count: 'exact' })
          .eq('id', id)
          .select();

        if (error) {
          // If code is 22P02 (invalid type/uuid/bigint syntax), the ID format is incompatible with the DB column type
          // or is a client-side temporary ID not present in Supabase. Remove from local state gracefully.
          if (error.code === '22P02') {
            console.warn('Order ID type mismatch in database (code 22P02). Removing from local state only.', id);
            setOrders(prev => prev.filter(o => String(o.id) !== String(id)));
            return;
          }
          console.error('Supabase order delete failed:', error.message || error, {
            code: error.code,
            details: error.details,
            hint: error.hint,
            id,
          });
          alert('Failed to delete order from database: ' + (error.message || String(error)));
          return;
        }

        const rowsAffected = count ?? (Array.isArray(data) ? data.length : 0);
        if (rowsAffected === 0) {
          // Check if order still exists in Supabase to detect silent RLS blocking
          const { data: existing, error: checkErr } = await supabase
            .from('orders')
            .select('id')
            .eq('id', id)
            .maybeSingle();

          if (checkErr) {
            console.warn('Could not verify order existence after 0-row deletion:', checkErr);
          }

          if (existing) {
            console.error('Supabase order delete silent failure: 0 rows deleted due to Row Level Security (RLS) or missing DELETE policy on "orders" table.', { id });
            alert('Database permission error: The order could not be deleted from the database. Please ensure you are logged in with an admin account and that the Supabase "orders" table allows DELETE for your role.');
            return;
          }
        }
      } catch (e: any) {
        console.error('Supabase order delete exception:', e?.message || e, e);
        alert('Failed to delete order: ' + (e?.message || String(e)));
        return;
      }
    }

    // Only update local React state when database deletion succeeds or row is confirmed gone
    setOrders(prev => prev.filter(o => String(o.id) !== String(id)));
  };

  const getBrandsForCategory = (categoryId: string) => {
    if (!categoryId) return [] as string[];
    const cat = categories.find(c => String(c.id) === String(categoryId));
    if (cat && Array.isArray(cat.brands) && cat.brands.length > 0) return cat.brands;

    // Fallback: derive from products belonging to this category and global brands list
    const productBrandSet = new Set(products.filter(p => String(p.category) === String(categoryId)).map(p => String(p.brand || '')));
    const derived = Array.from(productBrandSet).filter(Boolean);
    if (derived.length > 0) return derived;

    // final fallback: return empty array
    return [] as string[];
  };

  return (
    <DataContext.Provider value={{ categories, brands, products, priceRanges, orders, siteSettings, getBrandsForCategory, updateSiteSettings, applyPromoCommand, actions: { addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory, addBrand, updateBrand, deleteBrand, addProduct, updateProduct, deleteProduct, toggleHero, addOrder, updateOrder, deleteOrder, adminClearDatabase } }}>
      {children}
      <ConfirmModal open={confirmState.open} message={confirmState.message} onConfirm={handleConfirm} onCancel={handleCancel} />
    </DataContext.Provider>
  );
}

export const useData = () => { const ctx = useContext(DataContext); if (!ctx) throw new Error('useData must be used within DataProvider'); return ctx; };

export default DataContext;
