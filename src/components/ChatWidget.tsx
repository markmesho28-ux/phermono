import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
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
}

const defaultMessages: ChatMessage[] = [
  {
    id: 1,
    sender: "bot",
    text: "Hi! I can help you find the best products for your skin, hair, and beauty routine.",
    time: "Now",
  },
  {
    id: 2,
    sender: "bot",
    text: "Tell me what you need or what problem you’re trying to solve, and I’ll recommend the most relevant items from our catalog.",
    time: "Now",
  },
];

const GROQ_MODEL = "openai/gpt-oss-20b";

// Load Groq API keys from environment variables to avoid committing secrets.
// Support either a single key `VITE_GROQ_API_KEY` or a comma-separated list `VITE_GROQ_API_KEYS`.
const GROQ_API_KEYS: string[] = (() => {
  try {
    const envList = (import.meta.env.VITE_GROQ_API_KEYS ?? "") as string;
    const single = (import.meta.env.VITE_GROQ_API_KEY ?? "") as string;
    const fromList = envList.split(",").map((s) => s.trim()).filter(Boolean);
    const keys = fromList.slice();
    if (single && !keys.includes(single)) keys.unshift(single);
    return keys;
  } catch {
    return [];
  }
})();
const MAX_DAILY_MESSAGES_PER_USER = 20;
const GUEST_CHAT_USAGE_TABLE = "guest_chat_usage";
const USER_CHAT_USAGE_TABLE = "user_chat_usage";
const LOCAL_GUEST_LIMIT_KEY = "phermono_guest_daily_limit_v1";
const LOCAL_USER_LIMIT_KEY = "phermono_user_daily_limit_v1";

let groqKeyIndex = 0;

const getNextGroqKey = () => {
  if (!GROQ_API_KEYS || GROQ_API_KEYS.length === 0) return "";
  const key = GROQ_API_KEYS[groqKeyIndex % GROQ_API_KEYS.length];
  groqKeyIndex = (groqKeyIndex + 1) % GROQ_API_KEYS.length;
  return key;
};

const getDayStamp = () => new Date().toISOString().slice(0, 10);

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

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("YOUR_SUPABASE")
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

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
  return getUsageLimitStatus(messageCount);
};

const incrementGuestUsage = async (fingerprint: string) => {
  if (supabase) {
    const date = getDayStamp();
    const nextCount = readLocalGuestUsage(fingerprint) + 1;

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
  return getUsageLimitStatus(messageCount);
};

const incrementUserUsage = async (userId: string) => {
  if (supabase) {
    const date = getDayStamp();
    const nextCount = readLocalUserUsage(userId) + 1;

    const { error } = await supabase.from(USER_CHAT_USAGE_TABLE).upsert(
      {
        user_id: userId,
        date,
        message_count: nextCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    );

    if (error) {
      console.warn("User chat usage update failed:", error.message);
    }

    writeLocalUserUsage(userId, nextCount);
    return getUsageLimitStatus(nextCount);
  }

  const nextCount = readLocalUserUsage(userId) + 1;
  writeLocalUserUsage(userId, nextCount);
  return getUsageLimitStatus(nextCount);
};

const buildCatalogContext = (products: Product[] = []) => {
  if (!products.length) {
    return "No product catalog available yet.";
  }

  return products
    .slice(0, 200)
    .map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      skinType: product.skinType ?? "All",
      price: product.price,
      originalPrice: product.originalPrice ?? product.marketPrice ?? null,
      rating: product.rating,
      description: product.description,
      tag: product.tag ?? null,
    }))
    .map((item) => JSON.stringify(item))
    .join("\n");
};

const formatBotText = (text: string): string => {
  if (!text) return "I’m not sure yet, but I can help narrow it down based on your routine and preferences.";
  return text.replace(/\n+/g, " ").trim();
};

export default function ChatWidget({ products = [] }: ChatWidgetProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [guestFingerprint, setGuestFingerprint] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

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
        if (!status.allowed || status.messageCount + 1 > MAX_DAILY_MESSAGES_PER_USER) {
          const limitMessage =
            "You’ve reached the daily guest limit of 20 chat messages. Sign in to continue asking about products.";
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
        if (!status.allowed || status.messageCount + 1 > MAX_DAILY_MESSAGES_PER_USER) {
          const limitMessage =
            "You’ve reached your daily limit of 20 chat messages. Please sign in again tomorrow or continue browsing the catalog.";
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
      const requestBody = {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a premium beauty and skincare shopping assistant for a modern e-commerce storefront. Use ONLY the catalog below when recommending products. If a customer describes a skin concern, product need, or shopping goal, analyze it and suggest the exact relevant products from the catalog. Recommend specific products by name and brand, explain why they fit, and keep recommendations concise and helpful. Do not invent products that are not in the catalog. Catalog: ${catalog}`,
          },
          { role: "user", content: trimmed },
        ],
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 300,
      };

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < GROQ_API_KEYS.length; attempt += 1) {
        const apiKey = getNextGroqKey();

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
          const reply = rawText || "I found a few matching ideas. Tell me your skin type or concern and I’ll narrow it down further.";

          const botMessage: ChatMessage = {
            id: Date.now() + 1,
            sender: "bot",
            text: formatBotText(reply),
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

      throw new Error("Groq API key rotation failed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong while generating a recommendation.";

      setErrorMessage(message);

      const fallback: ChatMessage = {
        id: Date.now() + 1,
        sender: "bot",
        text: "I’m having trouble reaching the AI assistant right now. Please try again in a moment, or describe your concern and I can still help you narrow down the best products from our catalog.",
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

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <div className={`transition-all duration-300 ${isOpen ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"}`}>
        <div className="mb-4 w-[22rem] overflow-hidden rounded-[28px] border border-stone-200 bg-white/95 shadow-[0_25px_60px_-18px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:w-[24rem]">
          <header className="flex items-center justify-between border-b border-stone-200 bg-gradient-to-r from-brand-black via-brand-charcoal to-stone-900 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold/20 text-brand-gold ring-1 ring-brand-gold/40">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold">PhM Concierge</p>
                <p className="text-[10px] uppercase tracking-[0.22em] text-stone-300">AI shopping assistant</p>
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

          <div ref={scrollRef} className="h-72 overflow-y-auto bg-stone-50 px-3 py-4 sm:h-80">
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                      message.sender === "user"
                        ? "bg-brand-black text-white"
                        : "border border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    <p>{message.text}</p>
                    <span
                      className={`mt-1 block text-[10px] ${
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
                      <span>Thinking...</span>
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
                placeholder="Ask about products..."
                className="flex-1 border-0 bg-transparent px-3 py-1.5 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed"
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
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className="group relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold via-amber-400 to-yellow-500 text-brand-black shadow-[0_18px_40px_-12px_rgba(234,179,8,0.75)] transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-brand-gold/30"
      >
        <span className="absolute inset-0 rounded-full animate-pulse bg-brand-gold/30" />
        <span className="absolute inset-1 rounded-full border border-brand-black/10 bg-white/10" />
        <MessageCircleMore size={24} className="relative z-10" />
      </button>
    </div>
  );
}
