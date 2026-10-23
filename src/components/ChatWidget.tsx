import React, { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabase";
import { MessageCircleMore, SendHorizonal, Sparkles, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { parseSitePromoCommand } from "../contexts/DataContext";
import type { Product } from "../types";
import { checkIsAdminRole, isAdminPhone } from "../utils/admin";

interface ChatMessage {
  id: number;
  sender: "user" | "bot";
  text: string;
  time: string;
}

interface ChatWidgetProps {
  products?: Product[];
  mode?: "floating" | "page";
  sidebarOpen?: boolean;
}

const defaultMessages: ChatMessage[] = [
  {
    id: 1,
    sender: "bot",
    text: "أهلاً بيك في PherMono يا فندم! أنا معاك عشان أساعدك تختار أحسن حاجات مناسبة لروتينك.",
    time: "الآن",
  },
  {
    id: 2,
    sender: "bot",
    text: "قولي بتدور على إيه أو إيه اللي محتاجه النهارده، وهقولك على ترشيحات تظبط معاك بالأسعار فوراً.",
    time: "الآن",
  },
];

const GROQ_MODEL = "openai/gpt-oss-20b";

const resolveGroqApiKeys = (): string[] => {
  const env = process.env as Record<string, string | undefined>;
  const candidates: Array<string | undefined> = [
    env.REACT_APP_GROQ_API_KEY,
    env.REACT_APP_GROQ_API_KEYS,
  ];

  const keys = candidates
    .flatMap((value) => {
      if (!value) return [];
      return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    })
    .filter((key, index, arr) => arr.indexOf(key) === index);

  return keys;
};

const GROQ_API_KEYS: string[] = resolveGroqApiKeys();
const PRODUCT_RESEARCH_CACHE_TTL_MS = 1000 * 60 * 30;
const PRODUCT_RESEARCH_CACHE = new Map<string, { expiresAt: number; payload: { ok: boolean; source?: string; summary?: string; url?: string; error?: string } }>();
const MAX_DAILY_MESSAGES_PER_USER = 20;
const GUEST_CHAT_USAGE_TABLE = "guest_chat_usage";
const USER_CHAT_USAGE_TABLE = "user_chat_usage";
// Bump version suffix whenever the counting semantics change to clear stale stored data.
const LOCAL_GUEST_LIMIT_KEY = "phermono_guest_daily_limit_v2";
const LOCAL_USER_LIMIT_KEY = "phermono_user_daily_limit_v2";

let groqKeyIndex = 0;

export const shouldRetryWithNextGroqKey = (status?: number, error?: unknown): boolean => {
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return /429|rate limit|too many requests|timeout|timed out|failed to fetch|network|fetch failed|connection/i.test(message);
  }

  return false;
};

const getNextGroqKey = () => {
  if (!GROQ_API_KEYS || GROQ_API_KEYS.length === 0) return "";
  const key = GROQ_API_KEYS[groqKeyIndex % GROQ_API_KEYS.length];
  groqKeyIndex = (groqKeyIndex + 1) % GROQ_API_KEYS.length;
  return key;
};

const getDayStamp = () => new Date().toISOString().slice(0, 10);

const isValidUUID = (v?: string) => {
  if (!v || typeof v !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
};

export function getGuestLimitStatus(messageCount: number, limit = MAX_DAILY_MESSAGES_PER_USER) {
  const count = Math.max(0, Number(messageCount) || 0);
  const remaining = Math.max(0, limit - count);
  return {
    allowed: count < limit,
    remaining,
  };
}

export function getUsageLimitStatus(messageCount: number, limit = MAX_DAILY_MESSAGES_PER_USER) {
  const count = Math.max(0, Number(messageCount) || 0);
  const status = getGuestLimitStatus(count, limit);
  return {
    ...status,
    messageCount: count,
  };
}

const readLocalGuestUsage = (fingerprint: string) => {
  try {
    const raw = localStorage.getItem(LOCAL_GUEST_LIMIT_KEY);
    const entries = raw ? JSON.parse(raw) : {};
    const today = getDayStamp();
    const todayEntry = entries?.[fingerprint]?.[today];
    return Number(todayEntry || 0);
  } catch {
    return 0;
  }
};

const writeLocalGuestUsage = (fingerprint: string, count: number) => {
  try {
    const raw = localStorage.getItem(LOCAL_GUEST_LIMIT_KEY);
    const entries = raw ? JSON.parse(raw) : {};
    const today = getDayStamp();
    entries[fingerprint] = {
      ...(entries[fingerprint] || {}),
      [today]: count,
    };
    localStorage.setItem(LOCAL_GUEST_LIMIT_KEY, JSON.stringify(entries));
  } catch {
    // ignore local storage write failures
  }
};

const getGuestFingerprint = async (): Promise<string> => {
  const parts = {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    language: typeof navigator !== "undefined" ? navigator.language : "",
    platform: typeof navigator !== "undefined" ? navigator.platform : "",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "" : "",
    windowScreen: typeof window !== "undefined" && typeof window.screen !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "",
    href: typeof window !== "undefined" ? window.location.href : "",
  };

  const raw = JSON.stringify(parts);

  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hashBuffer))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `guest-${hash.toString(16)}`;
};

// `supabase` client is imported from `src/lib/supabase.ts`.

const getGuestUsageFromSupabase = async (fingerprint: string) => {
  if (!supabase) {
    return getUsageLimitStatus(readLocalGuestUsage(fingerprint));
  }

  const date = getDayStamp();
  const { data, error } = await supabase
    .from(GUEST_CHAT_USAGE_TABLE)
    .select("message_count")
    .eq("fingerprint", fingerprint)
    .eq("date", date)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.warn("Guest chat usage fetch failed:", error.message);
    return getUsageLimitStatus(readLocalGuestUsage(fingerprint));
  }

  const messageCount = Number(data?.message_count ?? 0);
  // Keep localStorage in sync with Supabase so increments use the right base
  writeLocalGuestUsage(fingerprint, messageCount);
  return getUsageLimitStatus(messageCount);
};

const incrementGuestUsage = async (fingerprint: string) => {
  if (supabase) {
    const date = getDayStamp();
    // Use localStorage as the base — it was just synced from Supabase by getGuestUsageFromSupabase,
    // so it reflects the accurate user-only message count for today.
    const currentCount = readLocalGuestUsage(fingerprint);
    const nextCount = currentCount + 1;

    const { error } = await supabase.from(GUEST_CHAT_USAGE_TABLE).upsert(
      {
        fingerprint,
        date,
        message_count: nextCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "fingerprint,date" }
    );

    if (error) {
      console.warn("Guest chat usage update failed:", error.message);
    }

    writeLocalGuestUsage(fingerprint, nextCount);
    return getUsageLimitStatus(nextCount);
  }

  const nextCount = readLocalGuestUsage(fingerprint) + 1;
  writeLocalGuestUsage(fingerprint, nextCount);
  return getUsageLimitStatus(nextCount);
};

const readLocalUserUsage = (userId: string) => {
  try {
    const raw = localStorage.getItem(LOCAL_USER_LIMIT_KEY);
    const entries = raw ? JSON.parse(raw) : {};
    const today = getDayStamp();
    const todayEntry = entries?.[userId]?.[today];
    return Number(todayEntry || 0);
  } catch {
    return 0;
  }
};

const writeLocalUserUsage = (userId: string, count: number) => {
  try {
    const raw = localStorage.getItem(LOCAL_USER_LIMIT_KEY);
    const entries = raw ? JSON.parse(raw) : {};
    const today = getDayStamp();
    entries[userId] = {
      ...(entries[userId] || {}),
      [today]: count,
    };
    localStorage.setItem(LOCAL_USER_LIMIT_KEY, JSON.stringify(entries));
  } catch {
    // ignore local storage write failures
  }
};

const dispatchSiteSettingsUpdate = (settings: Record<string, any>) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent('site-settings-updated', { detail: settings }));
};

export const looksLikeAdminCommandIntent = (message: string): boolean => {
  const text = String(message ?? '').trim();
  if (!text) return false;

  const dynamicPercentPattern = /(?:make\s+(?:a\s+)?)?(?:\d{1,2}\s*%\s*(?:off|discount|sale|offer)|(?:discount|offer|sale|off)\s*(?:on|for)?\s*(?:all\s+orders|all\s+products|the\s+store|everything)?\s*\d{1,2}\s*(?:%|٪)|\d{1,2}\s*(?:%|٪)\s*(?:off|discount|sale|offer)|(?:خصم|تخفيض)\s*\d{1,2}\s*(?:%|٪)|\d{1,2}\s*(?:%|٪)\s*(?:خصم|تخفيض))/i;

  return dynamicPercentPattern.test(text)
    || /(free shipping|shipping free|free delivery|delivery free|promo|discount|offer|reset|cancel|stop|remove|disable|enable|activate|buy one|get one|bogo|الغي|الغى|إيقاف|تفعيل|خصم|تخفيض|عرض|العرض|شحن مجانى|الشحن المجانى|شحن مجاني|الشحن المجاني|هدية|gift)/i.test(text);
};

const handleAdminSiteSettingsCommand = async (message: string, currentUser?: any) => {
  const isAdmin = !!currentUser && (checkIsAdminRole(currentUser) || isAdminPhone(currentUser.phone));
  const looksLikeAdminIntent = looksLikeAdminCommandIntent(message);

  if (!isAdmin || !looksLikeAdminIntent) {
    return { handled: false, message: '' };
  }

  const updates = parseSitePromoCommand(message);
  if (!updates || Object.keys(updates).length === 0) {
    return { handled: false, message: '' };
  }

  if (!supabase) {
    return { handled: true, message: 'Supabase is not configured for live site updates. No database write was attempted.' };
  }

  try {
    const { data: existingRow } = await supabase
      .from('site_settings')
      .select('*')
      .eq('key', 'site_config')
      .maybeSingle();

    const currentValue = existingRow && existingRow.value && typeof existingRow.value === 'object' ? existingRow.value : {};
    const resetDefaults = {
      free_shipping_threshold: 200,
      active_promo: 'none',
      is_free_shipping_active: false,
      promo_banner_text: '',
      promo_discount_percent: 0,
      promo_rule: 'none',
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
      promo_start_at: null,
      promo_end_at: null,
    };
    const nextValue = {
      ...resetDefaults,
      ...currentValue,
      ...updates,
    };

    if (updates.active_promo === 'none' || updates.is_free_shipping_active === false) {
      Object.assign(nextValue, {
        free_shipping_threshold: 200,
        active_promo: 'none',
        is_free_shipping_active: false,
        promo_banner_text: '',
        promo_discount_percent: 0,
        promo_rule: 'none',
        buy_x: 0,
        get_y: 0,
        promotion_scope: 'all',
      });
    }

    const { error } = await supabase
      .from('site_settings')
      .upsert([
        {
          key: 'site_config',
          value: nextValue,
          updated_at: new Date().toISOString(),
        }
      ], { onConflict: 'key' })
      .select();

    if (error) {
      console.warn('Admin site settings command failed:', error.message || error);
      return { handled: true, message: 'I hit a database issue while updating the live site settings. Please try again.' };
    }

    dispatchSiteSettingsUpdate(nextValue);

    const isArabicMessage = /[\u0600-\u06FF]/.test(message);
    const summary = [] as string[];

    if (typeof updates.free_shipping_threshold === 'number' && updates.free_shipping_threshold > 0) {
      const thresholdMessage = isArabicMessage
        ? `تم تحديث إعدادات الموقع بنجاح: الشحن المجاني أصبح مفعل للطلبات فوق ${updates.free_shipping_threshold} جنيه`
        : `✅ Live site settings updated successfully: free shipping is now active for orders over ${updates.free_shipping_threshold} EGP`;
      return { handled: true, message: thresholdMessage };
    }

    if (updates.active_promo === 'none' && updates.is_free_shipping_active === false) {
      return {
        handled: true,
        message: isArabicMessage
          ? 'تم إلغاء العرض النشط والشحن المجاني بنجاح. الموقع الآن في الوضع الافتراضي.'
          : '✅ The active promo and free shipping were cancelled successfully. The storefront is back to default settings.'
      };
    }

    if (typeof updates.is_free_shipping_active === 'boolean') summary.push(isArabicMessage ? `الشحن المجاني: ${updates.is_free_shipping_active ? 'مفعل' : 'غير مفعل'}` : `free shipping: ${updates.is_free_shipping_active ? 'enabled' : 'disabled'}`);
    if (updates.active_promo && updates.active_promo !== 'none') summary.push(isArabicMessage ? `العرض النشط: ${updates.active_promo}` : `active promo: ${updates.active_promo}`);
    if (updates.promo_banner_text) summary.push(isArabicMessage ? `الشعار: ${updates.promo_banner_text}` : `banner: ${updates.promo_banner_text}`);

    const summaryText = summary.length > 0 ? ` (${summary.join(' • ')})` : '';
    return { handled: true, message: isArabicMessage ? `تم تحديث إعدادات الموقع بنجاح${summaryText}.` : `✅ Live site settings updated successfully${summaryText}.` };
  } catch (error) {
    console.warn('Admin site settings command exception:', error);
    return { handled: true, message: 'I hit a problem while updating the live site settings. Please try again.' };
  }
};

const getUserUsageFromSupabase = async (userId: string) => {
  // Protect against passing non-UUID user identifiers to DBs that may expect UUIDs.
  if (!isValidUUID(userId)) {
    // Fallback to local usage tracking for non-UUID ids
    return getUsageLimitStatus(readLocalUserUsage(userId));
  }

  if (!supabase) {
    return getUsageLimitStatus(readLocalUserUsage(userId));
  }

  const date = getDayStamp();
  const { data, error } = await supabase
    .from(USER_CHAT_USAGE_TABLE)
    .select("message_count")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.warn("User chat usage fetch failed:", error.message);
    return getUsageLimitStatus(readLocalUserUsage(userId));
  }

  const messageCount = Number(data?.message_count ?? 0);
  // Keep localStorage in sync with Supabase so increments use the right base
  writeLocalUserUsage(userId, messageCount);
  return getUsageLimitStatus(messageCount);
};

const incrementUserUsage = async (userId: string) => {
  // If we don't have a valid UUID, avoid calling the user table and fall back to local/guest tracking.
  if (!isValidUUID(userId)) {
    const nextCount = readLocalUserUsage(userId) + 1;
    writeLocalUserUsage(userId, nextCount);
    return getUsageLimitStatus(nextCount);
  }

  const date = getDayStamp();
  const currentCount = readLocalUserUsage(userId);
  const nextCount = currentCount + 1;

  if (!supabase) {
    writeLocalUserUsage(userId, nextCount);
    return getUsageLimitStatus(nextCount);
  }

  try {
    // Prefer an update first. If no rows were affected, insert a new row.
    const { data: updated, error: updateErr } = await supabase
      .from(USER_CHAT_USAGE_TABLE)
      .update({ message_count: nextCount, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('date', date)
      .select();

    if (!updateErr && Array.isArray(updated) && updated.length > 0) {
      writeLocalUserUsage(userId, nextCount);
      return getUsageLimitStatus(nextCount);
    }

    // Insert as fallback
    const { error: insertErr } = await supabase.from(USER_CHAT_USAGE_TABLE).insert([
      { user_id: userId, date, message_count: nextCount, updated_at: new Date().toISOString() },
    ]);

    if (insertErr) {
      console.warn('User chat usage insert failed:', insertErr.message || insertErr);
    }
  } catch (e: any) {
    console.warn('User chat usage write error:', e?.message || e);
  }

  writeLocalUserUsage(userId, nextCount);
  return getUsageLimitStatus(nextCount);
};

export const buildGroqMessages = (
  history: Array<{ sender: "user" | "bot"; text: string }> = [],
  latestMessage?: { sender: "user" | "bot"; text: string } | null
) => {
  const messages = latestMessage ? [...history, latestMessage] : [...history];

  return messages.slice(-6).map((message) => ({
    role: message.sender === "user" ? "user" : "assistant",
    content: message.text,
  }));
};

const normalizeCatalogMatchText = (value: string): string => {
  if (!value) return "";

  let normalized = String(value)
    .normalize("NFKC")
    .replace(/&/g, " and ")
    .replace(/[\u0640\u0610-\u061A\u064B-\u065F]/g, "")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[\u200C\u200D]/g, "")
    .toLowerCase();

  const arabicReplacements: Array<[RegExp, string]> = [
    [/ليش|ليه|ايه|اى|اي\s*ش|ايش/g, "what"],
    [/عايز|عايزة|عايزه|عايزين|محتاج|محتاجه|محتاجين|بحاجة|بدور|دور/g, "want"],
    [/مرطب|رطب|moisturizer|moisturize|hydration|hydrate/g, "moisturizer"],
    [/بالم|بلم|lip balm|ليب|ليب\s*بالم|ليب\s*بلم|لب/g, "lip balm"],
    [/شفايف|شفاه|lip\s*area|lips/g, "lips"],
    [/شعر|hair|شو/g, "hair"],
    [/وجه|بشرة|skin|skincare|بشـرة|بشرة/g, "skin"],
    [/سيروم|سرم|serum/g, "serum"],
    [/غسول|كلينسر|غسيل|cleanser|wash/g, "cleanser"],
    [/واقي\s*شمس|sunblock|sunscreen|spf|sun cream/g, "sunscreen"],
    [/بريق|لمعان|لُمعان|gloss|glossy|shine|shiney/g, "gloss"],
    [/حاجه|حاجة|شي|شئ|منتج|مادة/g, "product"],
  ];

  for (const [pattern, replacement] of arabicReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getCatalogMatchTokens = (value: string): string[] => {
  const normalized = normalizeCatalogMatchText(value);
  if (!normalized) return [];

  const stopWords = new Set([
    "the", "a", "an", "and", "or", "for", "with", "from", "into", "about", "this", "that", "these",
    "those", "what", "when", "where", "why", "how", "i", "you", "we", "they", "them", "our", "your",
    "my", "to", "of", "want", "need", "looking", "wanting", "something", "please", "can", "could", "help", "please",
    "what", "which", "see", "know", "tell", "give", "show", "need", "want", "look", "search",
    "عايز", "عايزة", "عايزه", "عايزين", "حاجة", "محتاج", "محتاجه", "محتاجين", "لـ", "على", "في", "من",
    "ال", "وال", "و", "ب", "ك", "ل", "ا", "اي", "اى", "ه", "هو", "هي", "عن", "لو", "لوحد", "بخصوص", "product"
  ]);

  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !stopWords.has(token))
  ));
};

const PRODUCT_ALIAS_MAP: Array<[RegExp, string[]]> = [
  [/\b(lip|lips|lipcare|lip care|lip-care|شفايف|شفاه|شفايف|لِب|ليب)\b/i, ["lip", "lips", "lipcare", "شفايف", "شفاه", "ليب"]],
  [/\b(balm|balmstick|salve|lip balm|lip repair|repair balm|بالم|بلم|ليپ بالم|ليب بالم)\b/i, ["balm", "salve", "repair", "بالم", "ليب"]],
  [/\b(moisturizer|moisturize|moisture|hydrating|hydrate|hydratant|richer|soften|نضارة|مرطب|رطب|ت moisturize|hydrate|hydration)\b/i, ["moisturize", "hydrate", "hydrating", "moisturizer", "مرطب", "رطب", "نضارة"]],
  [/\b(gloss|glossy|shine|shiny|lip oil|oil|بريق|لمعان|ألوان|glow|shine)\b/i, ["gloss", "glossy", "shine", "lip oil", "بريق", "لمعان", "أويل", "oil"]],
  [/\b(serum|سيروم|face|بشرة|skin|skincare|face serum|سرم)\b/i, ["serum", "سيروم", "bacteria", "skin", "بشرة"]],
  [/\b(cleanser|wash|foam|غسول|غسيل|كلينسر|wash)\b/i, ["cleanser", "wash", "foam", "غسول", "كلينسر"]],
  [/\b(sunscreen|spf|sunblock|واقي شمس|sun cream|cream)\b/i, ["sunscreen", "spf", "sunblock", "واقي شمس", "sun" ]],
];

const getCatalogMatchBoost = (queryNormalized: string, productText: string): number => {
  const text = normalizeCatalogMatchText(productText || "");
  if (!queryNormalized || !text) return 0;

  let score = 0;
  if (queryNormalized.includes(text) || text.includes(queryNormalized)) score += 80;

  for (const [regex, aliasList] of PRODUCT_ALIAS_MAP) {
    if (regex.test(queryNormalized) && aliasList.some((alias) => text.includes(normalizeCatalogMatchText(alias)))) {
      score += 20;
    }
  }

  const queryTokens = getCatalogMatchTokens(queryNormalized);
  const textTokens = getCatalogMatchTokens(text);
  if (queryTokens.length > 0) {
    const shared = queryTokens.filter((token) => textTokens.includes(token));
    score += shared.length * 12;
    if (queryTokens.every((token) => textTokens.includes(token) || token.length <= 2)) {
      score += 10;
    }
  }

  if (/(lip|شفايف|شفاه|ليب|balm|بالم|moistur|مرطب|hydrate|hydrating|gloss|shine|بريق|لمعان)/i.test(queryNormalized)) {
    if (/(lip|شفايف|شفاه|ليب|balm|بالم|moistur|مرطب|hydrate|hydrating|gloss|shine|بريق|لمعان)/i.test(text)) {
      score += 14;
    }
  }

  return score;
};

export const searchCatalogProducts = (products: Product[] = [], query = "") => {
  if (!Array.isArray(products) || products.length === 0) return [];
  const trimmedQuery = String(query ?? "").trim();
  if (!trimmedQuery) {
    return products.slice(0, 10);
  }

  const normalizedQuery = normalizeCatalogMatchText(trimmedQuery);
  if (!normalizedQuery) {
    return products.slice(0, 10);
  }

  const genericQueryTokens = new Set(["serum", "cleanser", "sunscreen", "oil", "balm", "lip", "lips", "gloss", "moisturizer", "skin", "hair", "product"]);

  const results = products
    .map((product) => {
      const productText = [
        product.name,
        product.brand,
        product.category,
        product.subcategory,
        product.description,
        product.tag,
      ].join(" ");

      const normalizedText = normalizeCatalogMatchText(productText);
      let score = 0;

      if (!normalizedText) {
        return { product, score: 0 };
      }

      if (normalizedText.includes(normalizedQuery) || normalizedQuery.includes(normalizedText)) {
        score += 80;
      }

      const productName = normalizeCatalogMatchText(product.name || "");
      if (productName.includes(normalizedQuery) || normalizedQuery.includes(productName)) {
        score += 45;
      }

      const description = normalizeCatalogMatchText(product.description || "");
      if (description.includes(normalizedQuery) || normalizedQuery.includes(description)) {
        score += 30;
      }

      const categoryText = normalizeCatalogMatchText(`${product.category ?? ""} ${product.subcategory ?? ""}`);
      if (categoryText.includes(normalizedQuery) || normalizedQuery.includes(categoryText)) {
        score += 15;
      }

      score += getCatalogMatchBoost(normalizedQuery, productText);

      const queryTokens = getCatalogMatchTokens(normalizedQuery);
      const textTokens = getCatalogMatchTokens(productText);
      const shared = queryTokens.filter((token) => textTokens.includes(token));
      const strongShared = shared.filter((token) => token.length > 3 || genericQueryTokens.has(token) || token.includes("lip") || token.includes("balm") || token.includes("gloss") || token.includes("serum") || token.includes("clean") || token.includes("shade") || token.includes("moist"));
      score += shared.length * 8;

      const unknownTokens = queryTokens.filter((token) => !genericQueryTokens.has(token) && !textTokens.includes(token));
      if (queryTokens.length > 1 && unknownTokens.length > 0) {
        score = 0;
      }

      if (shared.length === 0 && !productName.includes(normalizedQuery) && !normalizedText.includes(normalizedQuery)) {
        score = 0;
      }

      if (shared.length === 1 && strongShared.length === 0) {
        score = Math.min(score, 12);
      }

      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);

  return results.length > 0 ? results.slice(0, 12) : [];
};

export const buildCatalogContext = (products: Product[] = [], query = "") => {
  if (!products.length) {
    return "No product catalog available yet.";
  }

  const relevantProducts = query ? searchCatalogProducts(products, query) : products.slice(0, 30);
  if (query && relevantProducts.length === 0) {
    return "No catalog matches for this request. Use the live catalog product names, categories, or the customer’s need to narrow the search.";
  }

  return relevantProducts
    .slice(0, 12)
    .map((p, idx) => {
      const isHair =
        p.category === "haircare" ||
        /hair|shampoo|conditioner|curl|scalp|frizz|شعر|كيرلي/i.test(
          `${p.category} ${p.subcategoryId ?? ""} ${p.name} ${p.description ?? ""}`
        );

      const resolvedPrice = p.sellingPrice ?? p.price;
      const price = resolvedPrice != null ? `${resolvedPrice} EGP` : "price not set";
      const original =
        p.originalPrice != null || p.marketPrice != null
          ? ` (original: ${p.originalPrice ?? p.marketPrice} EGP)`
          : "";

      const suitabilityLabel = isHair ? "HAIR_AND_SCALP_TYPE" : "SKIN_TYPE_SUITABILITY";
      const suitabilityValue = p.skinType ? p.skinType : "Refer to official description";

      const lines = [
        `[ITEM #${idx + 1}]`,
        `RAW_PRODUCT_NAME: ${p.name}`,
        `BRAND: ${p.brand}`,
        `CATEGORY: ${p.category}`,
        `SUBCATEGORY: ${p.subcategoryId || "general"}`,
        `PRICE: ${price}${original}`,
        `${suitabilityLabel}: ${suitabilityValue}`,
        p.tag ? `TAG: ${p.tag}` : "",
        p.rating ? `RATING: ${p.rating} / 5` : "",
        `OFFICIAL_DATABASE_DESCRIPTION: ${p.description ? p.description.trim() : "Available in store inventory. Use your expert beauty intelligence to describe its benefits and formula."}`,
      ].filter(Boolean);

      return lines.join("\n");
    })
    .join("\n\n---\n\n");
};

export const buildWebSearchQuery = (productName: string, brand?: string) => {
  const tokens = [brand, productName]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(" ");

  return tokens
    .replace(/\s+/g, " ")
    .replace(/\s+(?:for|with|and)\s+/gi, " ")
    .replace(/\b(?:ingredients?|benefits?|reviews?|price|compare|alternatives?|details?)\b/gi, " ")
    .trim();
};

export const shouldUseExternalProductResearch = (message = ""): boolean => {
  const text = String(message ?? "").trim();
  if (!text) return false;

  const normalized = text.toLowerCase();
  const englishDetailPattern = /(ingredient|ingredients|benefit|benefits|what does|what is in|how it works|suitable|suitability|for dry|for oily|for acne|for sensitive|compare|comparison|difference|alternative|alternatives|tell me more|why this|why use|why choose|not sure|best for|good for)/i;
  const arabicDetailPattern = /(مكونات|مكون|فوائد|فائدة|مناسب|مناسبة|مقارنة|فرق|بديل|بدائل|استخدام|كيف|ليه|لماذا|أفضل|احسن|تاثير|تأثير|للبشرة|للشعر|بيشتغل|مفيدة|مناسبه)/i;
  const lookForProductDetail = englishDetailPattern.test(normalized) || arabicDetailPattern.test(normalized);
  const mentionsProductLikeWord = /(lip|balm|serum|cleanser|mask|oil|cream|gel|sunscreen|moisturizer|skincare|haircare|product|brand|formula|ingredient|benefit|بالم|سيروم|غسول|مرطب|زيت|كريم|جل|مكياج|منتج|مكونات|فوائد|شعر|بشرة)/i.test(normalized);

  return lookForProductDetail && mentionsProductLikeWord;
};

const normalizeProductResearchKey = (productName: string, brand?: string) => {
  const key = `${String(brand || "").trim().toLowerCase()}::${String(productName || "").trim().toLowerCase()}`;
  return key.replace(/\s+/g, " ").trim();
};

export const resolveProductResearchTarget = (products: Product[] = [], query = "") => {
  const trimmedQuery = String(query ?? "").trim();
  if (!trimmedQuery) return undefined;

  const cleanedQuery = trimmedQuery
    .replace(/\b(?:what|which|who|is|are|the|a|an|for|with|about|tell|me|more|how|why|this|that|these|those)\b/gi, " ")
    .replace(/\b(?:ingredients?|benefits?|uses?|features?|compare|comparison|difference|alternatives?|details?|suitable|suitability|reviews?|price|stock|available)\b/gi, " ")
    .replace(/[?!,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const directCandidates = cleanedQuery ? searchCatalogProducts(products, cleanedQuery) : [];
  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  const exactNameMatches = products.filter((product) => {
    const haystack = `${product.name} ${product.brand}`.toLowerCase();
    return haystack.includes(trimmedQuery.toLowerCase()) || trimmedQuery.toLowerCase().includes(haystack);
  });

  return exactNameMatches[0] || products[0];
};

export const buildProductResearchContext = (
  product: Product,
  research?: { ok: boolean; source?: string; summary?: string; url?: string; error?: string; results?: Array<{ title?: string; description?: string; url?: string; source?: string }> }
) => {
  const catalogLine = [
    "Phermono catalog source:",
    `Product: ${product?.name || "unknown"}`,
    `Brand: ${product?.brand || "unknown"}`,
    `Category: ${product?.category || "unknown"}`,
    `Website price: ${product?.price ?? "not listed"} EGP`,
    `Catalog description: ${product?.description || "Not available in catalog."}`,
  ].join(" | ");

  if (!research || !research.ok || (!research.summary && (!research.results || research.results.length === 0))) {
    return [
      catalogLine,
      "External research: not available or not verified. Do not claim ingredients, benefits, or availability without a trusted source.",
    ].join("\n");
  }

  const searchDetails = Array.isArray(research.results) && research.results.length > 0
    ? research.results
        .slice(0, 3)
        .map((result, index) => `${index + 1}. ${result.title || "External result"} — ${result.description || "No summary available."} (${result.url || result.source || "source unavailable"})`)
        .join(" | ")
    : "";

  const sourceLine = research.url || research.source || "unknown source";
  return [
    catalogLine,
    `External research source: ${sourceLine}`,
    searchDetails ? `External research results: ${searchDetails}` : `External research summary: ${research.summary}`,
    "Important: this is external information only. It does not prove the product is in stock or sold by Phermono.",
  ].join("\n");
};

export const fetchProductWebResearch = async (productName: string, brand?: string): Promise<{ ok: boolean; source?: string; summary?: string; url?: string; results?: Array<{ title?: string; description?: string; url?: string; source?: string }>; error?: string }> => {
  const query = buildWebSearchQuery(productName, brand);
  if (!query) {
    return { ok: false, error: "No product name was provided for web research." };
  }

  const cacheKey = normalizeProductResearchKey(productName, brand);
  const cached = PRODUCT_RESEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  try {
    const response = await fetch("/api/product-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        productName,
        brand,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    const normalized = {
      ok: Boolean(payload?.ok),
      source: payload?.source || payload?.results?.[0]?.source || "web",
      summary: payload?.summary || payload?.results?.[0]?.description || "No summary available from the external source.",
      url: payload?.url || payload?.results?.[0]?.url || "",
      results: Array.isArray(payload?.results) ? payload.results : [],
      error: payload?.error || (response.ok ? undefined : "External search service is unavailable."),
    };

    if (!response.ok || !normalized.ok) {
      PRODUCT_RESEARCH_CACHE.set(cacheKey, { expiresAt: Date.now() + PRODUCT_RESEARCH_CACHE_TTL_MS, payload: normalized });
      return normalized;
    }

    PRODUCT_RESEARCH_CACHE.set(cacheKey, { expiresAt: Date.now() + PRODUCT_RESEARCH_CACHE_TTL_MS, payload: normalized });
    return normalized;
  } catch (error) {
    const payload = {
      ok: false,
      error: error instanceof Error ? error.message : "External search failed unexpectedly.",
    };
    PRODUCT_RESEARCH_CACHE.set(cacheKey, { expiresAt: Date.now() + PRODUCT_RESEARCH_CACHE_TTL_MS, payload });
    return payload;
  }
};

export const buildDynamicFallback = (query = "", isArabic = true): string => {
  const q = query.toLowerCase();
  const isComparison =
    /قارن|مقارنة|الفرق بين|أحسن من|أفضل من|compare|comparison|difference|vs|versus/.test(q);
  const isOrder =
    /طلب|اوردر|أوردر|شحن|توصيل|تتبع|سياسة|استرجاع|دفع|order|shipping|track|delivery|return|refund|policy/.test(q);
  const isRoutine =
    /روتين|خطوات|ترتيب|صباحي|مسائي|طريقة استخدام|routine|regimen|steps|am routine|pm routine/.test(q);
  const isHair =
    /شعر|كيرلي|شامبو|بلسم|سيروم شعر|حمام كريم|جل|جيل|تساقط|هيش|قشرة|فروة|hair|shampoo|conditioner|curl|gel|styling|scalp|frizz/.test(
      q
    );
  const isSkin =
    /بشر|وجه|حبوب|غسول|مرطب|واقي شمس|صن بلوك|تجاعيد|نضارة|مسام|skin|face|cleanser|moisturizer|acne|sunscreen|spf|pores/.test(
      q
    );

  if (isComparison) {
    return isArabic
      ? "أنا معاك يا فندم! حددلي المنتجات اللي حابب تقارن بينها وهشرحلك الفرق في المكونات والأسعار والنتيجة بالتفصيل من الكتالوج عندنا."
      : "I'm right here to help! Tell me which products you'd like to compare, and I'll break down the key differences, ingredients, and prices for you.";
  }

  if (isOrder) {
    return isArabic
      ? "أنا معاك يا فندم! الشحن عندنا بيغطي كل المحافظات والدفع متاح عند الاستلام أو أونلاين، وتقدر تتابع تفاصيل طلباتك من صفحة حسابك في أي وقت."
      : "I'm right here to help! We deliver across all Egyptian governorates with cash on delivery or online payment, and you can track your orders from your account.";
  }

  if (isRoutine) {
    return isArabic
      ? "أنا معاك يا فندم! قولي إيه النتيجة اللي حابب توصلها في روتينك وهنسقلك الخطوات المناسبة بالمنتجات المتاحة بالترتيب."
      : "I'm right here to help! Tell me your target routine goals, and I'll lay out the ideal step-by-step products from our catalog.";
  }

  if (isHair) {
    return isArabic
      ? "أنا معاك يا فندم! قولي بتدور على إيه لشعرك أو نوع شعرك إيه، وهقترحلك أحسن المنتجات المناسبة من الكتالوج فوراً."
      : "I'm right here to help! Tell me about your hair type or what you need for your hair, and I'll find the best picks from our catalog.";
  }

  if (isSkin) {
    return isArabic
      ? "أنا معاك يا فندم! قولي إيه اللي حابب تركز عليه في بشرتك أو نوع بشرتك إيه، وهقترحلك أحسن المنتجات من الكتالوج فوراً."
      : "I'm right here to help! Tell me about your skin type or concern, and I'll find the best picks from our catalog.";
  }

  return isArabic
    ? "أنا معاك يا فندم! قولي بتدور على منتج إيه بالظبط أو إيه اللي محتاجه، وهقولك على أحسن ترشيحات من الكتالوج فوراً."
    : "I'm right here to help! Tell me what product you're looking for or how I can help, and I'll find the best matches from our catalog right away.";
};

export const formatBotText = (text: string, fallbackText?: string): string => {
  if (!text) {
    return (
      fallbackText ||
      "أنا معاك يا فندم! قولي بتدور على منتج إيه بالظبط أو إيه اللي محتاجه، وهقولك على أحسن ترشيحات من الكتالوج فوراً."
    );
  }

  let cleaned = text;
  const hasArabic = /[\u0600-\u06FF]/.test(cleaned);
  const separator = hasArabic ? " ، " : ", ";

  // Strip or convert raw markdown tables
  if (cleaned.includes("|")) {
    const lines = cleaned.split("\n");
    const formattedLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip separator rows like |---|---| or |:---:|
      if (/^\|?[\s-:]+\|[\s-:]+(\|[\s-:]+)*\|?$/.test(trimmed)) {
        continue;
      }
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const cells = trimmed
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length > 0) {
          formattedLines.push(cells.join(separator));
          continue;
        }
      }
      formattedLines.push(line);
    }
    cleaned = formattedLines.join("\n");
  }

  // Remove all markdown bold/italic/strikethrough markers (***, **, *, __, _, ~~)
  cleaned = cleaned.replace(/[*_~]{1,3}/g, "");

  // Remove markdown headers (#, ##, ###, etc.) and blockquotes (>)
  cleaned = cleaned.replace(/^[ \t]*[#>]+[ \t]*/gm, "");

  // Strip bullet points, dashes, plus signs, and numbered lists at line start
  cleaned = cleaned
    .split("\n")
    .map((line) => {
      let l = line.trim();
      // Strip leading bullets, dashes, pluses, tildes
      l = l.replace(/^[•*+–—\-\s]+/, "");
      // Strip leading numbered list prefixes like "1." or "1)"
      l = l.replace(/^\d+[.)]\s*/, "");
      return l;
    })
    .join("\n");

  // Remove leftover raw table pipe symbols
  cleaned = cleaned.replace(/\|/g, " ");

  // Replace isolated dash separators like " - " with appropriate comma
  cleaned = cleaned.replace(/[ \t]+-[ \t]+/g, separator);

  // Normalize multiple empty lines to max double newline
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return (
    cleaned ||
    fallbackText ||
    (hasArabic
      ? "أنا معاك يا فندم! قولي بتدور على منتج إيه بالظبط أو إيه اللي محتاجه، وهقولك على أحسن ترشيحات من الكتالوج فوراً."
      : "I'm right here to help! Tell me what product you're looking for, and I'll find the best matches from our catalog right away.")
  );
};

export default function ChatWidget({ products = [], mode = "page", sidebarOpen = false }: ChatWidgetProps) {
  const { user } = useAuth();
  const isPageMode = mode === "page";
  const [isOpen, setIsOpen] = useState(isPageMode);
  const [isArabicMode, setIsArabicMode] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [guestFingerprint, setGuestFingerprint] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPageMode) return;

    let active = true;

    const generateFingerprint = async () => {
      const fingerprint = await getGuestFingerprint();
      if (active) {
        setGuestFingerprint(fingerprint);
      }
    };

    void generateFingerprint();

    return () => {
      active = false;
    };
  }, [isPageMode]);

  useEffect(() => {
    if (!isPageMode) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isPageMode]);

  if (!isPageMode) {
    return null;
  }

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Detect language of this message to respond in matching language
    const isArabic = /[\u0600-\u06FF]/.test(trimmed);
    setIsArabicMode(isArabic);

    const userMessage: ChatMessage = {
      id: Date.now(),
      sender: "user",
      text: trimmed,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setErrorMessage("");
    setIsLoading(true);

    try {
      if (!user) {
        const fingerprint = guestFingerprint || (await getGuestFingerprint());
        setGuestFingerprint(fingerprint);

        const status = await getGuestUsageFromSupabase(fingerprint);
        // Block only when the user has fully exhausted their daily quota of user-sent messages
        if (status.messageCount >= MAX_DAILY_MESSAGES_PER_USER) {
          const limitMessage = isArabic
            ? "وصلت للحد الأقصى المجاني (20 رسالة في اليوم).. سجل دخولك عشان تقدر تكمل كلام معانا براحتك يا فندم!"
            : "You have reached the free guest limit of 20 messages per day. Please sign in to continue chatting with us!";
          setErrorMessage(limitMessage);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              sender: "bot",
              text: limitMessage,
              time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            },
          ]);
          return;
        }
      } else {
        const userId = String(user.phone || user.name || "guest-user");
        const status = await getUserUsageFromSupabase(userId);
        // Block only when the user has fully exhausted their daily quota of user-sent messages
        if (status.messageCount >= MAX_DAILY_MESSAGES_PER_USER) {
          const limitMessage = isArabic
            ? "وصلت للحد الأقصى اليومي (20 رسالة).. تقدر تتصفح وتطلب دلوقتي ونكمل كلامنا بكرة يا غالي!"
            : "You have reached your daily limit of 20 messages. Feel free to browse and place orders, and we can continue chatting tomorrow!";
          setErrorMessage(limitMessage);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              sender: "bot",
              text: limitMessage,
              time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            },
          ]);
          return;
        }
      }

      const adminAction = await handleAdminSiteSettingsCommand(trimmed, user);
      if (adminAction.handled) {
        const actionMessage: ChatMessage = {
          id: Date.now() + 1,
          sender: "bot",
          text: adminAction.message || '✅ Live site settings updated successfully.',
          time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, actionMessage]);
        return;
      }

      const matchedCatalog = searchCatalogProducts(products, trimmed);
      const catalog = buildCatalogContext(matchedCatalog.length > 0 ? matchedCatalog : products, trimmed);
      const isCatalogEmpty = products.length === 0;
      const catalogStatusLine = isCatalogEmpty
        ? "CATALOG_STATUS: product catalog is still loading or unavailable; do not claim a product is unavailable until the catalog fetch has completed successfully."
        : matchedCatalog.length === 0
          ? "CATALOG_STATUS: no product in the current catalog matched the request; do not invent or claim availability."
          : `CATALOG_STATUS: using ${Math.min(matchedCatalog.length, 12)} matched catalog items relevant to the current query.`;

      const shouldResearch = shouldUseExternalProductResearch(trimmed);
      const productForResearch = shouldResearch ? resolveProductResearchTarget(products, trimmed) : undefined;
      let externalResearchNote = "EXTERNAL_WEB_RESEARCH: not attempted because the query did not require external product research or no provider is configured.";
      let researchContext = "";

      if (productForResearch && productForResearch.name) {
        const research = await fetchProductWebResearch(productForResearch.name, productForResearch.brand);
        if (research.ok && research.summary) {
          externalResearchNote = `EXTERNAL_WEB_RESEARCH: used the product name "${productForResearch.name}" and brand "${productForResearch.brand || "unknown"}" to gather external information. This does not prove Phermono inventory. Source: ${research.url || research.source || "external search"}. Summary: ${research.summary}`;
          researchContext = buildProductResearchContext(productForResearch, research);
        } else if (research.error) {
          externalResearchNote = `EXTERNAL_WEB_RESEARCH_STATUS: ${research.error}`;
          researchContext = buildProductResearchContext(productForResearch, { ok: false, error: research.error });
        }
      }

      const systemPrompt = `You are PhM Concierge — a helpful, friendly shopping assistant for PherMono. Keep replies concise, human, and in the user's detected language (Egyptian Arabic if Arabic detected; otherwise English). Always:

    - Use the STORE PRODUCT CATALOG as the source of truth for what is actually sold on this website.
    - Use the EXTERNAL_PRODUCT_RESEARCH_CONTEXT only as supporting information when available; do not treat web results as live Phermono inventory.
    - Keep recommendations short (max 2 products) and avoid long lists.
    - Do NOT emit markdown, tables, bullets, or numbered lists; respond as natural chat text.
    - If product matching is ambiguous, ask one short clarifying question.
    - When the request does not match any real catalog product, say so clearly and offer the closest available alternatives from the live catalog instead of inventing items.
    - Never claim that a product exists or is unavailable without checking the catalog first.
    - Keep external research separate from catalog availability and do not invent products, benefits, ingredients, ratings, prices, or stock status from web search results.
    - If the external source is incomplete or conflicting, say so clearly and do not overstate confidence.

    Tone: warm, polite, and conversational (Egyptian Arabic slang when user message is Arabic).

    ${catalogStatusLine}
    ${externalResearchNote}

    EXTERNAL_PRODUCT_RESEARCH_CONTEXT:
    ${researchContext || "No external product research was needed or no trustworthy source was available."}

    STORE PRODUCT CATALOG:
    ${catalog}`;

      const recent = buildGroqMessages(messages, userMessage);
      const requestBody = {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...recent,
        ],
        temperature: 0.5,
        top_p: 0.8,
        max_tokens: 800,
      };

      if (GROQ_API_KEYS.length === 0) {
        throw new Error(
          "Groq API is not configured. Add REACT_APP_GROQ_API_KEY or REACT_APP_GROQ_API_KEYS to your .env file before using the chat assistant."
        );
      }

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < GROQ_API_KEYS.length; attempt += 1) {
        const apiKey = getNextGroqKey();

        if (!apiKey) {
          lastError = new Error(
            "No valid Groq API key is available in the current environment. Please add REACT_APP_GROQ_API_KEY or REACT_APP_GROQ_API_KEYS."
          );
          continue;
        }

        const maskedKey = apiKey ? `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}` : "none";
        console.debug("[Groq fallback] trying API key", {
          attempt: attempt + 1,
          total: GROQ_API_KEYS.length,
          activeKey: maskedKey,
        });

        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (shouldRetryWithNextGroqKey(response.status)) {
            const errorText = await response.text();
            lastError = new Error(
              errorText ||
                (response.status === 429
                  ? "Rate limit exceeded. Retrying with the next Groq key."
                  : `Groq API request failed with status ${response.status}. Retrying with the next Groq key.`)
            );
            console.warn("[Groq fallback] retrying next API key", {
              status: response.status,
              activeKey: maskedKey,
            });
            continue;
          }

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "The Groq API request failed.");
          }

          const data = await response.json();
          const rawText = data?.choices?.[0]?.message?.content ?? "";
          const dynamicFallback = buildDynamicFallback(trimmed, isArabic);
          const reply = rawText || dynamicFallback;

          const botMessage: ChatMessage = {
            id: Date.now() + 1,
            sender: "bot",
            text: formatBotText(reply, dynamicFallback),
            time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          };

          if (!user) {
            const fingerprint = guestFingerprint || (await getGuestFingerprint());
            setGuestFingerprint(fingerprint);
            await incrementGuestUsage(fingerprint);
          } else {
            const userId = String(user.phone || user.name || "guest-user");
            await incrementUserUsage(userId);
          }

          setMessages((prev) => [...prev, botMessage]);
          return;
        } catch (error) {
          if (shouldRetryWithNextGroqKey(undefined, error)) {
            lastError = error instanceof Error ? error : new Error("Groq API request failed. Retrying with the next Groq key.");
            console.warn("[Groq fallback] retrying next API key after request error", {
              activeKey: maskedKey,
              message: lastError.message,
            });
            continue;
          }

          throw error;
        }
      }

      if (lastError) {
        throw lastError;
      }

      throw new Error(
        "Groq API key rotation failed. No usable Groq keys are available. Please check REACT_APP_GROQ_API_KEY or REACT_APP_GROQ_API_KEYS in your environment."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while generating a recommendation.";

      setErrorMessage(message);

      const fallback: ChatMessage = {
        id: Date.now() + 1,
        sender: "bot",
        text: isArabic
          ? "معلش حصلت مشكلة بسيطة في الاتصال دلوقتي.. جرب تسألني تاني كده أو قولي محتاج إيه وأنا هساعدك على طول!"
          : "Sorry, I ran into a brief connection issue. Please try asking again or let me know what you're looking for, and I'll help right away!",
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, fallback]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSend();
    }
  };

  if (mode === "page") {
    return (
      <div className={`w-full bg-brand-cream px-4 py-6 pb-20 ${sidebarOpen ? "pointer-events-none" : "pointer-events-auto"}`}>
        <div className={`mx-auto w-full max-w-3xl rounded-[28px] border border-stone-200 bg-white/95 shadow-[0_25px_60px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl overflow-hidden flex flex-col ${sidebarOpen ? "pointer-events-none" : "pointer-events-auto"}`} style={{ minHeight: "calc(100dvh - 160px)" }}>
          <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-gradient-to-r from-brand-black via-brand-charcoal to-stone-900 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/20 text-brand-gold ring-1 ring-brand-gold/40">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-base font-semibold">PhM Concierge</p>
                <p className="text-[10px] tracking-wider text-stone-300">مساعد التسوق الذكي</p>
              </div>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-stone-50 px-4 py-5">
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    dir="auto"
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                      message.sender === "user"
                        ? "bg-brand-black text-white"
                        : "border border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    <p className="whitespace-pre-line break-words">{message.text}</p>
                    <span className={`mt-1 block text-[10px] ${message.sender === "user" ? "text-stone-300" : "text-stone-400"}`}>
                      {message.time}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
                      <span>{isArabicMode ? "بيفكر في أحسن ترشيح..." : "Finding the best recommendations..."}</span>
                    </div>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
                    {errorMessage}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-stone-200 bg-white p-3">
            <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-2 py-2 shadow-inner">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isArabicMode ? "اسأل عن أي منتج أو روتين لشعرك أو بشرتك..." : "Ask about any hair, skin, or beauty product..."}
                dir="auto"
                className="flex-1 border-0 bg-transparent px-3 py-1.5 text-sm max-md:text-base text-stone-700 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed"
                style={{ fontSize: '16px' }}
                aria-label="Type your message"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isLoading}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold text-brand-black shadow-sm transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50 touch-target"
                aria-label="Send message"
              >
                <SendHorizonal size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-chat-widget className="fixed bottom-6 left-6 z-[30] pointer-events-none max-md:bottom-[calc(5.75rem+env(safe-area-inset-bottom))] max-md:left-3 max-md:right-auto">
      <div data-chat-panel-wrapper className={`pointer-events-none transition-all duration-300 ${isOpen ? "pointer-events-auto opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"} z-[30]`}>
        <div
          data-chat-panel
          className="mb-4 w-[22rem] max-md:fixed max-md:top-[calc(var(--header-height,64px)+0.5rem)] max-md:right-3 max-md:left-auto max-md:w-[min(270px,calc(100vw-24px))] max-md:max-w-[calc(100vw-24px)] max-md:max-h-[calc(100dvh-104px)] max-md:overflow-hidden overflow-hidden rounded-[28px] border border-stone-200 bg-white/95 shadow-[0_25px_60px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:w-[24rem] max-md:rounded-[22px] max-md:flex max-md:flex-col"
          style={{ maxHeight: "calc(100dvh - 104px)", top: "calc(var(--header-height,64px) + 0.5rem)" }}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-gradient-to-r from-brand-black via-brand-charcoal to-stone-900 px-3 py-2.5 text-white max-md:px-3 max-md:py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold/20 text-brand-gold ring-1 ring-brand-gold/40">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold">PhM Concierge</p>
                <p className="text-[10px] tracking-wider text-stone-300">مساعد التسوق الذكي</p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-stone-200 transition hover:bg-white/20 hover:text-white touch-target"
            >
              <X size={16} />
            </button>
          </header>

          <div ref={scrollRef} className="h-72 overflow-y-auto bg-stone-50 px-3 py-4 sm:h-80 max-md:flex-1 max-md:min-h-0 max-md:h-auto max-md:max-h-[calc(100dvh-200px)] max-md:p-2 max-md:py-2">
            <div className="space-y-3 max-md:space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    dir="auto"
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm max-md:text-[11px] max-md:py-1.5 max-md:px-2.5 ${
                      message.sender === "user"
                        ? "bg-brand-black text-white"
                        : "border border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    <p className="whitespace-pre-line break-words">{message.text}</p>
                    <span
                      className={`mt-1 block text-[10px] max-md:text-[9px] ${
                        message.sender === "user" ? "text-stone-300" : "text-stone-400"
                      }`}
                    >
                      {message.time}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
                      <span>{isArabicMode ? "بيفكر في أحسن ترشيح..." : "Finding the best recommendations..."}</span>
                    </div>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
                    {errorMessage}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-stone-200 bg-white p-3 max-md:p-2.5 max-md:shrink-0">
            <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-2 py-2 shadow-inner max-md:px-1.5 max-md:py-1.5 max-md:min-h-[44px]">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isArabicMode ? "اسأل عن أي منتج أو روتين لشعرك أو بشرتك..." : "Ask about any hair, skin, or beauty product..."}
                dir="auto"
                className="flex-1 border-0 bg-transparent px-3 py-1.5 text-sm max-md:text-base text-stone-700 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed"
                style={{ fontSize: '16px' }}
                aria-label="Type your message"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isLoading}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold text-brand-black shadow-sm transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <SendHorizonal size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        data-chat-toggle
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className="group relative z-[40] flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold via-amber-400 to-yellow-500 text-brand-black shadow-[0_18px_40px_-12px_rgba(234,179,8,0.75)] transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-brand-gold/30 pointer-events-auto max-md:h-14 max-md:w-14 touch-target"
      >
        <span className="absolute inset-0 rounded-full animate-pulse bg-brand-gold/30" />
        <span className="absolute inset-1 rounded-full border border-brand-black/10 bg-white/10" />
        <MessageCircleMore size={24} className="relative z-10" />
      </button>
    </div>
  );
}
