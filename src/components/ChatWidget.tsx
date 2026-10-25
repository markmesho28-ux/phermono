import React, { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabase";
import { MessageCircleMore, SendHorizonal, Sparkles, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { normalizeSingleActiveOfferState, parseSitePromoCommand } from "../contexts/DataContext";
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
  catalogLoading?: boolean;
  catalogError?: string | null;
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

const getGroqApiKeys = (): string[] => resolveGroqApiKeys();
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

const getNextGroqKey = (groqApiKeys: string[]) => {
  if (!groqApiKeys || groqApiKeys.length === 0) return "";
  const key = groqApiKeys[groqKeyIndex % groqApiKeys.length];
  groqKeyIndex = (groqKeyIndex + 1) % groqApiKeys.length;
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

const isUserAuthorizedAdmin = async (currentUser?: any): Promise<boolean> => {
  if (currentUser && (checkIsAdminRole(currentUser) || isAdminPhone(currentUser.phone))) {
    return true;
  }

  if (!supabase) {
    return false;
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return false;
    }

    const authUser = authData.user as any;
    if (checkIsAdminRole(authUser)) {
      return true;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      return false;
    }

    return Boolean(profile && checkIsAdminRole(profile));
  } catch {
    return false;
  }
};

export const handleAdminSiteSettingsCommand = async (message: string, currentUser?: any) => {
  const looksLikeAdminIntent = looksLikeAdminCommandIntent(message);
  const isAdmin = await isUserAuthorizedAdmin(currentUser);

  if (!isAdmin || !looksLikeAdminIntent) {
    return { handled: false, message: '' };
  }

  const normalized = String(message ?? '').trim();
  const invalidPercentMessage = (() => {
    const raw = normalized.toLowerCase();
    const percentPattern = /(?:make\s+(?:a\s+)?)?(?:\d{1,3}\s*%\s*(?:off|discount|sale|offer)|(?:discount|offer|sale|off)\s*(?:on|for)?\s*(?:all\s+orders|all\s+products|everything|all\s+items|the\s+store)?\s*\d{1,3}\s*(?:%|٪))/i;
    if (!percentPattern.test(raw)) return null;

    const extracted = (() => {
      const match = normalized.match(/(?:make\s+(?:a\s+)?)?(\d{1,3})\s*(?:%|٪)\s*(?:off|discount|sale|offer)/i)
        || normalized.match(/(?:discount|offer|sale|off)\s*(?:on|for)?\s*(?:all\s+orders|all\s+products|everything|all\s+items|the\s+store)?\s*(\d{1,3})\s*(?:%|٪)/i)
        || normalized.match(/(\d{1,3})\s*(?:%|٪)/i);
      if (!match) return null;
      const value = Number(String(match[1] ?? match[0] ?? '').replace(/[^0-9]/g, ''));
      return Number.isFinite(value) ? value : null;
    })();

    if (extracted !== null && extracted >= 1 && extracted <= 100) {
      return null;
    }

    return 'Please send a valid percentage between 1 and 100, for example: "make a 60% off".';
  })();

  if (invalidPercentMessage) {
    return { handled: true, message: invalidPercentMessage };
  }

  const updates = normalizeSingleActiveOfferState(parseSitePromoCommand(message));
  if (!updates || Object.keys(updates).length === 0) {
    return { handled: false, message: '' };
  }

  if (!supabase) {
    return { handled: true, message: 'Supabase is not configured for live site updates. No database write was attempted.' };
  }

  try {
    const { data: existingRow, error: existingSettingsError } = await supabase
      .from('site_settings')
      .select('*')
      .eq('key', 'site_config')
      .maybeSingle();

    if (existingSettingsError) {
      console.warn('Admin site settings read failed:', existingSettingsError.message || existingSettingsError);
      return { handled: true, message: 'I could not verify the current offer state. No changes were made.' };
    }

    const currentValue = existingRow && existingRow.value && typeof existingRow.value === 'object' ? existingRow.value : {};
    const currentWithoutBanner = (({ promo_banner_text: _ignoredPromoBannerText, ...rest }) => rest)(currentValue as Record<string, any>);
    const normalizedUpdates = normalizeSingleActiveOfferState(updates);
    const { promo_banner_text: _ignoredPromoBannerText, ...promoSafeUpdates } = normalizedUpdates;
    const requestedOffer = String(normalizedUpdates.active_promo ?? normalizedUpdates.promo_rule ?? 'none').trim().toLowerCase();
    const currentOffer = String(normalizeSingleActiveOfferState(currentValue).active_promo ?? normalizeSingleActiveOfferState(currentValue).promo_rule ?? 'none').trim().toLowerCase();
    const hasActiveOffer = !!currentOffer && currentOffer !== 'none' && currentOffer !== 'cancelled' && currentOffer !== 'canceled';
    const isCancellationRequest = requestedOffer === 'none' || /^(none|لا عرض|لا توجد عروض|cancelled|canceled|cancelled promo|مسح|إلغاء)$/i.test(String(requestedOffer || ''));
    const isActivationRequest = !isCancellationRequest && !!requestedOffer && requestedOffer !== 'none';

    if (isActivationRequest && hasActiveOffer) {
      return {
        handled: true,
        message: 'A promotion is already active. Cancel the current offer before creating a new one.'
      };
    }

    if (isCancellationRequest && !hasActiveOffer) {
      return {
        handled: true,
        message: 'There is no active offer to cancel.'
      };
    }

    const nextValue = normalizeSingleActiveOfferState(isCancellationRequest
      ? {
          ...currentWithoutBanner,
          active_promo: 'none',
          promo_rule: 'none',
          promo_discount_percent: 0,
          is_free_shipping_active: false,
          buy_x: 0,
          get_y: 0,
        }
      : {
          ...currentWithoutBanner,
          ...promoSafeUpdates,
        }
    );

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

    if (normalizedUpdates.active_promo === 'none' && normalizedUpdates.is_free_shipping_active === false) {
      return {
        handled: true,
        message: isArabicMessage
          ? 'تم إلغاء العرض النشط بنجاح. لا يوجد عرض نشط الآن.'
          : '✅ The active offer was cancelled successfully. There is no active offer right now.'
      };
    }

    if (typeof normalizedUpdates.free_shipping_threshold === 'number' && normalizedUpdates.free_shipping_threshold > 0 && normalizedUpdates.is_free_shipping_active === true) {
      const thresholdMessage = isArabicMessage
        ? `تم تحديث إعدادات الموقع بنجاح: الشحن المجاني أصبح مفعل للطلبات فوق ${normalizedUpdates.free_shipping_threshold} جنيه`
        : `✅ Live site settings updated successfully: free shipping is now active for orders over ${normalizedUpdates.free_shipping_threshold} EGP`;
      return { handled: true, message: thresholdMessage };
    }

    if (typeof normalizedUpdates.is_free_shipping_active === 'boolean') summary.push(isArabicMessage ? `الشحن المجاني: ${normalizedUpdates.is_free_shipping_active ? 'مفعل' : 'غير مفعل'}` : `free shipping: ${normalizedUpdates.is_free_shipping_active ? 'enabled' : 'disabled'}`);
    if (typeof normalizedUpdates.promo_discount_percent === 'number' && normalizedUpdates.promo_discount_percent > 0) summary.push(isArabicMessage ? `الخصم: ${normalizedUpdates.promo_discount_percent}%` : `discount: ${normalizedUpdates.promo_discount_percent}%`);
    if (normalizedUpdates.active_promo && normalizedUpdates.active_promo !== 'none') summary.push(isArabicMessage ? `العرض النشط: ${normalizedUpdates.active_promo}` : `active promo: ${normalizedUpdates.active_promo}`);

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

const SEARCH_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "from", "into", "about", "this", "that", "these",
  "those", "what", "when", "where", "why", "how", "i", "you", "we", "they", "them", "our", "your",
  "my", "to", "of", "want", "need", "looking", "wanting", "something", "please", "can", "could", "help",
  "which", "see", "know", "tell", "give", "show", "look", "search", "any",
  "عايز", "عايزة", "عايزه", "عايزين", "حاجة", "محتاج", "محتاجه", "محتاجين", "طب", "لـ", "على", "في",
  "من", "ال", "وال", "و", "ب", "ك", "ل", "ا", "اي", "اى", "ه", "هو", "هي", "عن", "لو", "لوحد",
  "بخصوص", "product", "منتج", "مادة", "شي", "حاجه"
]);

// ─── Semantic expansion map ──────────────────────────────────────────────────
// Maps colloquial Arabic/English expressions to standard product-search concepts.
// Values are arrays of search concepts that will be injected into the search query.
const SEMANTIC_EXPANSION: Record<string, string[]> = {
  // ── Frizz / unruly hair ──────────────────────────────────────────────────
  "هايش":      ["frizzy", "frizz", "anti-frizz", "smoothing", "keratin"],
  "هايشة":     ["frizzy", "frizz", "anti-frizz", "smoothing", "keratin"],
  "هايشه":     ["frizzy", "frizz", "anti-frizz", "smoothing", "keratin"],
  "فريزي":     ["frizzy", "frizz", "anti-frizz"],
  frizzy:       ["frizz control", "anti-frizz", "smoothing", "keratin"],
  frizz:        ["frizz control", "anti-frizz", "smoothing"],

  // ── Acne / pimples ───────────────────────────────────────────────────────
  "حبوب":      ["acne", "pimples", "breakouts", "cleanser", "acne treatment", "oily skin"],
  "بثور":      ["acne", "pimples", "breakouts", "cleanser", "acne treatment"],
  "اكني":      ["acne", "pimples", "cleanser"],
  acne:         ["acne treatment", "cleanser", "oily skin"],
  breakouts:    ["acne", "cleanser", "acne treatment"],
  pimples:      ["acne", "pimples", "cleanser"],

  // ── Face / skin ──────────────────────────────────────────────────────────
  "وش":        ["face", "facial", "skin", "skincare"],
  "وشي":       ["face", "facial", "skin", "skincare"],
  "وشك":       ["face", "facial", "skin", "skincare"],
  "وجه":       ["face", "facial", "skin"],
  "وجهي":      ["face", "facial", "skin"],
  "بشرة":      ["skin", "skincare", "face"],
  "بشرتي":     ["skin", "skincare", "face"],
  "بشرتك":     ["skin", "skincare", "face"],

  // ── Moisturize / hydrate ─────────────────────────────────────────────────
  "ترطب":      ["moisturize", "hydrate", "moisturizer"],
  "ترطيب":     ["moisturize", "hydrate", "moisturizer"],
  "رطب":       ["moisturize", "moisturizer", "hydrating"],
  "مرطب":      ["moisturizer", "hydrating", "moisturize"],
  "رطوبة":     ["moisturizer", "hydrating"],
  "ناشف":      ["dry", "hydrating", "moisturizer"],
  "جاف":       ["dry", "hydrating", "moisturizer"],
  "جافة":      ["dry", "hydrating", "moisturizer"],
  moisturize:   ["moisturizer", "hydrating", "hydration"],
  hydrate:      ["moisturizer", "hydrating"],

  // ── Leave-in / post-shower products ─────────────────────────────────────
  "ليف ان":    ["leave-in", "leave in conditioner", "hair treatment"],
  "ليف-ان":    ["leave-in", "leave in conditioner", "hair treatment"],
  "ليف":       ["leave-in", "leave in", "hair treatment"],
  "تفضل على":  ["leave-in", "leave on", "hair treatment"],
  "بعد الشاور":["leave-in", "post-shower", "hair treatment"],
  "بعد الاستحمام": ["leave-in", "post-shower", "hair treatment"],
  "leave-in":   ["leave in conditioner", "hair treatment", "post-shower"],
  "leave in":   ["leave in conditioner", "hair treatment"],

  // ── Oily hair / scalp ────────────────────────────────────────────────────
  "دهني":      ["oily", "oil control", "mattifying", "oily hair", "oily scalp"],
  "دهنية":     ["oily", "oil control", "oily hair", "oily scalp"],
  "دهن":       ["oily", "oil control"],
  "دهنى":      ["oily", "oil control", "oily hair", "oily scalp"],
  oily:         ["oil control", "mattifying", "oily scalp"],

  // ── Dandruff ─────────────────────────────────────────────────────────────
  "قشرة":      ["dandruff", "anti-dandruff", "flaky scalp"],
  dandruff:     ["anti-dandruff", "flaky scalp"],

  // ── Hair loss / thinning ─────────────────────────────────────────────────
  "تساقط":     ["hair loss", "hair fall", "anti-hair loss"],
  "سقوط الشعر":["hair loss", "hair fall"],
  "hair loss":  ["anti-hair loss", "hair fall"],

  // ── Glow / brightening ───────────────────────────────────────────────────
  "نضارة":     ["glow", "brightening", "vitamin c", "radiance"],
  "بريق":      ["glow", "brightening", "radiance"],

  // ── Wrinkles / anti-aging ────────────────────────────────────────────────
  "تجاعيد":    ["wrinkles", "anti-aging", "retinol", "anti-wrinkle"],
  "كبر":       ["anti-aging", "retinol", "wrinkles"],

  // ── Pores ────────────────────────────────────────────────────────────────
  "مسام":      ["pores", "pore minimizing", "pore control"],

  // ── Cleansing (face / skin) ──────────────────────────────────────────────
  "تنظيف البشرة": ["cleanser", "face wash", "facial cleanser"],
  "تنظف البشرة":  ["cleanser", "face wash", "facial cleanser"],
  "تنظف الوجه":   ["cleanser", "face wash", "facial cleanser"],
  "غسول":      ["cleanser", "face wash"],

  // ── Curly hair ───────────────────────────────────────────────────────────
  "كيرلي":     ["curly", "curl", "curl enhancing", "frizz"],
  "كيرل":      ["curly", "curl", "curl enhancing"],
  curly:        ["curl enhancing", "frizz", "curl"],

  // ── Budget / price intent ────────────────────────────────────────────────
  "مش غالية":  ["cheap", "budget", "affordable"],
  "مش غالي":   ["cheap", "budget", "affordable"],
  "بالرخيص":   ["cheap", "affordable", "budget"],
  "كويسة":     ["good", "quality"],
  "كويس":      ["good", "quality"],
  affordable:   ["cheap", "budget"],
  budget:       ["cheap", "affordable"],

  // ── Brand transliterations ───────────────────────────────────────────────
  "سيرافي":    ["cerave"],
  "سيراف":     ["cerave"],
  "سيرافيه":   ["cerave"],
  "لاروش":     ["la roche", "la roche-posay"],
  "بيوديرما":  ["bioderma"],
  "نيتروجينا": ["neutrogena"],
  "جارنييه":   ["garnier"],
  "هيد اند شولدرز": ["head and shoulders", "head & shoulders"],
  "اوجيكس":   ["ogx"],

  // ── Follow-up signal words ───────────────────────────────────────────────
  "أي نوع":    [],
  "وريني":     [],
  "المتاح":    [],
  "أرخص":      ["cheap"],
  "أغلى":      ["expensive"],
  "تاني":      [],
  "كمان":      [],
};

// ─── IntentSignals type ────────────────────────────────────────────────────
export interface IntentSignals {
  productConcepts: string[];
  bodyArea: string[];
  concern: string[];
  priceIntent: 'cheap' | 'expensive' | null;
  priceRange: { min?: number; max?: number } | null;
  brand: string | null;
  isFollowUp: boolean;
  followUpContext: string;
  language: 'ar' | 'en' | 'mixed';
}

// ─── extractIntentSignals ─────────────────────────────────────────────────
export const extractIntentSignals = (
  message: string,
  conversationHistory?: Array<{ sender: 'user' | 'bot'; text: string }>
): IntentSignals => {
  const text = String(message ?? '').trim();
  // Normalize Arabic alef variants for matching
  const normalizedText = text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

  // Language detection
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasLatin  = /[a-zA-Z]/.test(text);
  const language: 'ar' | 'en' | 'mixed' = hasArabic && hasLatin ? 'mixed' : hasArabic ? 'ar' : 'en';

  // Follow-up detection - use normalizedText for Arabic phrases, regex for English
  // normalizedText has أ→ا, ة→ه, ى→ي applied
  const normForFollowUp = normalizedText; // alias for clarity
  const followUpArabicPhrases = [
    // raw form → also check normalized form
    'اي نوع', 'وريني', 'المتاح', 'فيه تاني', 'مش فارقه', 'اللي عندك', 'اللي متاح',
    'عايز حاجه ارخص', 'عايز حاجه اغلي', 'برضو', 'وبعدين',
    // keep original forms too (in case no normalization needed)
    'أي نوع', 'مش فارقة', 'عايز حاجة أرخص', 'عايز حاجة أغلى',
  ];
  const followUpEnglishPattern = /\b(which one|show me more|show me all|any other|cheaper|more expensive|another|similar)\b/i;
  const isFollowUp = followUpArabicPhrases.some(p => normForFollowUp.includes(p) || text.includes(p)) ||
    followUpEnglishPattern.test(text);

  let followUpContext = '';
  if (isFollowUp && conversationHistory && conversationHistory.length > 0) {
    const userMessages = conversationHistory.filter(m => m.sender === 'user');
    const lastMeaningful = userMessages.slice().reverse().find(m => {
      const mNorm = m.text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      return !followUpArabicPhrases.some(p => mNorm.includes(p) || m.text.includes(p)) &&
        !followUpEnglishPattern.test(m.text);
    });
    if (lastMeaningful) followUpContext = lastMeaningful.text;
  }

  // Price intent — match on normalizedText (alef/teh marbuta/alef maqsura normalised)
  // cheap patterns: ارخص, رخيص, رخيصه, اقل, مش غالي, مش غاليه, بالرخيص
  // expensive patterns: اغلي (= أغلى normalized), غالي, غاليه, غالي
  let priceIntent: 'cheap' | 'expensive' | null = null;
  if (/(cheap|cheapest|lowest|affordable|budget)/i.test(text) ||
      /ارخص|رخيص|رخيصه|اقل|مش غالي|مش غاليه|بالرخيص/.test(normalizedText)) {
    priceIntent = 'cheap';
  } else if (/(expensive|highest|most expensive|priciest)/i.test(text) ||
      /اغلي|غالي|غاليه/.test(normalizedText)) {
    priceIntent = 'expensive';
  }

  // Price range — look for patterns like "under 200", "أقل من 300", "between 100 and 500"
  let priceRange: { min?: number; max?: number } | null = null;
  const underMatch = text.match(/(?:under|less than|أقل من|تحت)\s*(\d+)/i);
  const aboveMatch = text.match(/(?:above|more than|over|أكتر من|فوق)\s*(\d+)/i);
  const betweenMatch = text.match(/(?:between|بين)\s*(\d+)\s*(?:and|و|to)\s*(\d+)/i);
  if (betweenMatch) {
    priceRange = { min: Number(betweenMatch[1]), max: Number(betweenMatch[2]) };
  } else if (underMatch || aboveMatch) {
    priceRange = {};
    if (underMatch) priceRange.max = Number(underMatch[1]);
    if (aboveMatch) priceRange.min = Number(aboveMatch[1]);
  }

  // Brand detection
  const knownBrands = [
    "cerave", "garnier", "neutrogena", "la roche-posay", "bioderma", "ogx", "tresemme",
    "head and shoulders", "head & shoulders", "himalaya", "clary", "phermono",
    "سيرافي", "لاروش", "بيوديرما", "جارنييه", "نيتروجينا",
  ];
  const lowerText = text.toLowerCase();
  const brand = knownBrands.find(b => lowerText.includes(b) || text.includes(b)) ?? null;

  // Body area detection — use includes() for Arabic terms, regex for Latin
  const bodyArea: string[] = [];
  if (/\b(hair|shampoo|conditioner|scalp)\b/i.test(text) || /شعر|فروة|شامبو|بلسم/.test(text)) bodyArea.push('hair');
  if (/\b(face|facial|skin)\b/i.test(text) || /وجه|وش|بشرة/.test(text)) bodyArea.push('face');
  if (/\b(body)\b/i.test(text) || /جسم|جلد/.test(text)) bodyArea.push('body');
  if (/\b(lip|lips)\b/i.test(text) || /شفايف|شفاه/.test(text)) bodyArea.push('lips');

  // Concern detection — same approach: Latin uses \b, Arabic uses includes-style regex without \b
  const concern: string[] = [];
  if (/\b(frizzy|frizz)\b/i.test(text) || /هايش|هايشة/.test(text)) concern.push('frizzy');
  if (/\b(oily)\b/i.test(text) || /دهني|دهنية/.test(text)) concern.push('oily');
  if (/\b(dry)\b/i.test(text) || /ناشف|جاف|جافة/.test(text)) concern.push('dry');
  if (/\b(acne|breakouts|pimples)\b/i.test(text) || /حبوب|بثور/.test(text)) concern.push('acne');
  if (/\b(dandruff)\b/i.test(text) || /قشرة/.test(text)) concern.push('dandruff');
  if (/\b(thinning|hair loss)\b/i.test(text) || /تساقط/.test(text)) concern.push('hair loss');
  if (/\b(wrinkles|aging)\b/i.test(text) || /تجاعيد/.test(text)) concern.push('anti-aging');
  if (/\b(glow|brightening)\b/i.test(text) || /نضارة/.test(text)) concern.push('brightening');
  if (/\b(pores)\b/i.test(text) || /مسام/.test(text)) concern.push('pores');
  if (/\b(curly|curl)\b/i.test(text) || /كيرلي/.test(text)) concern.push('curly');
  if (/moistur|hydrat/i.test(text) || /ترطب|ترطيب|مرطب/.test(text)) concern.push('moisturizing');
  if (/\b(sensitive)\b/i.test(text) || /حساسة|حساس/.test(text)) concern.push('sensitive');

  // Product concepts via semantic expansion map + literal product-type keywords
  const productConceptsSet = new Set<string>();

  // Scan the full message against every SEMANTIC_EXPANSION key
  for (const [key, expansions] of Object.entries(SEMANTIC_EXPANSION)) {
    if (text.includes(key) || lowerText.includes(key.toLowerCase())) {
      expansions.forEach(e => productConceptsSet.add(e));
    }
  }

  // Also detect literal category keywords in Latin script
  const categoryKeywords = [
    "shampoo", "conditioner", "serum", "cleanser", "moisturizer", "mask",
    "cream", "oil", "balm", "sunscreen", "lip", "gloss", "body milk",
    "leave-in", "treatment", "toner", "exfoliant",
  ];
  for (const kw of categoryKeywords) {
    if (lowerText.includes(kw)) productConceptsSet.add(kw);
  }

  // And Arabic literal product type keywords
  const arProductKeywords: Record<string, string> = {
    "شامبو": "shampoo",
    "بلسم": "conditioner",
    "كونديشنر": "conditioner",
    "سيروم": "serum",
    "كريم": "cream",
    "ماسك": "mask",
    "مرطب": "moisturizer",
    "غسول": "cleanser",
    "واقي شمس": "sunscreen",
    "زيت": "oil",
  };
  for (const [ar, en] of Object.entries(arProductKeywords)) {
    if (text.includes(ar)) productConceptsSet.add(en);
  }

  return {
    productConcepts: Array.from(productConceptsSet),
    bodyArea,
    concern,
    priceIntent,
    priceRange,
    brand,
    isFollowUp,
    followUpContext,
    language,
  };
};

const GENERIC_SEARCH_ALIASES: Record<string, string> = {
  body: "body", bodi: "body", boddy: "body", badi: "body", bodu: "body", boody: "body", boudy: "body",
  "بادي": "body", "بودي": "body", "بدي": "body",
  bodymilk: "body milk", milk: "milk", milek: "milk", milik: "milk", "ميلك": "milk", "مليك": "milk", "ميك": "milk",
  cream: "cream", creme: "cream", krem: "cream", "كريم": "cream", "كريمه": "cream", "كرم": "cream",
  clary: "clary", "كلاري": "clary", "كيلاري": "clary",
  shampoo: "shampoo", shampu: "shampoo", "شامبو": "shampoo", "شامپو": "shampoo", "شامب": "shampoo",
  conditioner: "conditioner", condition: "conditioner", konditioner: "conditioner", kondishner: "conditioner",
  "بلسم": "conditioner", "كونديشنر": "conditioner", "كنديشنر": "conditioner", "كندشنر": "conditioner",
  serum: "serum", serom: "serum", "سيروم": "serum", "سيرم": "serum", "سرم": "serum", "سروم": "serum",
  moisturizer: "moisturizer", moisturize: "moisturizer", moisturise: "moisturizer", hydrating: "moisturizer",
  hydrate: "moisturizer", hydration: "moisturizer", hydrator: "moisturizer", "مرطب": "moisturizer",
  "رطب": "moisturizer", "مُرطب": "moisturizer", "رطوبة": "moisturizer",
  mask: "mask", masque: "mask", "ماسك": "mask", cleanser: "cleanser", wash: "cleanser", foam: "cleanser",
  "غسول": "cleanser", "غسيل": "cleanser", "كلينسر": "cleanser", sunscreen: "sunscreen", sunblock: "sunscreen",
  suncream: "sunscreen", "واقي شمس": "sunscreen", "sun cream": "sunscreen", "sun block": "sunscreen",
  lip: "lip", lips: "lip", lipcare: "lip", "شفايف": "lip", "شفاه": "lip", "ليب": "lip",
  balm: "balm", salve: "balm", balsam: "balm", "بالم": "balm", "بلم": "balm", "لبم": "balm",
  gloss: "gloss", glossy: "gloss", shine: "gloss", shiny: "gloss", "بريق": "gloss", "لمعان": "gloss", "ألوان": "gloss",
  oil: "oil", oils: "oil", "أويل": "oil", "زيت": "oil", hair: "hair", "شعر": "hair", dry: "dry", "جاف": "dry",
  skin: "skin", "بشرة": "skin", "وجه": "skin", face: "skin", "مكياج": "makeup",
  expensive: "expensive", "اغلى": "expensive", "اغلي": "expensive", "غلى": "expensive", "غلي": "expensive",
  "غالي": "expensive", "غالى": "expensive", "غاليه": "expensive", "غالية": "expensive",
  cheap: "cheap", "ارخص": "cheap", "رخص": "cheap", "رخيص": "cheap", "رخيصة": "cheap", "اقل": "cheap", "أقل": "cheap"
};

const normalizeCatalogToken = (token: string): string => {
  const trimmed = String(token ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  const withoutPunctuation = trimmed.replace(/[\p{P}\p{S}]/gu, "");
  if (!withoutPunctuation) return "";

  const normalized = withoutPunctuation
    .replace(/[أإآ]/g, "ا")
    .replace(/ة$/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (GENERIC_SEARCH_ALIASES[normalized]) return GENERIC_SEARCH_ALIASES[normalized];
  if (GENERIC_SEARCH_ALIASES[normalized.replace(/s$/, "")]) return GENERIC_SEARCH_ALIASES[normalized.replace(/s$/, "")];

  return normalized
    .replace(/^(ال|لل|لـ|ب|ك|و|ف|ا|ي)+/g, "")
    .replace(/(ة|ه)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeCatalogMatchText = (value: string): string => {
  if (!value) return "";

  const raw = String(value)
    .normalize("NFKC")
    .replace(/&/g, " and ")
    .replace(/[\u0640\u0610-\u061A\u064B-\u065F]/g, "")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[\u200C\u200D]/g, "")
    .replace(/[™®©℠]/gi, " ")
    .replace(/\b([a-z0-9]+)tm\b/gi, "$1")
    .replace(/[_-]+/g, " ")
    .toLowerCase();

  const tokens = raw
    .replace(/[\p{P}\p{S}]/gu, " ")
    .split(/\s+/)
    .map(normalizeCatalogToken)
    .filter(Boolean);

  const cleaned = tokens
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
    .join(" ");

  return cleaned.replace(/\s+/g, " ").trim();
};

const getCatalogMatchTokens = (value: string): string[] => {
  const normalized = normalizeCatalogMatchText(value);
  if (!normalized) return [];

  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
  ));
};

// Business semantics in the app: `selling_price` is the live selling price, `market_price`
// is the reference/original price, and legacy `price` is only a fallback when newer fields are absent.
const getEffectiveProductPrice = (product: Partial<Product> | any): number | null => {
  const candidates = [
    product?.sellingPrice,
    product?.selling_price,
    product?.marketPrice,
    product?.market_price,
    product?.price,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
};

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const matrix: number[][] = Array.from({ length: left.length + 1 }, (_, rowIndex) => [rowIndex]);
  matrix[0] = Array.from({ length: right.length + 1 }, (_, columnIndex) => columnIndex);

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[left.length][right.length];
};

const getCategoryLikeMatchScore = (queryTokens: string[], fieldText: string): number => {
  const tokens = getCatalogMatchTokens(fieldText);
  if (tokens.length === 0) return 0;

  let score = 0;
  const shared = queryTokens.filter((token) => tokens.includes(token));
  score += shared.length * 25;

  const fuzzyMatches = queryTokens.filter((token) => {
    if (token.length < 3) return false;
    return tokens.some((candidate) => {
      if (token === candidate) return false;
      return levenshteinDistance(token, candidate) <= 1 || candidate.startsWith(token) || token.startsWith(candidate);
    });
  });
  score += fuzzyMatches.length * 12;
  return score;
};

export const searchCatalogProducts = (
  products: Product[] = [],
  query = "",
  conversationHistory?: Array<{ sender: 'user' | 'bot'; text: string }>
) => {
  if (!Array.isArray(products) || products.length === 0) return [];

  const trimmedQuery = String(query ?? "").trim();
  if (!trimmedQuery) {
    return products.slice(0, 10);
  }

  // ── 1. Extract semantic intent signals ──────────────────────────────────
  const intentSignals = extractIntentSignals(trimmedQuery, conversationHistory);

  // ── 2. When this is a follow-up, resolve the context query from history ─
  let effectiveQuery = trimmedQuery;
  if (intentSignals.isFollowUp && intentSignals.followUpContext) {
    // Combine the prior topic with any price/modifier in the follow-up
    const priceModifier = intentSignals.priceIntent === 'cheap' ? ' cheap' :
                          intentSignals.priceIntent === 'expensive' ? ' expensive' : '';
    effectiveQuery = `${intentSignals.followUpContext}${priceModifier}`;
  }

  // ── 3. Build expanded query tokens ──────────────────────────────────────
  const normalizedQuery = normalizeCatalogMatchText(effectiveQuery);
  if (!normalizedQuery) {
    return products.slice(0, 10);
  }

  const baseQueryTokens = getCatalogMatchTokens(normalizedQuery);

  // Inject semantic concepts as additional tokens
  const semanticTokenSet = new Set<string>(baseQueryTokens);

  for (const concept of intentSignals.productConcepts) {
    getCatalogMatchTokens(concept).forEach(t => semanticTokenSet.add(t));
  }
  for (const area of intentSignals.bodyArea) {
    semanticTokenSet.add(area);
  }
  for (const c of intentSignals.concern) {
    getCatalogMatchTokens(c).forEach(t => semanticTokenSet.add(t));
  }
  if (intentSignals.brand) {
    getCatalogMatchTokens(intentSignals.brand).forEach(t => semanticTokenSet.add(t));
  }

  const queryTokens = Array.from(semanticTokenSet).filter(t => t.length > 1);

  // Detect whether semantic signals were injected beyond the raw query
  const hasSemanticExpansion = queryTokens.some(t => !baseQueryTokens.includes(t));

  const isPriceHighIntent = /(expensive|highest|most expensive|priciest|اغلى|غالي|غالية|غالى)/.test(normalizedQuery) ||
    intentSignals.priceIntent === 'expensive';
  const isPriceLowIntent = /(cheap|cheapest|lowest|ارخص|رخيص|اقل|أقل)/.test(normalizedQuery) ||
    intentSignals.priceIntent === 'cheap';
  const isPriceIntent = isPriceHighIntent || isPriceLowIntent;
  const isDryHairIntent = /(dry.*hair|hair.*dry|جاف.*شعر|شعر.*جاف|dry.*scalp|damaged.*hair)/.test(normalizedQuery);
  const genericCategoryTerms = new Set(["shampoo", "conditioner", "serum", "cleanser", "sunscreen", "oil", "balm", "lip", "gloss", "moisturizer", "mask", "cream", "hair", "skin", "leave-in", "treatment", "anti-frizz", "frizz"]);
  const allGenericQueryTerms = queryTokens.length > 0 && queryTokens.every((token) => genericCategoryTerms.has(token) || token.length <= 2);

  // When pure price intent with no product-type scope from semantic expansion,
  // return all products sorted by price immediately (no need for scoring)
  if (isPriceIntent && intentSignals.bodyArea.length === 0 && intentSignals.concern.length === 0 && intentSignals.brand === null) {
    const priceRelatedTokens = new Set([
      "expensive", "cheap", "price", "highest", "lowest", "most", "least", "high", "low",
      "priciest", "budget", "cheapest", "affordable", "good", "quality",
      // Arabic price-related normalized tokens
      "غاليه", "غالي", "رخيص", "رخيصه", "ارخص", "اغلي", "اغلى", "اقل",
      "كويسه", "كويس", "مش", "بس",
      // "thing/something" tokens (stop-word leakage: حاجة → حاج after normalization)
      "حاجه", "حاج",
    ]);
    const priceScopeTokens = baseQueryTokens.filter(t => !priceRelatedTokens.has(t));
    if (priceScopeTokens.length === 0) {
      // Pure price intent — return all products with a price, sorted
      return products
        .map(p => ({ p, price: getEffectiveProductPrice(p) }))
        .filter(({ price }) => price != null && price > 0)
        .sort((a, b) => isPriceLowIntent ? (a.price! - b.price!) : (b.price! - a.price!))
        .slice(0, 12)
        .map(({ p }) => p);
    }
  }

  const results = products
    .map((product) => {
      const productName = normalizeCatalogMatchText(product.name || "");
      const brandText = normalizeCatalogMatchText(product.brand || "");
      const categoryText = normalizeCatalogMatchText(`${product.category ?? ""} ${product.subcategory ?? ""}`);
      const descriptionText = normalizeCatalogMatchText(product.description || "");
      const tagText = normalizeCatalogMatchText(product.tag || "");
      const combinedText = normalizeCatalogMatchText([
        product.name,
        product.brand,
        product.category,
        product.subcategory,
        product.description,
        product.tag,
        product.skinType,
      ].join(" "));

      const effectivePrice = getEffectiveProductPrice(product);
      let score = 0;

      if (productName === normalizedQuery) score += 220;
      if (productName.includes(normalizedQuery) || normalizedQuery.includes(productName)) score += 80;
      if (brandText.includes(normalizedQuery) || normalizedQuery.includes(brandText)) score += 50;
      if (categoryText.includes(normalizedQuery) || normalizedQuery.includes(categoryText)) score += 65;
      if (descriptionText.includes(normalizedQuery) || normalizedQuery.includes(descriptionText)) score += 40;
      if (tagText.includes(normalizedQuery) || normalizedQuery.includes(tagText)) score += 25;

      const nameTokens = getCatalogMatchTokens(productName);
      const categoryTokens = getCatalogMatchTokens(categoryText);
      const descriptionTokens = getCatalogMatchTokens(descriptionText);
      const combinedTokens = getCatalogMatchTokens(combinedText);

      const sharedNameTokens = queryTokens.filter((token) => nameTokens.includes(token));
      const sharedCategoryTokens = queryTokens.filter((token) => categoryTokens.includes(token));
      const sharedDescriptionTokens = queryTokens.filter((token) => descriptionTokens.includes(token));
      const sharedCombinedTokens = queryTokens.filter((token) => combinedTokens.includes(token));

      score += sharedCombinedTokens.length * 32;
      score += sharedNameTokens.length * 28;
      score += sharedCategoryTokens.length * 18;
      score += sharedDescriptionTokens.length * 12;

      if (queryTokens.length > 0) {
        const categoryLikeBoost = getCategoryLikeMatchScore(queryTokens, categoryText) + getCategoryLikeMatchScore(queryTokens, productName) + getCategoryLikeMatchScore(queryTokens, descriptionText);
        score += categoryLikeBoost;
      }

      const categoryMatches = queryTokens.filter((token) => genericCategoryTerms.has(token) && (categoryText.includes(token) || productName.includes(token) || descriptionText.includes(token)));
      if (categoryMatches.length > 0) score += categoryMatches.length * 35;

      const isCategoryOnlySearch = queryTokens.length > 0 && queryTokens.every((token) => genericCategoryTerms.has(token) || token.length <= 2);
      if (isCategoryOnlySearch && (categoryText || productName || descriptionText)) {
        score += 20;
      }

      const fuzzyScore = queryTokens.filter((token) => {
        if (token.length < 3) return false;
        return combinedTokens.some((candidate) => {
          if (candidate === token) return false;
          return levenshteinDistance(token, candidate) <= 1 || candidate.startsWith(token) || token.startsWith(candidate);
        });
      }).length;
      score += fuzzyScore * 18;

      const ignoredTokens = new Set(["any", "expensive", "cheap", "dry", "hair", "طب",
        // Extended semantic tokens that should NOT be penalized as "unknown"
        "frizzy", "frizz", "anti-frizz", "smoothing", "keratin", "acne", "pimples", "breakouts",
        "leave-in", "leave", "post-shower", "oily", "dandruff", "moisturize", "moisturizer",
        "hydrate", "hydrating", "face", "facial", "skin", "treatment", "curly", "curl",
        "glow", "brightening", "anti-aging", "wrinkles", "pores", "hair loss",
      ]);

      // Only penalize for truly unknown tokens when there is NO semantic expansion
      const unknownTokens = queryTokens.filter(
        (token) => !genericCategoryTerms.has(token) && !combinedTokens.includes(token) && !ignoredTokens.has(token)
      );

      if (!hasSemanticExpansion) {
        // Original strict scoring — only apply when there was no semantic expansion
        if (queryTokens.length > 1 && unknownTokens.length > 0 && !isPriceIntent && !isDryHairIntent) {
          score = Math.max(0, score - unknownTokens.length * 90);
        }

        if (!isPriceIntent && unknownTokens.length > 0 && !unknownTokens.some((token) => productName.includes(token) || categoryText.includes(token) || descriptionText.includes(token) || brandText.includes(token))) {
          score = 0;
        }

        if (
          allGenericQueryTerms && queryTokens.length > 1 &&
          queryTokens.some((token) => !combinedTokens.includes(token)) &&
          !productName.includes(normalizedQuery) &&
          !categoryText.includes(normalizedQuery) &&
          !brandText.includes(normalizedQuery) &&
          !descriptionText.includes(normalizedQuery)
        ) {
          score = 0;
        }

        if (sharedCombinedTokens.length === 0 && fuzzyScore === 0 && !productName.includes(normalizedQuery) && !categoryText.includes(normalizedQuery) && !brandText.includes(normalizedQuery) && !descriptionText.includes(normalizedQuery)) {
          score = 0;
        }
      } else {
        // Semantic expansion was applied — use lighter penalties
        // Only zero-score if there are ZERO concept matches at all
        if (sharedCombinedTokens.length === 0 && fuzzyScore === 0) {
          score = 0;
        }

        // If the BASE query tokens contain specific LATIN (non-Arabic) words (e.g. "gloss", "balm")
        // that identify a specific product type, and this product has NONE of those tokens,
        // zero it out to avoid false positives.
        // We intentionally do NOT apply this check to Arabic base tokens — they triggered the
        // semantic expansion precisely because they map to English concepts not present in
        // the raw product text.
        if (score > 0 && baseQueryTokens.length > 0) {
          const areaWords = new Set(['hair', 'face', 'facial', 'skin', 'body', 'lip', 'lips', 'scalp']);
          const latinBaseTokens = baseQueryTokens.filter(t => {
            // Only Latin tokens (no Arabic Unicode range U+0600-U+06FF)
            if (/[\u0600-\u06FF]/.test(t)) return false;
            if (ignoredTokens.has(t)) return false;
            if (areaWords.has(t)) return false;
            if (t.length <= 2) return false;
            return true;
          });
          if (latinBaseTokens.length > 0) {
            const baseShared = latinBaseTokens.filter(t => combinedTokens.includes(t));
            const baseFuzzyMatches = latinBaseTokens.filter(t =>
              combinedTokens.some(c => c !== t && (levenshteinDistance(t, c) <= 1 || c.startsWith(t) || t.startsWith(c)))
            );
            if (baseShared.length === 0 && baseFuzzyMatches.length === 0) {
              score = 0;
            }
          }
        }
      }

      return { product, score, effectivePrice };
    })
    .filter(({ product, score, effectivePrice }) => {
      if (score <= 0) return false;
      if (isPriceIntent && effectivePrice == null) return false;

      if (isPriceIntent) {
        const ignoredPriceTerms = new Set([
          "expensive", "cheap", "price", "highest", "lowest", "most", "least", "high", "low",
          "priciest", "budget", "cheapest",
        ]);
        const priceScopeTokens = queryTokens.filter((token) => !ignoredPriceTerms.has(token));
        if (priceScopeTokens.length === 0) return true;

        const categoryText = normalizeCatalogMatchText(`${product.category ?? ""} ${product.subcategory ?? ""}`);
        const productContextText = normalizeCatalogMatchText(`${product.name ?? ""} ${product.description ?? ""} ${product.brand ?? ""}`);
        const familyHints: Record<string, string[]> = {
          shampoo: ["shampoo", "hair", "haircare", "scalp"],
          conditioner: ["conditioner", "hair", "haircare", "scalp"],
          serum: ["serum", "skin", "skincare", "hair", "haircare"],
          mask: ["mask", "hair", "haircare", "skin", "skincare"],
          cream: ["cream", "skin", "skincare", "body", "bath"],
          moisturizer: ["moisturizer", "skin", "skincare", "body", "bath"],
          oil: ["oil", "hair", "skin", "body"],
          balm: ["balm", "lip", "lipcare"],
          lip: ["lip", "balm", "lipcare"],
          body: ["body", "bath", "milk", "bodymilk"],
          milk: ["milk", "body", "bath", "bodymilk"],
          cleanser: ["cleanser", "skin", "skincare", "hair", "haircare"],
          sunscreen: ["sunscreen", "skin", "skincare"],
        };

        const categoryMismatch = (categoryText.includes("fragrance") || categoryText.includes("perfume") || categoryText.includes("body") || categoryText.includes("bath")) &&
          priceScopeTokens.some((token) => token === "shampoo" || token === "conditioner" || token === "serum" || token === "mask" || token === "milk" || token === "lip" || token === "balm");

        if (categoryMismatch) {
          return false;
        }

        return priceScopeTokens.some((token) => {
          const hints = familyHints[token] ?? [token];
          return hints.some((hint) => categoryText.includes(hint) || productContextText.includes(hint));
        });
      }

      return true;
    });

  // ── Pass 2 fallback: if no results but body area detected, search broadly ─
  if (results.filter(({ score }) => score > 0).length === 0 && intentSignals.bodyArea.length > 0 && !isPriceIntent) {
    const areaTokens = intentSignals.bodyArea.flatMap(area => {
      if (area === 'hair') return ['hair', 'haircare', 'shampoo', 'conditioner'];
      if (area === 'face') return ['face', 'skin', 'skincare', 'facial'];
      if (area === 'body') return ['body', 'bath'];
      if (area === 'lips') return ['lip', 'balm'];
      return [area];
    });

    const fallbackResults = products
      .map((product) => {
        const categoryText = normalizeCatalogMatchText(`${product.category ?? ""} ${product.subcategory ?? ""}`);
        const nameText = normalizeCatalogMatchText(product.name || "");
        const descText = normalizeCatalogMatchText(product.description || "");
        const combined = `${categoryText} ${nameText} ${descText}`;
        const matchedAreas = areaTokens.filter(t => combined.includes(t));
        return { product, score: matchedAreas.length * 10, effectivePrice: getEffectiveProductPrice(product) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product);

    return fallbackResults.length > 0 ? fallbackResults.slice(0, 12) : [];
  }

  const sortedResults = results
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (isPriceIntent) {
        const aPrice = a.effectivePrice ?? 0;
        const bPrice = b.effectivePrice ?? 0;
        if (Number.isFinite(aPrice) && Number.isFinite(bPrice) && aPrice !== bPrice) {
          return isPriceLowIntent ? aPrice - bPrice : bPrice - aPrice;
        }
      }
      return b.score - a.score;
    })
    .map(({ product }) => product);

  return sortedResults.length > 0 ? sortedResults.slice(0, 12) : [];
};

export const getCatalogAvailabilityStatus = ({
  products = [],
  query = "",
  matchedProducts = [],
  catalogLoading = false,
  catalogError = null,
}: {
  products?: Product[];
  query?: string;
  matchedProducts?: Product[];
  catalogLoading?: boolean;
  catalogError?: string | null;
}) => {
  if (catalogLoading) {
    return "CATALOG_STATUS: product catalog is still loading; do not claim a product is unavailable until the authoritative catalog has finished loading.";
  }

  if (catalogError) {
    return `CATALOG_STATUS: the authoritative product catalog could not be verified (${catalogError}); do not claim a product is absent without a successful catalog load.`;
  }

  if (!products.length) {
    return "CATALOG_STATUS: product catalog is not available yet; do not claim a product is unavailable until the catalog finishes loading.";
  }

  if (query && matchedProducts.length === 0) {
    return "CATALOG_STATUS: no product in the current catalog matched the request; do not invent or claim availability.";
  }

  return `CATALOG_STATUS: using ${Math.min(matchedProducts.length || products.length, 12)} matched catalog items relevant to the current query.`;
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
          `${p.category} ${p.subcategoryId ?? ""} ${p.subcategory ?? ""} ${p.name} ${p.description ?? ""}`
        );

      const resolvedPrice = getEffectiveProductPrice(p);
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
        `SUBCATEGORY: ${p.subcategory || p.subcategoryId || "general"}`,
        `PRICE: ${price}${original}`,
        `${suitabilityLabel}: ${suitabilityValue}`,
        p.tag ? `TAG: ${p.tag}` : "",
        p.rating ? `RATING: ${p.rating} / 5` : "",
        `OFFICIAL_DATABASE_DESCRIPTION: ${p.description ? p.description.trim() : "No official product description available."}`,
      ].filter(Boolean);

      return lines.join("\n");
    })
    .join("\n\n---\n\n");
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

export default function ChatWidget({ products = [], catalogLoading = false, catalogError = null, mode = "page", sidebarOpen = false }: ChatWidgetProps) {
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

      const visibleProducts = products.filter((p) => user?.role === "admin" || !p.isHidden);
      const matchedCatalog = searchCatalogProducts(visibleProducts, trimmed, messages);
      const catalog = buildCatalogContext(matchedCatalog.length > 0 ? matchedCatalog : visibleProducts, trimmed);
      const catalogStatusLine = getCatalogAvailabilityStatus({
        products: visibleProducts,
        query: trimmed,
        matchedProducts: matchedCatalog,
        catalogLoading,
        catalogError,
      });

      const systemPrompt = `You are PhM Concierge — a helpful, friendly shopping assistant for PherMono. Keep replies concise, human, and in the user's detected language (Egyptian Arabic if Arabic detected; otherwise English). Always:

    - Use the STORE PRODUCT CATALOG as the source of truth for what is actually sold on this website.
    - Keep recommendations short (max 2 products) and avoid long lists.
    - Do NOT emit markdown, tables, bullets, or numbered lists; respond as natural chat text.
    - If product matching is ambiguous, ask ONE short clarifying question only. Do not ask for clarification when the request is a broad category (e.g., "shampoo", "moisturizer").
    - When the request does not match any real catalog product, say so clearly and offer the closest available alternatives from the live catalog instead of inventing items.
    - Never claim that a product exists or is unavailable without checking the catalog first.
    - Keep product details grounded in the catalog and do not invent products, benefits, ingredients, ratings, prices, or stock status.
    - When a product's OFFICIAL_DATABASE_DESCRIPTION says "No official product description available.", do NOT invent or guess its ingredients, benefits, suitability, or formulation. You may share general category advice, but always make clear it is general guidance and not verified product information.
    - You may provide general beauty or skincare advice based on your knowledge, but always distinguish it from verified facts about a specific product. Never present general advice as a product fact.
    - When a customer describes a PROBLEM (e.g., frizzy hair, acne, dry skin, oily scalp), recommend relevant available products to address that problem — without making medical claims.
    - Infer product categories from customer descriptions: "تفضل على شعري بعد الشاور" → leave-in conditioner. "شعري هايش" → anti-frizz or smoothing products. "حبوب" → acne cleanser or treatment. "حاجة ترطب وشي" → facial moisturizer. "للشعر الدهني" → oily scalp/hair shampoo. If no exact match, recommend the closest category available.
    - If the catalog shows relevant products, ALWAYS recommend from the catalog. Do not say "not available" when catalog items exist.

    Tone: warm, polite, and conversational (Egyptian Arabic slang when user message is Arabic).

    ${catalogStatusLine}

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

      const groqApiKeys = getGroqApiKeys();
      groqKeyIndex = 0;

      if (groqApiKeys.length === 0) {
        throw new Error(
          "Groq API is not configured. Add REACT_APP_GROQ_API_KEY or REACT_APP_GROQ_API_KEYS to your .env file before using the chat assistant."
        );
      }

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < groqApiKeys.length; attempt += 1) {
        const apiKey = getNextGroqKey(groqApiKeys);

        if (!apiKey) {
          lastError = new Error(
            "No valid Groq API key is available in the current environment. Please add REACT_APP_GROQ_API_KEY or REACT_APP_GROQ_API_KEYS."
          );
          continue;
        }

        const maskedKey = apiKey ? `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}` : "none";
        console.debug("[Groq fallback] trying API key", {
          attempt: attempt + 1,
          total: groqApiKeys.length,
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
