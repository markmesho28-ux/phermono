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

const getFollowUpPatterns = () => {
  const english = /\b(which one|what about|what about its|what about this|show me more|show me all|any other|cheaper|more expensive|another|another one|other one|another option|similar|same but|same one|different one|its price|its availability|show me another|what else|show me other|details)\b/i;
  const arabic = /\b(اي نوع|أي نوع|وريني|ورينيه|المتاح|تاني|تانيه|كمان|برضو|وبعدين|أرخص|أغلى|السعر|سعره|متاح|موجود|حاجة تانيه|اخري|غيره|كمان)\b/;

  return { english, arabic };
};

const isExplicitFollowUpRequest = (message: string = "") => {
  const text = String(message ?? "").trim();
  if (!text) return false;

  const normalized = text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

  const { english, arabic } = getFollowUpPatterns();
  return english.test(text) || arabic.test(text) || english.test(normalized) || arabic.test(normalized);
};

export const getRelevantConversationHistory = (
  history: Array<{ sender: "user" | "bot"; text: string }> = [],
  latestMessage?: { sender: "user" | "bot"; text: string } | null
) => {
  if (!Array.isArray(history) || history.length === 0) return [];
  if (!latestMessage) return history.slice(-6);

  if (!isExplicitFollowUpRequest(latestMessage.text)) {
    return [];
  }

  const lastSix = history.slice(-6);
  return lastSix.filter((message) => {
    if (message.sender === "user") {
      return !isExplicitFollowUpRequest(message.text);
    }
    return true;
  });
};

export const buildGroqMessages = (
  history: Array<{ sender: "user" | "bot"; text: string }> = [],
  latestMessage?: { sender: "user" | "bot"; text: string } | null
) => {
  const relevantHistory = getRelevantConversationHistory(history, latestMessage);
  const messages = latestMessage ? [...relevantHistory, latestMessage] : [...relevantHistory];

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
  // ── Deodorant — main category (Arabic meanings, Arabizi, phonetic variants) ──────────────────
  // These all mean "deodorant" or describe the desire to control body odour.
  // Reusable: add further entries here when onboarding new deodorant-adjacent concepts.
  // Stored catalog values: category="Deodorant", subcategories="Roll-On","Spray","Stick"
  "ديودرانت":      ["deodorant", "odor control"],
  "ديودرنت":       ["deodorant", "odor control"],
  "ديودورانت":     ["deodorant", "odor control"],
  "ديو":           ["deodorant", "odor control"],
  "مزيل عرق":      ["deodorant", "odor control"],
  "مزيل للعرق":    ["deodorant", "odor control"],
  "مزيلات العرق":  ["deodorant", "odor control"],
  "مزيل ريحة العرق": ["deodorant", "odor control"],
  "ريحة العرق":    ["deodorant", "odor control"],
  "مزيل":          ["deodorant", "odor control"],
  "عرق":           ["deodorant", "odor control"],
  deodorant:        ["deodorant", "odor control", "roll-on", "spray"],
  deo:              ["deodorant", "odor control"],

  // ── Deodorant — Roll-On subcategory ────────────────────────────────────────────
  // Stored catalog value: subcategory="Roll-On"
  "رول أون":   ["roll-on", "deodorant", "roll on"],
  "رول اون":   ["roll-on", "deodorant", "roll on"],
  "رول-أون":   ["roll-on", "deodorant", "roll on"],
  "رولون":     ["roll-on", "deodorant", "roll on"],
  "رول":       ["roll-on", "deodorant"],
  "مزيل عرق بالرول": ["roll-on", "deodorant"],
  "rollon":     ["roll-on", "deodorant"],
  "roll on":    ["roll-on", "deodorant"],
  "roll-on":    ["roll-on", "deodorant"],

  // ── Deodorant — Spray subcategory ────────────────────────────────────────────
  // Stored catalog value: subcategory="Spray"
  // Note: "سبراي" alone is intentionally NOT mapped here — it is ambiguous
  // (hair spray vs. deodorant spray). Disambiguation happens in inferProductTypeHints
  // and extractIntentSignals when explicit deodorant-context words are present.
  "سبراي ديودرانت": ["spray", "deodorant"],
  "سبراي مزيل":     ["spray", "deodorant"],
  "بخاخ مزيل":      ["spray", "deodorant"],
  "بخاخ عرق":       ["spray", "deodorant"],
  "مزيل عرق بخاخ":  ["spray", "deodorant"],
  "مزيل عرق سبراي": ["spray", "deodorant"],

  // ── Deodorant — Stick subcategory ────────────────────────────────────────────
  // Stored catalog value: subcategory="Stick"
  // Currently 0 products in this subcategory; recognised as a type but never fabricated.
  "ستيك مزيل":     ["stick", "deodorant"],
  "مزيل عرق ستيك": ["stick", "deodorant"],
  "ديودرانت ستيك": ["stick", "deodorant"],


  // ── Follow-up signal words ───────────────────────────────────────────────
  "أي نوع":    [],
  "وريني":     [],
  "المتاح":    [],
  "أرخص":      ["cheap"],
  "أغلى":      ["expensive"],
  "تاني":      [],
  "كمان":      [],
};

// ─── Skin Care Category Architecture (Strictly Separated Two-Path System) ────
// Subcategory exact database identifiers:
export const SKIN_CARE_SUBCATEGORIES = [
  "Face cleanser",
  "body lotion",
  "Face Creams & Moisturizers",
  "BODY WASH",
  "SunSCREEN",
  "NAIL OIL",
  "LIP PALM",
  "Serum",
  "eye contour",
  "body Urea",
  "Hair Lotion",
  "Hair Serum",
  "Hair Mask",
  "body cream",
  "Toner",
  "Foundation",
  "Body Oil",
  "LIP GLOSS",
  "bikini",
  "Hand cream",
] as const;

export type SkinCareSubcategory = typeof SKIN_CARE_SUBCATEGORIES[number];

export interface SubcategoryMatchResult {
  categoryId: 'skincare';
  subcategoryId: SkinCareSubcategory;
  matchType: 'phonetic' | 'semantic' | 'both';
  matchedTerm: string;
  confidence: number;
}

export interface SubcategoryResolutionResult {
  categoryId: 'skincare';
  subcategoryId: SkinCareSubcategory | 'Skin Care';
  matchType: 'phonetic' | 'semantic' | 'both';
  matchedTerm: string;
  isAmbiguous?: boolean;
  ambiguousOptions?: string[];
  clarifyingQuestion?: string;
}

/**
 * Reusable phonetic normalizer for Arabic transliterations of English product sounds.
 * Normalizes common Egyptian phonetic substitutions (e.g. پ->ب, ڤ->ف, ص->س, alef variants,
 * diacritics, and tatweel) while strictly preserving word identity.
 */
export const normalizeArabicPhonetic = (input: string): string => {
  return String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[أإآء]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[\u0640]/g, '')
    .replace(/پ/g, 'ب')
    .replace(/ڤ/g, 'ف')
    .replace(/ص/g, 'س')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * PATH A: Phonetic transliteration of English names into Arabic script.
 * Identifies when Egyptian Arabic speakers write the SOUND of an English product or
 * subcategory name using Arabic letters (e.g. بادي لوشن, فيس كلينزر, صن سكرين, سيروم).
 * Must NOT match pure Arabic translations or semantic equivalents.
 */
export const matchSkinCarePhonetic = (text: string): SubcategoryMatchResult | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const norm = normalizeArabicPhonetic(raw);

  // Hair subcategories inside Skin Care hierarchy (e.g. هير لوشن, هير سيروم, هير ماسك)
  if (/(?:هير|هير)\s*(?:لوشن|لوسيون|لوسن)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hair Lotion', matchType: 'phonetic', matchedTerm: 'هير لوشن', confidence: 0.95 };
  }
  if (/(?:هير)\s*(?:سيروم|سيرم|سيرام)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hair Serum', matchType: 'phonetic', matchedTerm: 'هير سيروم', confidence: 0.95 };
  }
  if (/(?:هير)\s*(?:ماسك|مسك)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hair Mask', matchType: 'phonetic', matchedTerm: 'هير ماسك', confidence: 0.95 };
  }

  // Face Cleanser phonetic transliteration (e.g. فيس كلينزر, كلينزر, كلينسر)
  if (/(?:فيس\s*)?كلين[زس][ي]?ر/i.test(norm) || /فيس\s*كلين/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Face cleanser', matchType: 'phonetic', matchedTerm: 'كلينزر', confidence: 0.9 };
  }

  // Body Wash phonetic transliteration (e.g. بادي ووش, بودي واش)
  if (/(?:بادي|بودي|بدي)\s*(?:ووش|واش|وش)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'BODY WASH', matchType: 'phonetic', matchedTerm: 'بادي واش', confidence: 0.95 };
  }

  // Body Urea phonetic transliteration (e.g. بادي يوريا, بودي يوريا)
  if (/(?:بادي|بودي|بدي)\s*يوريا|يوريا\s*(?:بادي|بودي)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'body Urea', matchType: 'phonetic', matchedTerm: 'بادي يوريا', confidence: 0.95 };
  }

  // Body Lotion phonetic transliteration (e.g. بادي لوشن, بودي لوشن, بادي لوسيون, بودي لوسن)
  if (/(?:بادي|بودي|بدي)\s*(?:لوشن|لوسيون|لوسن)/i.test(norm) || /(?:لوشن|لوسيون|لوسن)\s*(?:بادي|بودي|بدي)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'body lotion', matchType: 'phonetic', matchedTerm: 'بادي لوشن', confidence: 0.95 };
  }

  // Body Cream phonetic transliteration (e.g. بادي كريم, بودي كريم)
  if (/(?:بادي|بودي|بدي)\s*كريم|كريم\s*(?:بادي|بودي|بدي)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'body cream', matchType: 'phonetic', matchedTerm: 'بادي كريم', confidence: 0.9 };
  }

  // Body Oil phonetic transliteration (e.g. بادي اويل, بودي اويل)
  if (/(?:بادي|بودي|بدي)\s*(?:اويل|أويل|ايل)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Body Oil', matchType: 'phonetic', matchedTerm: 'بادي اويل', confidence: 0.9 };
  }

  // Sunscreen phonetic transliteration (e.g. صن سكرين, سن سكرين, صنسكرين, صن بلوك, سن بلوك)
  if (/(?:صن|سن|سان)\s*(?:سكرين|سکرین|بلوك|بلوق)|(?:صنسكرين|سنكرين|صنبلوك)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'SunSCREEN', matchType: 'phonetic', matchedTerm: 'صن سكرين', confidence: 0.95 };
  }

  // Nail Oil phonetic transliteration (e.g. نيل اويل, نايل اويل)
  if (/(?:نيل|نايل)\s*(?:اويل|أويل|ايل)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'NAIL OIL', matchType: 'phonetic', matchedTerm: 'نيل اويل', confidence: 0.95 };
  }

  // Lip Palm (Balm) phonetic transliteration (e.g. ليب بالم, ليب بلم, ليب بلام, ليب پالم)
  if (/(?:ليب|ليپ)\s*(?:بالم|بلم|بلام|پالم|پلم)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'LIP PALM', matchType: 'phonetic', matchedTerm: 'ليب بالم', confidence: 0.95 };
  }

  // Lip Gloss phonetic transliteration (e.g. ليب جلوس, ليب جلوص, ليب جلاوس)
  if (/(?:ليب|ليپ)\s*(?:جلوس|جلوص|جلاوس|جلوش)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'LIP GLOSS', matchType: 'phonetic', matchedTerm: 'ليب جلوس', confidence: 0.95 };
  }

  // Eye Contour phonetic transliteration (e.g. آي كونتور, اي كونتور, كونتور العين)
  if (/(?:اي|آي|اى)\s*كونتور|كونتور\s*(?:اي|آي|اى|العين)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'eye contour', matchType: 'phonetic', matchedTerm: 'اي كونتور', confidence: 0.95 };
  }

  // Hand cream phonetic transliteration (e.g. هاند كريم, هاندكريم)
  if (/هاند\s*كريم|هاندكريم/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hand cream', matchType: 'phonetic', matchedTerm: 'هاند كريم', confidence: 0.95 };
  }

  // Face Creams & Moisturizers phonetic transliteration (e.g. فيس كريم, مويستشرايزر, مويسترايزر)
  if (/فيس\s*كريم|مويست[ش]?ر[ا]?ي?ز[ي]?ر/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Face Creams & Moisturizers', matchType: 'phonetic', matchedTerm: 'فيس كريم', confidence: 0.9 };
  }

  // Toner phonetic transliteration (e.g. تونر, تونار)
  if (/(?:^|\s)(?:ال)?(?:تونر|تونار)(?:$|\s)/i.test(norm) || /تونر/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Toner', matchType: 'phonetic', matchedTerm: 'تونر', confidence: 0.9 };
  }

  // Foundation phonetic transliteration (e.g. فاونديشن, فونديشن, فوندشين)
  if (/ف[ا]?ون?د[اي]?ش[ي]?ن/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Foundation', matchType: 'phonetic', matchedTerm: 'فاونديشن', confidence: 0.9 };
  }

  // Bikini phonetic transliteration (e.g. بيكيني, بكيني)
  if (/(?:^|\s)(?:ال)?ب[ي]?كيني(?:$|\s)/i.test(norm) || /ب[ي]?كيني/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'bikini', matchType: 'phonetic', matchedTerm: 'بكيني', confidence: 0.9 };
  }

  // Serum phonetic transliteration (e.g. سيروم, سيرم)
  if (/(?:^|\s)(?:ال)?(?:سيروم|سيرم|سيرام)(?:$|\s)/i.test(norm) || /(?:سيروم|سيرم|سيرام)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Serum', matchType: 'phonetic', matchedTerm: 'سيروم', confidence: 0.85 };
  }

  return null;
};

/**
 * PATH B: Accurate Arabic translation and semantic equivalents.
 * Separately determines the actual Arabic meaning of each subcategory and matches natural
 * Arabic expressions describing function or need (e.g. غسول الوجه, مرطب للجسم, واقي شمس, كريم العين).
 * Must NOT mistake transliteration sounds for semantic meaning.
 */
export const matchSkinCareSemantic = (text: string): SubcategoryMatchResult | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const norm = normalizeArabicPhonetic(raw);

  // Hair subcategories inside Skin Care hierarchy
  if (/لوشن\s*(?:شعر|للشعر|فروة)/i.test(norm) || /(?:شعر|للشعر)\s*لوشن/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hair Lotion', matchType: 'semantic', matchedTerm: 'لوشن للشعر', confidence: 0.95 };
  }
  if (/سيروم\s*(?:شعر|للشعر)|مصل\s*(?:شعر|للشعر)/i.test(norm) || /(?:شعر|للشعر)\s*(?:سيروم|مصل)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hair Serum', matchType: 'semantic', matchedTerm: 'سيروم للشعر', confidence: 0.95 };
  }
  if (/ماسك\s*(?:شعر|للشعر)|قناع\s*(?:شعر|للشعر)|حمام\s*كريم/i.test(norm) || /(?:شعر|للشعر)\s*(?:ماسك|قناع)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hair Mask', matchType: 'semantic', matchedTerm: 'ماسك للشعر', confidence: 0.95 };
  }

  // Sunscreen: واقي شمس, كريم حماية من الشمس, واقي من الشمس, حماية من الشمس, حاجة تحمي من الشمس
  if (/(?:واقي|حماي[هة]|تحمي|كريم)\s*(?:من\s*)?(?:اشع[هة]\s*)?(?:ال)?شمس/i.test(norm) || (/واقي/i.test(norm) && /شمس/i.test(norm))) {
    return { categoryId: 'skincare', subcategoryId: 'SunSCREEN', matchType: 'semantic', matchedTerm: 'واقي شمس', confidence: 0.95 };
  }

  // Foundation: كريم أساس, مستحضر أساس للمكياج, كريم اساس (check before generic face cream)
  if (/كريم\s*(?:ال)?اساس|مستحضر\s*(?:ال)?اساس/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Foundation', matchType: 'semantic', matchedTerm: 'كريم أساس', confidence: 0.95 };
  }

  // Eye contour: كريم العين, مرطب حول العين, جفاف حوالين العين, هالات سوداء, تجاعيد العين
  if (/(?:كريم|مرطب|سيروم|عناي[هة]|جفاف|هالات|تجاعيد|انتفاخ|منتج)?\s*(?:ل)?(?:منطق[هة]|محيط)?\s*(?:حولين|حول|تحت)?\s*(?:ال)?(?:عين|عيون)|(?:حولين|حول|تحت|محيط)\s*(?:ال)?(?:عين|عيون)/i.test(norm)) {
    if (/عين|عيون/i.test(norm)) {
      return { categoryId: 'skincare', subcategoryId: 'eye contour', matchType: 'semantic', matchedTerm: 'كريم العين', confidence: 0.95 };
    }
  }

  // Nail oil: زيت أظافر, زيت للأظافر, عناية بالأظافر, زيت ظوافر
  if (/زيت\s*(?:ل|لل|لـ|لـل|ال)?(?:اظافر|ظوافر|ضوافر)|عناي[هة]\s*ب(?:ال)?اظافر|مقوي\s*(?:ال)?اظافر/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'NAIL OIL', matchType: 'semantic', matchedTerm: 'زيت أظافر', confidence: 0.95 };
  }

  // Lip Palm / Balm: مرطب شفاه, مرطب شفايف, بلسم شفاه, بلسم شفايف, حاجة ترطب شفايفي, تشقق الشفايف
  if (/(?:مرطب|بلسم|ترطيب|تشقق|حماي[هة])\s*(?:ل|لل|لـ|ال)?(?:شفاه|شفايف|شفايفي|الشفاه|الشفايف)/i.test(norm) || /ترطب\s*شفايفي/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'LIP PALM', matchType: 'semantic', matchedTerm: 'مرطب شفاه', confidence: 0.95 };
  }

  // Lip Gloss: ملمع شفاه, جلوس شفاه, ملمع شفايف, تلميع الشفاه, لمعان للشفايف
  if (/(?:ملمع|جلوس|تلميع|لمعان)\s*(?:ل|لل|ال)?(?:شفاه|شفايف|الشفاه|الشفايف)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'LIP GLOSS', matchType: 'semantic', matchedTerm: 'ملمع شفاه', confidence: 0.95 };
  }

  // Hand cream: كريم إيد, كريم لليدين, مرطب اليدين, كريم يدين, جفاف الايد
  if (/(?:كريم|مرطب|ترطيب|جفاف)\s*(?:ل|لل|لـ|ال)?(?:ايد|يد|ايدين|يدين|كفوف|الايد|اليد|اليدين|الايدين)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Hand cream', matchType: 'semantic', matchedTerm: 'كريم لليدين', confidence: 0.95 };
  }

  // Bikini: تفتيح المناطق الحساسة, كريم بكيني, العناية بالمنطقة الحساسة
  if (/(?:تفتيح|ترطيب|عناي[هة]|كريم)?\s*(?:ب)?(?:ال)?(?:منطق[هة]|مناطق)?\s*(?:ال)?(?:حساس[هة]|بكيني|بيكيني)/i.test(norm)) {
    if (/حساس[هة]|بكيني|بيكيني/i.test(norm)) {
      return { categoryId: 'skincare', subcategoryId: 'bikini', matchType: 'semantic', matchedTerm: 'كريم بكيني', confidence: 0.95 };
    }
  }

  // Body Wash: غسول الجسم, شاور جل, منظف الجسم, صابون استحمام للجسم
  if (/غسول\s*(?:ل|لل|ال)?(?:جسم|جسمي)|شاور\s*جل|منظف\s*(?:ل|لل|ال)?(?:جسم|جسمي)|صابون\s*استحمام/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'BODY WASH', matchType: 'semantic', matchedTerm: 'غسول الجسم', confidence: 0.95 };
  }

  // Body Urea: يوريا للجسم, كريم يوريا للجسم, مرطب يوريا
  if (/يوريا\s*(?:ل|لل|ال)?(?:جسم|جسمي)|(?:كريم|مرطب)\s*يوريا/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'body Urea', matchType: 'semantic', matchedTerm: 'يوريا للجسم', confidence: 0.95 };
  }

  // Body Oil: زيت جسم, زيت للجسم, زيت ترطيب الجسم
  if (/زيت\s*(?:ل|لل|ال)?(?:جسم|جسمي)|زيت\s*ترطيب\s*(?:ال)?جسم/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Body Oil', matchType: 'semantic', matchedTerm: 'زيت جسم', confidence: 0.95 };
  }

  // Body Cream: كريم جسم, كريم ترطيب الجسم, كريم للجسم
  if (/كريم\s*(?:ل|لل|ال)?(?:جسم|جسمي)|كريم\s*ترطيب\s*(?:ال)?جسم/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'body cream', matchType: 'semantic', matchedTerm: 'كريم جسم', confidence: 0.95 };
  }

  // Body Lotion: لوشن للجسم, مرطب للجسم, مستحضر ترطيب الجسم
  if (/لوشن\s*(?:ل|لل|ال)?(?:جسم|جسمي)|مرطب\s*(?:ل|لل|ال)?(?:جسم|جسمي)|ترطيب\s*(?:ال)?جسم|مستحضر\s*ترطيب\s*(?:ال)?جسم/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'body lotion', matchType: 'semantic', matchedTerm: 'مرطب للجسم', confidence: 0.95 };
  }

  // Face Cleanser: غسول الوجه, غسول الوش, منظف الوجه, منظف البشرة, تنظيف الوش, تنظف وشي
  if (/غسول\s*(?:ل|لل|لـ|ال)?(?:وجه|وش|بشره|الوجه|الوش|البشره)|منظف\s*(?:ل|لل|لـ|ال)?(?:وجه|وش|بشره|الوجه|الوش|البشره)|تنظيف\s*(?:ل|لل|لـ|ال)?(?:وجه|وش|بشره|الوجه|الوش|البشره)|تنظف\s*(?:وجهي|وشي|بشرتي)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Face cleanser', matchType: 'semantic', matchedTerm: 'غسول الوجه', confidence: 0.95 };
  }

  // Toner: تونر للوجه, منقي مسام الوجه, قابض مسام
  if (/تونر\s*(?:ل|لل|ال)?(?:وجه|وش|بشره)|منقي\s*(?:ال)?مسام|قابض\s*(?:ال)?مسام/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Toner', matchType: 'semantic', matchedTerm: 'تونر للوجه', confidence: 0.95 };
  }

  // Face Creams & Moisturizers: كريم وجه, مرطب وش, كريم ترطيب البشرة, ترطيب الوش, حاجة ترطب وشي
  if (/(?:كريم|مرطب|ترطيب)\s*(?:ل|لل|لـ|ال)?(?:وجه|وش|بشره|الوجه|الوش|البشره)|ترطب\s*(?:وشي|وجهي|بشرتي)|كريم\s*(?:نهاري|ليلي)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Face Creams & Moisturizers', matchType: 'semantic', matchedTerm: 'كريم ترطيب البشرة', confidence: 0.95 };
  }

  // Serum: مصل للبشرة, مصل للوجه, سيروم للبشرة
  if (/مصل\s*(?:ل|لل|ال)?(?:بشره|وجه|وش|البشره|الوجه|الوش)|سيروم\s*(?:ل|لل|ال)?(?:بشره|وجه|وش|نضاره)/i.test(norm)) {
    return { categoryId: 'skincare', subcategoryId: 'Serum', matchType: 'semantic', matchedTerm: 'مصل للبشرة', confidence: 0.95 };
  }

  return null;
};

/**
 * Unified Skin Care subcategory resolver combining Path A (phonetic) and Path B (semantic).
 * Detects whether a request is phonetic, semantic, or both.
 * Handles ambiguity resolution using body-area clues or conversation history.
 */
export const resolveSkinCareSubcategory = (
  text: string,
  conversationHistory: Array<{ sender: 'user' | 'bot'; text: string }> = []
): SubcategoryResolutionResult | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  const phoneticMatch = matchSkinCarePhonetic(raw);
  const semanticMatch = matchSkinCareSemantic(raw);

  if (phoneticMatch && semanticMatch) {
    if (phoneticMatch.subcategoryId === semanticMatch.subcategoryId) {
      return {
        categoryId: 'skincare',
        subcategoryId: phoneticMatch.subcategoryId,
        matchType: 'both',
        matchedTerm: `${phoneticMatch.matchedTerm} + ${semanticMatch.matchedTerm}`,
      };
    }
    // If they differ, semantic takes priority as it specifies explicit meaning
    return {
      categoryId: 'skincare',
      subcategoryId: semanticMatch.subcategoryId,
      matchType: 'semantic',
      matchedTerm: semanticMatch.matchedTerm,
    };
  }

  if (phoneticMatch) {
    return {
      categoryId: 'skincare',
      subcategoryId: phoneticMatch.subcategoryId,
      matchType: 'phonetic',
      matchedTerm: phoneticMatch.matchedTerm,
    };
  }

  if (semanticMatch) {
    return {
      categoryId: 'skincare',
      subcategoryId: semanticMatch.subcategoryId,
      matchType: 'semantic',
      matchedTerm: semanticMatch.matchedTerm,
    };
  }

  // Ambiguity Resolution: handle generic isolated words like كريم, زيت, غسول, سيروم, لوشن
  const norm = normalizeArabicPhonetic(raw);

  // Check history context helper
  const getHistoricalArea = (): 'face' | 'body' | 'hand' | 'hair' | 'nail' | 'eye' | null => {
    if (!conversationHistory || conversationHistory.length === 0) return null;
    const rev = conversationHistory.slice().reverse();
    for (const msg of rev) {
      const hNorm = normalizeArabicPhonetic(msg.text);
      if (/وجه|وش|بشره/i.test(hNorm)) return 'face';
      if (/شعر/i.test(hNorm)) return 'hair';
      if (/جسم|جلد/i.test(hNorm)) return 'body';
      if (/ايد|يد/i.test(hNorm)) return 'hand';
      if (/عين|عيون/i.test(hNorm)) return 'eye';
      if (/اظافر|ظوافر/i.test(hNorm)) return 'nail';
    }
    return null;
  };

  // Ambiguous: "كريم" alone (e.g. عايز كريم, طب وريني كريم, كريم) without specified area
  if (/(?:^|\s)(?:كريم|الكريم)(?:$|\s)/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'face') {
      return { categoryId: 'skincare', subcategoryId: 'Face Creams & Moisturizers', matchType: 'semantic', matchedTerm: 'كريم للوجه (بالسياق)' };
    }
    if (historical === 'body') {
      return { categoryId: 'skincare', subcategoryId: 'body cream', matchType: 'semantic', matchedTerm: 'كريم للجسم (بالسياق)' };
    }
    if (historical === 'hand') {
      return { categoryId: 'skincare', subcategoryId: 'Hand cream', matchType: 'semantic', matchedTerm: 'كريم لليدين (بالسياق)' };
    }
    return {
      categoryId: 'skincare',
      subcategoryId: 'Face Creams & Moisturizers',
      matchType: 'semantic',
      matchedTerm: 'كريم',
      isAmbiguous: true,
      ambiguousOptions: ['Face Creams & Moisturizers', 'body cream', 'Hand cream'],
      clarifyingQuestion: 'حابب كريم للوجه ولا للجسم ولا لليدين؟',
    };
  }

  // Ambiguous: "زيت" alone
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:زيت|الـ?زيت)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'body') {
      return { categoryId: 'skincare', subcategoryId: 'Body Oil', matchType: 'semantic', matchedTerm: 'زيت للجسم (بالسياق)' };
    }
    if (historical === 'nail') {
      return { categoryId: 'skincare', subcategoryId: 'NAIL OIL', matchType: 'semantic', matchedTerm: 'زيت للأظافر (بالسياق)' };
    }
    return {
      categoryId: 'skincare',
      subcategoryId: 'Body Oil',
      matchType: 'semantic',
      matchedTerm: 'زيت',
      isAmbiguous: true,
      ambiguousOptions: ['Body Oil', 'NAIL OIL'],
      clarifyingQuestion: 'بتدور على زيت للجسم ولا للأظافر ولا للشعر؟',
    };
  }

  // Ambiguous: "غسول" alone
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:غسول|الـ?غسول)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'body') {
      return { categoryId: 'skincare', subcategoryId: 'BODY WASH', matchType: 'semantic', matchedTerm: 'غسول للجسم (بالسياق)' };
    }
    if (historical === 'face') {
      return { categoryId: 'skincare', subcategoryId: 'Face cleanser', matchType: 'semantic', matchedTerm: 'غسول للوجه (بالسياق)' };
    }
    return {
      categoryId: 'skincare',
      subcategoryId: 'Face cleanser',
      matchType: 'semantic',
      matchedTerm: 'غسول',
      isAmbiguous: true,
      ambiguousOptions: ['Face cleanser', 'BODY WASH'],
      clarifyingQuestion: 'محتاج غسول للوجه ولا غسول للجسم (شاور جل)؟',
    };
  }

  // Ambiguous: "سيروم" alone
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:سيروم|سيرم|الـ?سيروم)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'hair') {
      return { categoryId: 'skincare', subcategoryId: 'Hair Serum', matchType: 'semantic', matchedTerm: 'سيروم للشعر (بالسياق)' };
    }
    // Default to face serum if no hair context
    return { categoryId: 'skincare', subcategoryId: 'Serum', matchType: 'semantic', matchedTerm: 'سيروم للبشرة' };
  }

  // Main category requests: "عناية بالبشرة", "منتجات البشرة", "سكين كير", "روتين البشرة"
  if (/عناي[هة]\s*ب(?:ال)?بشره|منتجات\s*بشره|سكين\s*كير|اسكين\s*كير|روتين\s*(?:ال)?بشره/i.test(norm)) {
    const isPhonetic = /سكين\s*كير|اسكين\s*كير/i.test(norm);
    return {
      categoryId: 'skincare',
      subcategoryId: 'Skin Care',
      matchType: isPhonetic ? 'phonetic' : 'semantic',
      matchedTerm: isPhonetic ? 'سكين كير' : 'عناية بالبشرة',
    };
  }

  return null;
};

// ─── Haircare Category Architecture (Strictly Separated Two-Path System) ─────
// Subcategory exact database identifiers:
export const HAIRCARE_SUBCATEGORIES = [
  "Shampoo",
  "Conditioner",
  "ampoules",
  "serum",
  "mask",
  "leave in",
  "spray",
  "hair water",
  "scalp",
  "hair mist",
  "EYELASH SERUM",
  "Oil",
  "Hair Lotion",
  "Cream",
  "fb",
] as const;

export type HaircareSubcategory = typeof HAIRCARE_SUBCATEGORIES[number];

export interface HaircareMatchResult {
  categoryId: 'haircare';
  subcategoryId: HaircareSubcategory;
  matchType: 'phonetic' | 'semantic' | 'both';
  matchedTerm: string;
  confidence: number;
}

export interface HaircareResolutionResult {
  categoryId: 'haircare';
  subcategoryId: HaircareSubcategory | 'Haircare';
  matchType: 'phonetic' | 'semantic' | 'both';
  matchedTerm: string;
  isAmbiguous?: boolean;
  ambiguousOptions?: string[];
  clarifyingQuestion?: string;
}

/**
 * PATH A: Phonetic transliteration of English names into Arabic script for Haircare.
 * Identifies when users write the SOUND of an English Haircare subcategory name using Arabic letters
 * (e.g. شامبو, كوندشنر, أمبولز, ليف إن, آيلاش سيروم, سكالپ, هير ووتر, هير ميست).
 * Must NOT match pure Arabic translations or semantic equivalents.
 */
export const matchHaircarePhonetic = (text: string): HaircareMatchResult | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const norm = normalizeArabicPhonetic(raw);

  // Eyelash serum: آيلاش سيروم, ايلاش سيروم, لاش سيروم
  if (/(?:اي|آي|اى)?\s*لاش\s*(?:سيروم|سيرم|سيرام)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'EYELASH SERUM', matchType: 'phonetic', matchedTerm: 'ايلاش سيروم', confidence: 0.95 };
  }

  // Hair water: هير ووتر, هير واتر, هير وتر
  if (/(?:هير|شعر)\s*(?:ووتر|واتر|وتر)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'hair water', matchType: 'phonetic', matchedTerm: 'هير ووتر', confidence: 0.95 };
  }

  // Hair mist: هير ميست, هير مست
  if (/(?:هير\s*(?:ميست|مست)|(?:ميست|مست)\s*شعر)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'hair mist', matchType: 'phonetic', matchedTerm: 'هير ميست', confidence: 0.95 };
  }

  // Hair Lotion: هير لوشن, هير لوسيون, هير لوسن
  if (/(?:هير\s*(?:لوشن|لوسيون|لوسن)|(?:لوشن|لوسيون|لوسن)\s*شعر)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Hair Lotion', matchType: 'phonetic', matchedTerm: 'هير لوشن', confidence: 0.95 };
  }

  // Leave-in: ليف إن, ليف ان, ليفان
  if (/(?:ليف\s*(?:ان|إن)|ليفان)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'leave in', matchType: 'phonetic', matchedTerm: 'ليف ان', confidence: 0.95 };
  }

  // Scalp: سكالپ, سكالب
  if (/(?:^|\s)(?:ال)?سكال[بپ](?:$|\s)|سكال[بپ]/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'scalp', matchType: 'phonetic', matchedTerm: 'سكالب', confidence: 0.95 };
  }

  // Conditioner: كوندشنر, كونديشنر, كوندشينر, كنديشنر
  if (/ك[و]?ند[ي]?ش[ي]?ن[ي]?ر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Conditioner', matchType: 'phonetic', matchedTerm: 'كونديشنر', confidence: 0.95 };
  }

  // Ampoules: أمبولز, امبولز, أمبول, امبول, امبولات
  if (/[اأ]م?ن?بول[زس]?|[اأ]ن?بولات/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'ampoules', matchType: 'phonetic', matchedTerm: 'امبولز', confidence: 0.95 };
  }

  // Shampoo: شامبو, شمبو, شامبوا
  if (/شامبو|شمبو|شامبوا/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Shampoo', matchType: 'phonetic', matchedTerm: 'شامبو', confidence: 0.95 };
  }

  // Hair oil: هير اويل
  if (/(?:هير\s*(?:اويل|أويل|ايل)|(?:اويل|أويل|ايل)\s*شعر)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Oil', matchType: 'phonetic', matchedTerm: 'هير اويل', confidence: 0.9 };
  }

  // Hair cream: هير كريم
  if (!/(?:حمام|عين|عيون|وجه|وش|ايد|يد|هاند|جسم|بادي|بودي|اساس|أساس|مرطب)/.test(norm) && /(?:هير\s*كريم|كريم(?:\s*شعر)?)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Cream', matchType: 'phonetic', matchedTerm: 'هير كريم', confidence: 0.9 };
  }

  // Hair spray: هير سبراي, سبراي شعر
  if (/(?:هير\s*(?:سبراي|سبراى)|(?:سبراي|سبراى)(?:\s*شعر)?)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'spray', matchType: 'phonetic', matchedTerm: 'سبراي شعر', confidence: 0.9 };
  }

  // Hair mask: هير ماسك, ماسك شعر
  if (/(?:هير\s*ماسك|ماسك(?:\s*شعر)?)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'mask', matchType: 'phonetic', matchedTerm: 'ماسك شعر', confidence: 0.9 };
  }

  // Hair serum: هير سيروم, سيروم شعر
  if (!norm.includes('رموش') && /(?:هير\s*(?:سيروم|سيرم)|(?:سيروم|سيرم)(?:\s*شعر)?)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'serum', matchType: 'phonetic', matchedTerm: 'هير سيروم', confidence: 0.9 };
  }

  // fb: اف بي, fb (0 products, unknown meaning)
  if (/(?:^|\s)(?:اف\s*بي|[إا]ف\s*بي|[إا]ف\s*بى|fb)(?:$|\s)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'fb', matchType: 'phonetic', matchedTerm: 'fb', confidence: 0.9 };
  }

  return null;
};

/**
 * PATH B: Accurate Arabic translation and semantic equivalents for Haircare.
 * Understands genuine Arabic meanings and functional expressions describing the product type or need
 * (e.g. بلسم للشعر, حاجة تنعم الشعر بعد الغسيل, سيروم للرموش, حمام كريم, حاجة تتساب على الشعر من غير شطف).
 * Must NOT mistake transliteration sounds for semantic meaning.
 */
export const matchHaircareSemantic = (text: string): HaircareMatchResult | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const norm = normalizeArabicPhonetic(raw);

  // Eyelash serum: سيروم للرموش, مستحضر للعناية بالرموش, تطويل وتكثيف الرموش, حاجة لرموشي
  if (/(?:رموش|رموشي|الرموش)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'EYELASH SERUM', matchType: 'semantic', matchedTerm: 'سيروم للرموش', confidence: 0.95 };
  }

  // Leave-in: منتج للشعر يترك دون شطف, كريم يترك على الشعر, حاجة تفضل على شعري بعد الشاور, حاجة تتساب على الشعر من غير شطف, بلسم بدون شطف
  if (/(?:يترك|تترك|تفضل|تتساب)\s*(?:علي|على)?\s*(?:شعر|شعري|الشعر)?|بديل\s*الزيت|(?:دون|من\s*غير|بدون)\s*شطف/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'leave in', matchType: 'semantic', matchedTerm: 'منتج يترك على الشعر بدون شطف', confidence: 0.95 };
  }

  // Conditioner: بلسم للشعر, بلسم, حاجة تنعم الشعر بعد الغسيل, بلسم بعد الشامبو
  if (/بلسم|حاجه\s*تنعم\s*شعري|تنعيم\s*(?:ال)?شعر\s*بعد\s*الغسيل|ملين\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Conditioner', matchType: 'semantic', matchedTerm: 'بلسم للشعر', confidence: 0.95 };
  }

  // Mask: حمام كريم للشعر, حمام كريم, ماسك للشعر, قناع للشعر
  if (/حمام\s*كريم|قناع\s*(?:لل|لـ|ل|ال)?شعر|ماسك\s*(?:لل|لـ|ل|ال)?شعر|علاج\s*مكثف\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'mask', matchType: 'semantic', matchedTerm: 'حمام كريم للشعر', confidence: 0.95 };
  }

  // Scalp: منتج لفروة الرأس, عناية بفروة الرأس, علاج فروة الرأس, جفاف في فروة الرأس
  if (/(?:فرو[هة]|جلدة|جلده)\s*(?:ال)?(?:راس|رأس|راسي)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'scalp', matchType: 'semantic', matchedTerm: 'عناية بفروة الرأس', confidence: 0.95 };
  }

  // Hair water: مستحضر مائي للشعر, مياه للشعر, ماء للعناية بالشعر
  if (/(?:مستحضر\s*مائي|مياه|ما[ءا])\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'hair water', matchType: 'semantic', matchedTerm: 'مستحضر مائي للشعر', confidence: 0.95 };
  }

  // Hair mist: معطر للشعر, عطر للشعر, رذاذ معطر للشعر, برفان شعر
  if (/(?:معطر|عطر|رذاذ\s*معطر|برفان)\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'hair mist', matchType: 'semantic', matchedTerm: 'معطر للشعر', confidence: 0.95 };
  }

  // Ampoules: أمبولات للشعر, علاج للشعر في أمبولات, كورس أمبولات
  if (/(?:امبولات|أمبولات|علاج\s*في\s*امبولات|كورس\s*امبولات)/i.test(norm) && (/(?:شعر|شعري|تساقط|فروة)/i.test(norm) || !/(?:بشرة|وجه|وش)/i.test(norm))) {
    return { categoryId: 'haircare', subcategoryId: 'ampoules', matchType: 'semantic', matchedTerm: 'أمبولات للشعر', confidence: 0.95 };
  }

  // Hair Lotion: لوشن للشعر, مستحضر سائل للعناية بالشعر
  if (/(?:لوشن|مستحضر\s*سائل)\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Hair Lotion', matchType: 'semantic', matchedTerm: 'لوشن للشعر', confidence: 0.95 };
  }

  // Hair Oil: زيت للشعر, زيت مخصص للعناية بالشعر, حمام زيت للشعر
  if (/(?:زيت|حمام\s*زيت|زيوت)\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Oil', matchType: 'semantic', matchedTerm: 'زيت للشعر', confidence: 0.95 };
  }

  // Hair Cream: كريم للشعر, كريم للعناية بالشعر, كريم تصفيف الشعر, دهان للشعر
  if (/(?:كريم|دهان)(?:\s*ت[سص]فيف)?\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Cream', matchType: 'semantic', matchedTerm: 'كريم للشعر', confidence: 0.95 };
  }

  // Hair Spray: بخاخ للشعر, سبراي للعناية بالشعر, رذاذ للشعر
  if (/(?:بخاخ|سبراي|رذاذ)\s*(?:لل|لـ|ل|ال)?شعر/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'spray', matchType: 'semantic', matchedTerm: 'بخاخ للشعر', confidence: 0.95 };
  }

  // Hair Serum: سيروم للعناية بالشعر, مصل للشعر, سيروم لتغذية أو تنعيم الشعر
  if (/(?:سيروم|مصل)\s*(?:لل|لـ|ل|ال)?(?:شعر|شعري|الشعر|هيشان|اطراف)/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'serum', matchType: 'semantic', matchedTerm: 'سيروم للشعر', confidence: 0.95 };
  }

  // Shampoo: شامبو للشعر, منظف للشعر, غسيل الشعر, حاجة لغسل الشعر, تنظيف الشعر
  if (/(?:شامبو|منظف|غسيل|غسل|تنظيف)\s*(?:لل|لـ|ل|ال)?شعر|حاجه\s*(?:ل)?غسل\s*الشعر|شامبو/i.test(norm)) {
    return { categoryId: 'haircare', subcategoryId: 'Shampoo', matchType: 'semantic', matchedTerm: 'شامبو للشعر', confidence: 0.95 };
  }

  return null;
};

/**
 * Unified Haircare subcategory resolver combining Path A (phonetic) and Path B (semantic).
 * Detects whether a request is phonetic, semantic, or both.
 * Handles ambiguity resolution using area clues or conversation history.
 */
export const resolveHaircareSubcategory = (
  text: string,
  conversationHistory: Array<{ sender: 'user' | 'bot'; text: string }> = []
): HaircareResolutionResult | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  const norm = normalizeArabicPhonetic(raw);

  // Check history context helper
  const getHistoricalArea = (): 'hair' | 'face' | 'eyelash' | null => {
    if (!conversationHistory || conversationHistory.length === 0) return null;
    const rev = conversationHistory.slice().reverse();
    for (const msg of rev) {
      const hNorm = normalizeArabicPhonetic(msg.text);
      if (/رموش/i.test(hNorm)) return 'eyelash';
      if (/شعر|فروة|شامبو|بلسم/i.test(hNorm)) return 'hair';
      if (/وجه|وش|بشرة/i.test(hNorm)) return 'face';
    }
    return null;
  };

  // Ambiguous: "سيروم" alone without hair/eyelash context
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:سيروم|سيرم|الـ?سيروم)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'eyelash' || /رموش/i.test(norm)) {
      return { categoryId: 'haircare', subcategoryId: 'EYELASH SERUM', matchType: 'semantic', matchedTerm: 'سيروم رموش' };
    }
    if (historical === 'hair') {
      return { categoryId: 'haircare', subcategoryId: 'serum', matchType: 'semantic', matchedTerm: 'سيروم شعر (بالسياق)' };
    }
    return {
      categoryId: 'haircare',
      subcategoryId: 'serum',
      matchType: 'semantic',
      matchedTerm: 'سيروم',
      isAmbiguous: true,
      ambiguousOptions: ['serum', 'EYELASH SERUM'],
      clarifyingQuestion: 'بتدور على سيروم للشعر ولا للرموش ولا للبشرة؟',
    };
  }

  // Ambiguous: "زيت" alone without hair context
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:زيت|الـ?زيت|زيوت)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'hair') {
      return { categoryId: 'haircare', subcategoryId: 'Oil', matchType: 'semantic', matchedTerm: 'زيت للشعر (بالسياق)' };
    }
    return {
      categoryId: 'haircare',
      subcategoryId: 'Oil',
      matchType: 'semantic',
      matchedTerm: 'زيت',
      isAmbiguous: true,
      ambiguousOptions: ['Oil'],
      clarifyingQuestion: 'بتدور على زيت للشعر ولا للجسم ولا للأظافر؟',
    };
  }

  // Ambiguous: "كريم" alone without hair context
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:كريم|الـ?كريم)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'hair') {
      return { categoryId: 'haircare', subcategoryId: 'Cream', matchType: 'semantic', matchedTerm: 'كريم للشعر (بالسياق)' };
    }
    return {
      categoryId: 'haircare',
      subcategoryId: 'Cream',
      matchType: 'semantic',
      matchedTerm: 'كريم',
      isAmbiguous: true,
      ambiguousOptions: ['Cream'],
      clarifyingQuestion: 'بتدور على كريم للشعر ولا للوجه ولا للجسم؟',
    };
  }

  // Ambiguous: "سبراي" alone without hair context
  if (/^\s*(?:عايز|محتاج|فيه|عندكم|اريد)?\s*(?:سبراي|سبراى|الـ?سبراي|بخاخ|الـ?بخاخ)\s*$/i.test(norm)) {
    const historical = getHistoricalArea();
    if (historical === 'hair') {
      return { categoryId: 'haircare', subcategoryId: 'spray', matchType: 'semantic', matchedTerm: 'سبراي شعر (بالسياق)' };
    }
    return {
      categoryId: 'haircare',
      subcategoryId: 'spray',
      matchType: 'semantic',
      matchedTerm: 'سبراي',
      isAmbiguous: true,
      ambiguousOptions: ['spray'],
      clarifyingQuestion: 'بتدور على سبراي للشعر ولا مزيل عرق سبراي؟',
    };
  }

  const phoneticMatch = matchHaircarePhonetic(raw);
  const semanticMatch = matchHaircareSemantic(raw);

  if (phoneticMatch && semanticMatch) {
    if (phoneticMatch.subcategoryId === semanticMatch.subcategoryId) {
      return {
        categoryId: 'haircare',
        subcategoryId: phoneticMatch.subcategoryId,
        matchType: 'both',
        matchedTerm: `${phoneticMatch.matchedTerm} + ${semanticMatch.matchedTerm}`,
      };
    }
    return {
      categoryId: 'haircare',
      subcategoryId: semanticMatch.subcategoryId,
      matchType: 'semantic',
      matchedTerm: semanticMatch.matchedTerm,
    };
  }

  if (phoneticMatch) {
    return {
      categoryId: 'haircare',
      subcategoryId: phoneticMatch.subcategoryId,
      matchType: 'phonetic',
      matchedTerm: phoneticMatch.matchedTerm,
    };
  }

  if (semanticMatch) {
    return {
      categoryId: 'haircare',
      subcategoryId: semanticMatch.subcategoryId as HaircareSubcategory,
      matchType: 'semantic',
      matchedTerm: semanticMatch.matchedTerm,
    };
  }

  // Main category requests: "عناية بالشعر", "منتجات الشعر", "روتين الشعر", "هير كير"
  if (/عناي[هة]\s*ب(?:ال)?شعر|منتجات\s*(?:ال)?شعر|هير\s*كير|روتين\s*(?:ال)?شعر/i.test(norm)) {
    const isPhonetic = /هير\s*كير/i.test(norm);
    return {
      categoryId: 'haircare',
      subcategoryId: 'Haircare',
      matchType: isPhonetic ? 'phonetic' : 'semantic',
      matchedTerm: isPhonetic ? 'هير كير' : 'عناية بالشعر',
    };
  }

  return null;
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
  skinCareSubcategory?: SubcategoryResolutionResult | null;
  haircareSubcategory?: HaircareResolutionResult | null;
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
  const { english: followUpEnglishPattern, arabic: followUpArabicPattern } = getFollowUpPatterns();
  const isFollowUp = followUpArabicPhrases.some(p => normForFollowUp.includes(p) || text.includes(p)) ||
    followUpEnglishPattern.test(text) || followUpArabicPattern.test(text) || followUpEnglishPattern.test(normalizedText) || followUpArabicPattern.test(normalizedText);

  let followUpContext = '';
  if (isFollowUp && conversationHistory && conversationHistory.length > 0) {
    const userMessages = conversationHistory.filter(m => m.sender === 'user');
    const lastMeaningful = userMessages.slice().reverse().find(m => {
      const mNorm = m.text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      return !followUpArabicPhrases.some(p => mNorm.includes(p) || m.text.includes(p)) &&
        !followUpEnglishPattern.test(m.text) &&
        !followUpArabicPattern.test(m.text) &&
        !followUpEnglishPattern.test(mNorm) &&
        !followUpArabicPattern.test(mNorm);
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
  if (/\b(face|facial|skin)\b/i.test(text) || /وجه|وش|بشرة|بشره/.test(text)) bodyArea.push('face');
  if (/\b(body)\b/i.test(text) || /جسم|جلد/.test(text)) bodyArea.push('body');
  if (/\b(lip|lips)\b/i.test(text) || /شفايف|شفاه|شفاتي/.test(text)) bodyArea.push('lips');
  if (/\b(eye|eyes|contour)\b/i.test(text) || /عين|عيون|كونتور/.test(text)) bodyArea.push('eyes');
  if (/\b(hand|hands)\b/i.test(text) || /ايد|يد|ايدين|يدين|كفوف/.test(text)) bodyArea.push('hands');
  if (/\b(nail|nails)\b/i.test(text) || /أظافر|اظافر|ظوافر|ضوافر/.test(text)) bodyArea.push('nails');
  if (/\b(bikini|intimate)\b/i.test(text) || /بيكيني|بكيني|حساسة|حساسه/.test(text)) bodyArea.push('bikini');
  // Deodorant area: signals that the user is asking about deodorant / body-odour control.
  // Uses Arabic meanings (مزيل عرق, ريحة العرق), Arabizi (ديودرانت, ديودرنت), and subcategory keywords (رول أون, بخاخ+مزيل).
  if (
    /\b(deodorant|deo)\b/i.test(text) ||
    /مزيل عرق|مزيل للعرق|مزيلات العرق|مزيل ريحة العرق|ريحة العرق|ديودر/.test(text) ||
    /roll[\s-]?on|rollon|رول[ -]?أون|رول[ -]?اون|رولون/i.test(text)
  ) {
    bodyArea.push('deodorant');
  }

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
  if (/\b(sun|sunscreen|sunblock|spf)\b/i.test(text) || /شمس|واقي|حماية/.test(text)) concern.push('sun protection');
  if (/\b(dark circle|puffiness)\b/i.test(text) || /هالات|انتفاخ/.test(text)) concern.push('eye concern');

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

  // Resolve Skin Care subcategory via Two-Path architecture
  const skinCareSubcategory = resolveSkinCareSubcategory(text, conversationHistory);
  if (skinCareSubcategory && skinCareSubcategory.subcategoryId) {
    if (skinCareSubcategory.subcategoryId !== 'Skin Care') {
      productConceptsSet.add(skinCareSubcategory.subcategoryId.toLowerCase());
      skinCareSubcategory.subcategoryId.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 2) productConceptsSet.add(w);
      });
    }
    // Infer bodyArea from resolved Skin Care subcategory if not already set
    if (skinCareSubcategory.subcategoryId === 'eye contour' && !bodyArea.includes('eyes')) bodyArea.push('eyes');
    if (skinCareSubcategory.subcategoryId === 'Hand cream' && !bodyArea.includes('hands')) bodyArea.push('hands');
    if (skinCareSubcategory.subcategoryId === 'NAIL OIL' && !bodyArea.includes('nails')) bodyArea.push('nails');
    if (skinCareSubcategory.subcategoryId === 'bikini' && !bodyArea.includes('bikini')) bodyArea.push('bikini');
    if ((skinCareSubcategory.subcategoryId === 'body lotion' || skinCareSubcategory.subcategoryId === 'body cream' || skinCareSubcategory.subcategoryId === 'BODY WASH' || skinCareSubcategory.subcategoryId === 'Body Oil' || skinCareSubcategory.subcategoryId === 'body Urea') && !bodyArea.includes('body')) bodyArea.push('body');
    if ((skinCareSubcategory.subcategoryId === 'Face cleanser' || skinCareSubcategory.subcategoryId === 'Face Creams & Moisturizers' || skinCareSubcategory.subcategoryId === 'Toner' || skinCareSubcategory.subcategoryId === 'Foundation' || skinCareSubcategory.subcategoryId === 'Serum') && !bodyArea.includes('face')) bodyArea.push('face');
    if ((skinCareSubcategory.subcategoryId === 'LIP PALM' || skinCareSubcategory.subcategoryId === 'LIP GLOSS') && !bodyArea.includes('lips')) bodyArea.push('lips');
    if ((skinCareSubcategory.subcategoryId === 'Hair Lotion' || skinCareSubcategory.subcategoryId === 'Hair Serum' || skinCareSubcategory.subcategoryId === 'Hair Mask') && !bodyArea.includes('hair')) bodyArea.push('hair');
  }

  // Resolve Haircare subcategory via Two-Path architecture
  const haircareSubcategory = resolveHaircareSubcategory(text, conversationHistory);
  if (haircareSubcategory && haircareSubcategory.subcategoryId) {
    if (haircareSubcategory.subcategoryId !== 'Haircare' && haircareSubcategory.subcategoryId !== 'fb') {
      productConceptsSet.add(haircareSubcategory.subcategoryId.toLowerCase());
      haircareSubcategory.subcategoryId.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 2) productConceptsSet.add(w);
      });
    }
    // Infer bodyArea and concern
    if (haircareSubcategory.subcategoryId === 'EYELASH SERUM') {
      if (!bodyArea.includes('eyelashes')) bodyArea.push('eyelashes');
      if (!concern.includes('eyelash care')) concern.push('eyelash care');
    } else if (haircareSubcategory.subcategoryId !== 'fb') {
      if (!bodyArea.includes('hair')) bodyArea.push('hair');
      if (haircareSubcategory.subcategoryId === 'scalp' && !bodyArea.includes('scalp')) {
        bodyArea.push('scalp');
      }
    }
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
    skinCareSubcategory,
    haircareSubcategory,
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
  lip: "lip", lips: "lip", lipcare: "lip", "شفايف": "lip", "شفاه": "lip", "ليب": "lip", "ليپ": "lip",
  balm: "balm", salve: "balm", balsam: "balm", "بالم": "balm", "بلم": "balm", "لبم": "balm", "بلام": "balm",
  gloss: "gloss", glossy: "gloss", shine: "gloss", shiny: "gloss", "بريق": "gloss", "لمعان": "gloss", "ألوان": "gloss",
  "جلوس": "gloss", "جلوص": "gloss", "جلاوس": "gloss", "جلوش": "gloss", "جليوس": "gloss",
  "سيروبايب": "seropipe", "سيروبايبـ": "seropipe", "سيروبأيب": "seropipe", "سيروب ايب": "seropipe", "سيروبيب": "seropipe",
  "ليف": "leave-in", "ليف ان": "leave-in", "ليف-ان": "leave-in", "ليف إن": "leave-in", "ليفان": "leave-in",
  oil: "oil", oils: "oil", "أويل": "oil", "زيت": "oil", hair: "hair", "شعر": "hair", dry: "dry", "جاف": "dry",
  skin: "skin", "بشرة": "skin", "وجه": "skin", face: "skin", "مكياج": "makeup",
  expensive: "expensive", "اغلى": "expensive", "اغلي": "expensive", "غلى": "expensive", "غلي": "expensive",
  "غالي": "expensive", "غالى": "expensive", "غاليه": "expensive", "غالية": "expensive",
  cheap: "cheap", "ارخص": "cheap", "رخص": "cheap", "رخيص": "cheap", "رخيصة": "cheap", "اقل": "cheap", "أقل": "cheap",
  // ── Deodorant aliases ───────────────────────────────────────────────────────────────────────
  // Normalise Arabic/Arabizi deodorant words to the stored English category/subcategory values.
  deodorant: "deodorant", deodrnt: "deodorant", deo: "deodorant",
  "ديودرانت": "deodorant", "ديودرنت": "deodorant", "ديودورانت": "deodorant",
  "مزيل عرق": "deodorant", "مزيل للعرق": "deodorant", "مزيلات العرق": "deodorant",
  "مزيل ريحة العرق": "deodorant", "ريحة العرق": "deodorant",
  "rollon": "roll-on", "roll on": "roll-on",
  "رول أون": "roll-on", "رول اون": "roll-on", "رول-أون": "roll-on", "رولون": "roll-on",
  "سبراي": "spray", "سبراى": "spray",
  "بخاخ": "spray",
  "ستيك": "stick",
};

const inferProductTypeHints = (value: string): string[] => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const normalized = raw
    .normalize("NFKC")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[\u200C\u200D]/g, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const hints = new Set<string>();

  const matchesGloss = /(gl|gla|glo|jla|jlo|gloos|glao|glaow|gloos|glos|جلوس|جلا|جلو|جلوص|جلاو|glaow|gloow|glooss)/i.test(normalized);
  if (matchesGloss && /(lip|ليب|شفايف|شفاه|gloss)/i.test(normalized)) {
    hints.add("gloss");
  }

  const matchesBalm = /(balm|balmm|blm|bllm|بالم|بلم|بلام|بلام|lbm|balam)/i.test(normalized);
  if (matchesBalm && /(lip|ليب|شفايف|شفاه|balm)/i.test(normalized)) {
    hints.add("balm");
  }

  const matchesLeaveIn = /(?:leave|liv|lif|لايف|ليف|لِف).*(?:in|ان|اني|يني|انـ|eni|ini|in)/i.test(normalized);
  if (matchesLeaveIn) {
    hints.add("leave-in");
  }

  const matchesSeropipe = /(?:serop|siro|sirob|serob|سيروب|سيرو).*(?:pipe|بايب|بايب|pib|pb|pip)/i.test(normalized);
  if (matchesSeropipe) {
    hints.add("seropipe");
  }

  const matchesBodyMilk = /(body|بودي|بادي|milk|ميلك|مليك|bidy|bodi).*(?:milk|ميلك|مليك|midk|mlk)/i.test(normalized) ||
    /(milk|ميلك|مليك|midk|mlk).*(?:body|بودي|بادي|bodi|body)/i.test(normalized);
  if (matchesBodyMilk) {
    hints.add("body milk");
  }

  const matchesShampoo = /(shampoo|شامبو|شامپو|شامب|shamp|shampo|shamoo)/i.test(normalized);
  if (matchesShampoo) hints.add("shampoo");

  const matchesConditioner = /(cond|condition|كوند|كوندي|بلسم|كند|كندي|kond|kondish|conditioner)/i.test(normalized);
  if (matchesConditioner) hints.add("conditioner");

  const matchesSerum = /(serum|سرم|سيروم|سيرم|serom|serm)/i.test(normalized);
  if (matchesSerum) hints.add("serum");

  const matchesLip = /(lip|ليب|شفايف|شفاه|lips)/i.test(normalized);
  if (matchesLip) hints.add("lip");

  // ── Deodorant category and subcategories ───────────────────────────────────────────────
  // Detect the main Deodorant category intent from Arabic meanings, Arabizi, and phonetic variants.
  const matchesDeodorantCtx = /(deodorant|deodr|\bdeo\b|مزيل عرق|مزيل للعرق|مزيلات العرق|ريحة العرق|مزيل|ديودر)/i.test(normalized);
  if (matchesDeodorantCtx) hints.add("deodorant");

  // Roll-On subcategory: Arabic (رول أون and variants), Arabizi (rollon), English (roll-on, roll on)
  const matchesRollOn = /(roll[\s-]?on|rollon|رول[ -]?أون|رول[ -]?اون|رولون)/i.test(normalized);
  if (matchesRollOn) { hints.add("roll-on"); hints.add("deodorant"); }

  // Spray subcategory: only add deodorant hint when deodorant context is also present,
  // to avoid misidentifying hair spray or body spray as a Deodorant product.
  const matchesSprayWord = /(spray|سبراي|سبراى|بخاخ)/i.test(normalized);
  if (matchesSprayWord && matchesDeodorantCtx) {
    hints.add("spray");
    hints.add("deodorant");
  } else if (matchesSprayWord) {
    // Ambiguous: could be hair spray, deodorant spray, or other spray.
    // Only add "spray" as a raw hint; scoring will determine the best category match.
    hints.add("spray");
  }

  // Stick subcategory: only infer deodorant context when deodorant words are also present.
  const matchesStickWord = /(\bstick\b|ستيك)/i.test(normalized);
  if (matchesStickWord && matchesDeodorantCtx) {
    hints.add("stick");
    hints.add("deodorant");
  }

  return Array.from(hints);
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

  if (intentSignals.haircareSubcategory?.subcategoryId === 'fb') {
    return [];
  }

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
  const inferredProductHints = inferProductTypeHints(trimmedQuery);

  // Inject semantic concepts as additional tokens
  const semanticTokenSet = new Set<string>(baseQueryTokens);

  for (const concept of [...intentSignals.productConcepts, ...inferredProductHints]) {
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
  const genericCategoryTerms = new Set([
    "shampoo", "conditioner", "serum", "cleanser", "sunscreen", "oil", "balm", "lip", "gloss",
    "moisturizer", "mask", "cream", "hair", "skin", "leave-in", "treatment", "anti-frizz", "frizz",
    "deodorant", "roll-on", "spray", "stick", "odor", "control",
    "ampoules", "ampoule", "scalp", "eyelash", "eyelashes", "water", "mist", "lotion", "leave",
  ]);
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
      // "thing/something" tokens (stop-word leakage: حاجة → حاج بعد normalization)
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
      const subcategoryText = normalizeCatalogMatchText(`${product.subcategory ?? ""} ${product.subcategoryId ?? ""}`);
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

      if (subcategoryText) {
        if (subcategoryText === normalizedQuery) score += 320;
        if (subcategoryText.includes(normalizedQuery) || normalizedQuery.includes(subcategoryText)) score += 140;
      }

      if (productName === normalizedQuery) score += 220;
      if (productName.includes(normalizedQuery) || normalizedQuery.includes(productName)) score += 80;
      if (brandText.includes(normalizedQuery) || normalizedQuery.includes(brandText)) score += 50;
      if (categoryText.includes(normalizedQuery) || normalizedQuery.includes(categoryText)) score += 65;
      if (descriptionText.includes(normalizedQuery) || normalizedQuery.includes(descriptionText)) score += 40;
      if (tagText.includes(normalizedQuery) || normalizedQuery.includes(tagText)) score += 25;

      const nameTokens = getCatalogMatchTokens(productName);
      const subcategoryTokens = getCatalogMatchTokens(subcategoryText);
      const categoryTokens = getCatalogMatchTokens(categoryText);
      const descriptionTokens = getCatalogMatchTokens(descriptionText);
      const combinedTokens = getCatalogMatchTokens(combinedText);

      const sharedNameTokens = queryTokens.filter((token) => nameTokens.includes(token));
      const sharedSubcategoryTokens = queryTokens.filter((token) => subcategoryTokens.includes(token));
      const sharedCategoryTokens = queryTokens.filter((token) => categoryTokens.includes(token));
      const sharedDescriptionTokens = queryTokens.filter((token) => descriptionTokens.includes(token));
      const sharedCombinedTokens = queryTokens.filter((token) => combinedTokens.includes(token));

      score += sharedCombinedTokens.length * 32;
      score += sharedSubcategoryTokens.length * 70;
      score += sharedNameTokens.length * 28;
      score += sharedCategoryTokens.length * 18;
      score += sharedDescriptionTokens.length * 12;

      if (queryTokens.length > 0) {
        const categoryLikeBoost = getCategoryLikeMatchScore(queryTokens, subcategoryText) + getCategoryLikeMatchScore(queryTokens, categoryText) + getCategoryLikeMatchScore(queryTokens, productName) + getCategoryLikeMatchScore(queryTokens, descriptionText);
        score += categoryLikeBoost;
      }

      const categoryMatches = queryTokens.filter((token) => genericCategoryTerms.has(token) && (subcategoryText.includes(token) || categoryText.includes(token) || productName.includes(token) || descriptionText.includes(token)));
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
        // Deodorant category tokens
        "deodorant", "roll-on", "spray", "stick", "odor", "control",
        // Haircare tokens
        "ampoules", "ampoule", "scalp", "eyelash", "eyelashes", "mist", "water", "lotion",
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
            const isResolvedSubcategoryMatch = Boolean(
              (intentSignals.skinCareSubcategory &&
                intentSignals.skinCareSubcategory.subcategoryId &&
                String(product.subcategory ?? '').toLowerCase() === String(intentSignals.skinCareSubcategory.subcategoryId).toLowerCase()) ||
              (intentSignals.haircareSubcategory &&
                intentSignals.haircareSubcategory.subcategoryId &&
                String(product.subcategory ?? '').toLowerCase() === String(intentSignals.haircareSubcategory.subcategoryId).toLowerCase())
            );
            if (!isResolvedSubcategoryMatch) {
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
      if (area === 'deodorant') return ['deodorant', 'roll-on', 'spray', 'stick'];
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

  // When the user explicitly requests a product format (e.g., Roll-On, Spray, Stick),
  // search within that format first. If the requested format has no products in the catalog
  // (e.g. empty Stick subcategory), return empty so the chatbot can report it unavailable.
  if (inferredProductHints.includes("roll-on")) {
    const rollOnResults = sortedResults.filter((product) =>
      normalizeCatalogMatchText(`${product.subcategory ?? ""} ${product.name ?? ""}`).includes("roll")
    );
    if (rollOnResults.length > 0) {
      return rollOnResults.slice(0, 12);
    }
  }

  if (
    inferredProductHints.includes("spray") &&
    (inferredProductHints.includes("deodorant") || intentSignals.bodyArea.includes("deodorant"))
  ) {
    const sprayResults = sortedResults.filter((product) =>
      normalizeCatalogMatchText(`${product.subcategory ?? ""} ${product.name ?? ""}`).includes("spray")
    );
    if (sprayResults.length > 0) {
      return sprayResults.slice(0, 12);
    }
  }

  if (inferredProductHints.includes("stick")) {
    const stickResults = sortedResults.filter((product) =>
      normalizeCatalogMatchText(`${product.subcategory ?? ""} ${product.name ?? ""}`).includes("stick")
    );
    // If no stick products exist in catalog, return empty so system does not invent any
    return stickResults.slice(0, 12);
  }

  // ── Haircare subcategory format-first matching ────────────────────────────
  const hairSub = intentSignals.haircareSubcategory;
  if (hairSub && hairSub.subcategoryId && !hairSub.isAmbiguous) {
    if (hairSub.subcategoryId === 'fb') {
      // Subcategory fb has 0 products and unknown meaning; never fabricate or invent products
      return [];
    }

    if (hairSub.subcategoryId === 'Haircare') {
      // Main category request: return all Haircare products
      const mainCatResults = sortedResults.filter((p) => {
        const cat = String(p.category ?? '').toLowerCase();
        const sub = String(p.subcategory ?? '').toLowerCase();
        return cat.includes('hair') || HAIRCARE_SUBCATEGORIES.some(hs => hs.toLowerCase() === sub);
      });
      if (mainCatResults.length > 0) return mainCatResults.slice(0, 12);
      const directMainCat = products.filter((p) => {
        const cat = String(p.category ?? '').toLowerCase();
        const sub = String(p.subcategory ?? '').toLowerCase();
        return cat.includes('hair') || HAIRCARE_SUBCATEGORIES.some(hs => hs.toLowerCase() === sub);
      });
      if (directMainCat.length > 0) return directMainCat.slice(0, 12);
    } else {
      const targetSub = String(hairSub.subcategoryId).trim().toLowerCase();
      const matchProductToSub = (product: Product) => {
        const prodSub = String(product.subcategory ?? '').trim().toLowerCase();
        const prodSubId = String(product.subcategoryId ?? '').trim().toLowerCase();
        const prodName = String(product.name ?? '').trim().toLowerCase();
        const prodCat = String(product.category ?? '').trim().toLowerCase();
        const isHair = prodCat.includes('hair') || prodSub.includes('hair') || prodName.includes('hair');

        if (prodSub === targetSub || prodSubId === targetSub) {
          if (targetSub === 'serum' && (prodSub.includes('eyelash') || prodName.includes('eyelash') || !isHair)) return false;
          if (targetSub === 'cream' && !isHair) return false;
          if (targetSub === 'oil' && !isHair) return false;
          if (targetSub === 'mask' && !isHair) return false;
          if (targetSub === 'hair lotion' && !isHair) return false;
          return true;
        }

        if (targetSub === 'eyelash serum') {
          return prodSub === 'eyelash serum' || prodSub.includes('eyelash') || prodName.includes('eyelash');
        }
        if (targetSub === 'serum') {
          return isHair && (prodSub === 'serum' || prodName.includes('serum')) && !prodSub.includes('eyelash') && !prodName.includes('eyelash');
        }
        if (targetSub === 'leave in') {
          return prodSub === 'leave in' || prodSub.includes('leave in') || prodSub.includes('leave-in') || prodName.includes('leave in') || prodName.includes('leave-in');
        }
        if (targetSub === 'shampoo') {
          return prodSub === 'shampoo' || prodSub.includes('shampoo') || prodName.includes('shampoo');
        }
        if (targetSub === 'conditioner') {
          return prodSub === 'conditioner' || prodSub.includes('conditioner') || prodName.includes('conditioner') || prodName.includes('بلسم');
        }
        if (targetSub === 'ampoules') {
          return prodSub === 'ampoules' || prodSub.includes('ampoule') || prodName.includes('ampoule') || prodName.includes('امبول');
        }
        if (targetSub === 'mask') {
          return isHair && (prodSub === 'mask' || prodSub.includes('mask') || prodName.includes('mask'));
        }
        if (targetSub === 'spray') {
          return (isHair || !prodCat.includes('deodorant')) && (prodSub === 'spray' || prodSub.includes('spray') || prodName.includes('spray'));
        }
        if (targetSub === 'hair water') {
          return prodSub === 'hair water' || (prodSub.includes('water') && isHair);
        }
        if (targetSub === 'scalp') {
          return prodSub === 'scalp' || prodSub.includes('scalp') || prodName.includes('scalp');
        }
        if (targetSub === 'hair mist') {
          return prodSub === 'hair mist' || (prodSub.includes('mist') && isHair);
        }
        if (targetSub === 'oil') {
          return isHair && (prodSub === 'oil' || prodSub.includes('oil') || prodName.includes('oil'));
        }
        if (targetSub === 'hair lotion') {
          return isHair && (prodSub === 'hair lotion' || prodSub.includes('lotion') || prodName.includes('lotion'));
        }
        if (targetSub === 'cream') {
          return isHair && (prodSub === 'cream' || prodSub.includes('cream') || prodName.includes('cream'));
        }

        return false;
      };

      const subMatches = sortedResults.filter(matchProductToSub);
      if (subMatches.length > 0) {
        return subMatches.slice(0, 12);
      }
      const directMatches = products.filter(matchProductToSub);
      if (directMatches.length > 0) {
        return directMatches.slice(0, 12);
      }
      // If a specific subcategory was explicitly requested and 0 products match in catalog,
      // return empty so the chatbot does not invent products.
      return [];
    }
  }

  // ── Skin Care subcategory format-first matching ────────────────────────────
  const skinCareSub = intentSignals.skinCareSubcategory;
  if (skinCareSub && skinCareSub.subcategoryId && !skinCareSub.isAmbiguous) {
    if (skinCareSub.subcategoryId === 'Skin Care') {
      // Main category request: consider all Skin Care products
      const mainCatResults = sortedResults.filter((p) => {
        const cat = String(p.category ?? '').toLowerCase();
        return cat.includes('skin') || cat.includes('face') || cat.includes('body');
      });
      if (mainCatResults.length > 0) return mainCatResults.slice(0, 12);
    } else {
      const targetSub = String(skinCareSub.subcategoryId).trim().toLowerCase();
      const ZERO_PRODUCT_SUBCATEGORIES = new Set(["hair lotion", "hair serum", "hair mask"]);
      if (ZERO_PRODUCT_SUBCATEGORIES.has(targetSub)) {
        // Zero products exist in catalog; return empty without inventing products
        return [];
      }

      const subMatches = sortedResults.filter((product) => {
        const prodSub = String(product.subcategory ?? '').trim().toLowerCase();
        const prodSubId = String(product.subcategoryId ?? '').trim().toLowerCase();
        const prodName = String(product.name ?? '').trim().toLowerCase();

        if (prodSub === targetSub || prodSubId === targetSub) return true;
        if (targetSub.includes(prodSub) && prodSub.length > 3) return true;
        if (prodSub.includes(targetSub)) return true;

        // Specific subcategory alias checks
        if (targetSub === 'lip palm') return prodSub === 'lip palm' || prodSub.includes('balm') || prodName.includes('balm') || prodSub.includes('palm');
        if (targetSub === 'face cleanser') return prodSub === 'face cleanser' || (prodSub.includes('clean') && !prodSub.includes('body')) || (prodSub.includes('wash') && prodSub.includes('face'));
        if (targetSub === 'body wash') return prodSub === 'body wash' || (prodSub.includes('wash') && prodSub.includes('body')) || prodSub.includes('shower');
        if (targetSub === 'face creams & moisturizers') return prodSub === 'face creams & moisturizers' || (prodSub.includes('cream') && !prodSub.includes('body') && !prodSub.includes('hand') && !prodSub.includes('bikini')) || prodSub.includes('moistur');
        if (targetSub === 'sunscreen') return prodSub === 'sunscreen' || prodSub.includes('sun') || prodSub.includes('spf') || prodSub.includes('block');
        if (targetSub === 'nail oil') return prodSub === 'nail oil' || prodSub.includes('nail');
        if (targetSub === 'eye contour') return prodSub === 'eye contour' || prodSub.includes('eye') || prodSub.includes('contour');
        if (targetSub === 'body urea') return prodSub === 'body urea' || prodSub.includes('urea');
        if (targetSub === 'body cream') return prodSub === 'body cream' || (prodSub.includes('cream') && prodSub.includes('body'));
        if (targetSub === 'body lotion') return prodSub === 'body lotion' || (prodSub.includes('lotion') && !prodSub.includes('hair'));
        if (targetSub === 'body oil') return prodSub === 'body oil' || (prodSub.includes('oil') && prodSub.includes('body'));
        if (targetSub === 'lip gloss') return prodSub === 'lip gloss' || prodSub.includes('gloss');
        if (targetSub === 'hand cream') return prodSub === 'hand cream' || prodSub.includes('hand');
        if (targetSub === 'toner') return prodSub === 'toner' || prodSub.includes('toner');
        if (targetSub === 'foundation') return prodSub === 'foundation' || prodSub.includes('foundation');
        if (targetSub === 'bikini') return prodSub === 'bikini' || prodSub.includes('bikini');
        if (targetSub === 'serum') return prodSub === 'serum' || (prodSub.includes('serum') && !prodSub.includes('hair'));

        return false;
      });

      if (subMatches.length > 0) {
        return subMatches.slice(0, 12);
      }
    }
  }

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
      const relevantHistory = getRelevantConversationHistory(messages, userMessage);
      const matchedCatalog = searchCatalogProducts(visibleProducts, trimmed, relevantHistory);
      const catalog = buildCatalogContext(matchedCatalog.length > 0 ? matchedCatalog : visibleProducts, trimmed);
      const catalogStatusLine = getCatalogAvailabilityStatus({
        products: visibleProducts,
        query: trimmed,
        matchedProducts: matchedCatalog,
        catalogLoading,
        catalogError,
      });

      const systemPrompt = `You are PhM Concierge — a helpful, friendly shopping assistant for PherMono. Keep replies concise, human, and in the user's detected language (Egyptian Arabic if Arabic detected; otherwise English). Always:

    - Resolve the product and intent for the current message before answering. Do not carry a previous product into a new request unless the user clearly refers back to it with phrases like "what about its price?", "another one", or "show me more".

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
    - Deodorant requests: recognise مزيل عرق/ريحة العرق (Arabic meaning), ديودرانت/ديودرنت/ديودورانت (Arabizi), and subcategory terms: رول أون/رولون → Roll-On, سبراي/بخاخ → Spray, ستيك → Stick. Only claim product properties (e.g., alcohol-free, for sensitive skin, 24-hour protection) when the OFFICIAL_DATABASE_DESCRIPTION explicitly supports the claim. If the user asks for Stick and no Stick products exist in the catalog, say so clearly and offer Roll-On or Spray alternatives from the catalog instead.
    - Spray disambiguation: if a user mentions "سبراي" without deodorant context, ask a short clarifying question (hair spray, deodorant spray, or other?) rather than guessing.
    - Skin Care requests & subcategories:
      - Recognize both phonetic transliterations (Path A) and Arabic translations/semantic equivalents (Path B) for all Skin Care subcategories: Face cleanser (غسول الوجه / كلينزر), body lotion (لوشن للجسم / بودي لوشن), Face Creams & Moisturizers (كريم وجه / مرطب وش / فيس كريم), BODY WASH (غسول الجسم / شاور جل), SunSCREEN (واقي شمس / صن سكرين), NAIL OIL (زيت أظافر / نيل اويل), LIP PALM (مرطب شفاه / بلسم شفاه / ليب بالم - note: recognize as lip balm without altering catalog names), Serum (مصل للبشرة / سيروم), eye contour (كريم العين / كونتور العين / آي كونتور), body Urea (يوريا للجسم / بودي يوريا), body cream (كريم جسم / بودي كريم), Toner (تونر للوجه), Foundation (كريم أساس / فاونديشن), Body Oil (زيت جسم / بودي اويل), LIP GLOSS (ملمع شفاه / ليب جلوس), bikini (تفتيح المناطق الحساسة / كريم بكيني), Hand cream (كريم لليدين / هاند كريم).
      - Ambiguity handling: for isolated terms like "كريم", "زيت", "غسول", "سيروم", use conversation context and history to resolve; if completely ambiguous (e.g., user says only "عايز كريم" or "عندكم زيت؟"), ask ONE concise clarifying question (e.g., "حابب كريم للوجه ولا للجسم ولا لليدين؟") instead of guessing.
      - Product descriptions as primary truth: answer questions about what a product does, ingredients, SPF, night/day use, or skin suitability strictly from OFFICIAL_DATABASE_DESCRIPTION. Never invent unsupported claims.
      - Zero-product subcategories (Hair Lotion, Hair Serum, Hair Mask): if requested in Skin Care context, explain clearly that this format is currently unavailable in Skin Care, and suggest relevant existing alternatives instead of fabricating products.
    - Haircare requests & subcategories:
      - Recognize both phonetic transliterations (Path A) and Arabic translations/semantic equivalents (Path B) for all 15 Haircare subcategories:
        1. Shampoo (شامبو / شامپو)
        2. Conditioner (بلسم / كونديشنر / كنديشنر / ملين للشعر)
        3. ampoules (أمبولات / امبولات الشعر / أمبول)
        4. serum (سيروم شعر / سيرم للشعر / مصل للشعر)
        5. mask (ماسك شعر / حمام كريم)
        6. leave in (ليف ان / بديل الزيت / كريم يترك على الشعر / منتج بعد الشاور بدون شطف)
        7. spray (سبراي شعر / بخاخ شعر)
        8. hair water (هير ووتر / ماء للشعر)
        9. scalp (عناية بفروة الرأس / سكالپ / منتج للفروة)
        10. hair mist (هير ميست / معطر شعر)
        11. EYELASH SERUM (سيروم رموش / مصل للرموش / تكثيف الرموش) - IMPORTANT: this is strictly for eyelashes, NOT hair or scalp!
        12. Oil (زيت شعر / هير اويل)
        13. Hair Lotion (هير لوشن / لوشن للشعر)
        14. Cream (كريم شعر / هير كريم)
        15. fb (subcat fb: currently has 0 products and unknown meaning; if asked, state clearly that it is unavailable and never invent products or meanings for fb).
      - Strict distinction between hair serum (serum) and eyelash serum (EYELASH SERUM): queries mentioning eyelashes/رموش map to EYELASH SERUM; queries mentioning hair/شعر or general scalp map to hair serum.
      - Strict distinction between leave-in products (leave in) and rinse-off products (Conditioner, mask): when a user asks for a leave-in product (e.g. "حاجة تتساب على الشعر من غير شطف" or "ليف ان"), recommend leave-in products; do NOT suggest rinse-off conditioners or masks as leave-ins.
      - Ambiguity handling: for isolated terms like "كريم", "زيت", "سبراي", "سيروم", use conversation history context to resolve; if no context, ask ONE short clarifying question instead of guessing.
      - Description grounding: only claim hair benefits (e.g. anti-dandruff, hair growth/anti-loss, curl definition, frizz control, heat protection) if the product's OFFICIAL_DATABASE_DESCRIPTION explicitly states that benefit.
    - If the catalog shows relevant products, ALWAYS recommend from the catalog. Do not say "not available" when catalog items exist.

    Tone: warm, polite, and conversational (Egyptian Arabic slang when user message is Arabic).

    ${catalogStatusLine}

    STORE PRODUCT CATALOG:
    ${catalog}`;

      const recent = buildGroqMessages(relevantHistory, userMessage);
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
