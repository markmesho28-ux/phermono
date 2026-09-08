import React, { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabase";
import { MessageCircleMore, SendHorizonal, Sparkles, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../types";

interface ChatMessage {
  id: number;
  sender: "user" | "bot";
  text: string;
  time: string;
}

interface ChatWidgetProps {
  products?: Product[];
  mode?: "floating" | "page";
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
const MAX_DAILY_MESSAGES_PER_USER = 20;
const GUEST_CHAT_USAGE_TABLE = "guest_chat_usage";
const USER_CHAT_USAGE_TABLE = "user_chat_usage";
// Bump version suffix whenever the counting semantics change to clear stale stored data.
const LOCAL_GUEST_LIMIT_KEY = "phermono_guest_daily_limit_v2";
const LOCAL_USER_LIMIT_KEY = "phermono_user_daily_limit_v2";

let groqKeyIndex = 0;

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

export const buildCatalogContext = (products: Product[] = []) => {
  if (!products.length) {
    return "No product catalog available yet.";
  }

  // Limit catalog context size to reduce token usage
  return products
    .slice(0, 30)
    .map((p, idx) => {
      const isHair =
        p.category === "haircare" ||
        /hair|shampoo|conditioner|curl|scalp|frizz|شعر|كيرلي/i.test(
          `${p.category} ${p.subcategory ?? ""} ${p.name} ${p.description ?? ""}`
        );

      const price = p.price != null ? `${p.price} EGP` : "price not set";
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
        `SUBCATEGORY: ${p.subcategory || "general"}`,
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

export default function ChatWidget({ products = [], mode = "page" }: ChatWidgetProps) {
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

      const catalog = buildCatalogContext(products);
      const systemPrompt = `You are PhM Concierge — a helpful, friendly shopping assistant for PherMono. Keep replies concise, human, and in the user's detected language (Egyptian Arabic if Arabic detected; otherwise English). Always:

    - Use only products from the provided STORE PRODUCT CATALOG.
    - Keep recommendations short (max 2 products) and avoid long lists.
    - Do NOT emit markdown, tables, bullets, or numbered lists; respond as natural chat text.
    - Be truthful about inventory; if a requested product is not available, offer the closest alternative.

    Tone: warm, polite, and conversational (Egyptian Arabic slang when user message is Arabic).

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

        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (response.status === 429) {
            const errorText = await response.text();
            lastError = new Error(errorText || "Rate limit exceeded. Retrying with the next Groq key.");
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
          if (error instanceof Error && /429|rate limit|too many requests/i.test(error.message)) {
            lastError = error;
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
      <div className="w-full bg-brand-cream px-4 py-6 pb-20">
        <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-stone-200 bg-white/95 shadow-[0_25px_60px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl overflow-hidden flex flex-col" style={{ minHeight: "calc(100dvh - 160px)" }}>
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
    );
  }

  return (
    <div data-chat-widget className="fixed bottom-6 left-6 z-[90] pointer-events-none max-md:bottom-[calc(5.75rem+env(safe-area-inset-bottom))] max-md:left-3 max-md:right-auto">
      <div data-chat-panel-wrapper className={`pointer-events-none transition-all duration-300 ${isOpen ? "pointer-events-auto opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"}`}>
        <div
          data-chat-panel
          className="mb-4 w-[22rem] max-md:fixed max-md:top-[calc(0.75rem+env(safe-area-inset-top))] max-md:right-3 max-md:left-auto max-md:w-[min(270px,calc(100vw-24px))] max-md:max-w-[calc(100vw-24px)] max-md:max-h-[calc(100dvh-104px)] max-md:overflow-hidden overflow-hidden rounded-[28px] border border-stone-200 bg-white/95 shadow-[0_25px_60px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:w-[24rem] max-md:rounded-[22px] max-md:flex max-md:flex-col"
          style={{ maxHeight: "calc(100dvh - 104px)" }}
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-stone-200 transition hover:bg-white/20 hover:text-white"
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
        className="group relative z-[110] flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold via-amber-400 to-yellow-500 text-brand-black shadow-[0_18px_40px_-12px_rgba(234,179,8,0.75)] transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-brand-gold/30 pointer-events-auto max-md:h-14 max-md:w-14"
      >
        <span className="absolute inset-0 rounded-full animate-pulse bg-brand-gold/30" />
        <span className="absolute inset-1 rounded-full border border-brand-black/10 bg-white/10" />
        <MessageCircleMore size={24} className="relative z-10" />
      </button>
    </div>
  );
}
