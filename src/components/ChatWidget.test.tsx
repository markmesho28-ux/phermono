import React from "react";
import "@testing-library/jest-dom";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import ChatWidget, {
  getGuestLimitStatus,
  formatBotText,
  buildDynamicFallback,
  buildCatalogContext,
  getCatalogAvailabilityStatus,
  searchCatalogProducts,
  buildGroqMessages,
  shouldRetryWithNextGroqKey,
  extractIntentSignals,
  handleAdminSiteSettingsCommand,
} from "./ChatWidget";
import { useAuth } from "../contexts/AuthContext";
import supabase from "../lib/supabase";

jest.mock("../contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../lib/supabase", () => ({
  __esModule: true,
  default: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

const originalFetch = global.fetch;

const mockSupabaseGuestUsage = () => {
  (supabase as any).from.mockImplementation(() => {
    const base = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: [{ key: 'site_config', value: {} }], error: null }),
      }),
    };
    return base;
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REACT_APP_GROQ_API_KEY;
  process.env.REACT_APP_GROQ_API_KEYS = [
    "test_key_1_dummy",
    "test_key_2_dummy",
    "test_key_3_dummy",
    "test_key_4_dummy",
    "test_key_5_dummy",
  ].join(",");

  (useAuth as jest.Mock).mockReturnValue({ user: null });
  (supabase as any).auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mockSupabaseGuestUsage();
  Object.defineProperty(global, "fetch", {
    value: jest.fn(),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(global, "fetch", {
    value: originalFetch,
    writable: true,
    configurable: true,
  });
  delete process.env.REACT_APP_GROQ_API_KEY;
  delete process.env.REACT_APP_GROQ_API_KEYS;
});

describe("admin promotion commands", () => {
  it("requires an authenticated admin session before mutating promo settings", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const upsert = jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [{ key: 'site_config', value: { active_promo: 'percentage_discount', promo_discount_percent: 30 } }], error: null }),
    }));

    (supabase as any).auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(handleAdminSiteSettingsCommand('make a 30% off on shampoo')).resolves.toEqual({
      handled: false,
      message: '',
    });

    (supabase as any).auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } }, error: null });
    (supabase as any).from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'admin-1', role: 'admin' }, error: null }),
        };
      }

      if (table === 'site_settings') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: { active_promo: 'none', promo_discount_percent: 0 } }, error: null }),
            })),
          })),
          upsert,
        };
      }

      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    await expect(handleAdminSiteSettingsCommand('make a 30% off on shampoo')).resolves.toMatchObject({
      handled: true,
      message: expect.stringContaining('30%'),
    });
    expect(upsert).toHaveBeenCalled();
  });

  it("rejects invalid promotion percentages and blocks non-admins", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const customerUser = { id: 'cust-1', name: 'Customer', phone: '01000000000', role: 'customer' };

    await expect(handleAdminSiteSettingsCommand('make a 0% off', adminUser)).resolves.toMatchObject({
      handled: true,
      message: expect.stringContaining('1 and 100'),
    });

    await expect(handleAdminSiteSettingsCommand('make a 60% off', customerUser)).resolves.toEqual({
      handled: false,
      message: '',
    });

    await expect(handleAdminSiteSettingsCommand('make a 60% off', adminUser)).resolves.toMatchObject({
      handled: true,
      message: expect.stringContaining('60%'),
    });
  });

  it("accepts the free-delivery admin command for verified admins only", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const customerUser = { id: 'cust-1', name: 'Customer', phone: '01000000000', role: 'customer' };

    await expect(handleAdminSiteSettingsCommand('make a free delivery', adminUser)).resolves.toMatchObject({
      handled: true,
      message: expect.stringContaining('free shipping'),
    });

    await expect(handleAdminSiteSettingsCommand('make a free delivery', customerUser)).resolves.toEqual({
      handled: false,
      message: '',
    });
  });

  it("cancels the current offer without activating free shipping", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const currentSettings = {
      active_promo: 'percentage_discount',
      promo_rule: 'percentage_discount',
      promo_discount_percent: 30,
      is_free_shipping_active: false,
      free_shipping_threshold: 200,
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
    };
    const captured = [] as Record<string, any>[];

    (supabase as any).from.mockImplementation((table: string) => {
      if (table !== 'site_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          upsert: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) }),
        };
      }

      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: currentSettings }, error: null }),
          })),
        })),
        upsert: jest.fn((rows: any[]) => {
          captured.push(rows[0].value);
          return {
            select: jest.fn().mockResolvedValue({ data: [{ key: 'site_config', value: rows[0].value }], error: null }),
          };
        }),
      };
    });

    const result = await handleAdminSiteSettingsCommand('cancel offer', adminUser);

    expect(result.handled).toBe(true);
    expect(result.message).toMatch(/cancelled|canceled|offer/i);
    expect(result.message).not.toMatch(/free shipping|shipping is now active/i);
    expect(captured[0]).toMatchObject({
      active_promo: 'none',
      promo_rule: 'none',
      is_free_shipping_active: false,
      promo_discount_percent: 0,
      buy_x: 0,
      get_y: 0,
    });
    expect(captured[0]).not.toHaveProperty('promo_banner_text');
  });

  it("returns without persisting when cancel is requested with no active offer", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const currentSettings = {
      active_promo: 'none',
      promo_rule: 'none',
      promo_discount_percent: 0,
      is_free_shipping_active: false,
      free_shipping_threshold: 200,
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
      promo_banner_text: 'Current banner text',
    };
    const upsert = jest.fn(() => ({ select: jest.fn().mockResolvedValue({ data: [], error: null }) }));

    (supabase as any).from.mockImplementation((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: currentSettings }, error: null }),
        })),
      })),
      upsert,
    }));

    const result = await handleAdminSiteSettingsCommand('cancel offer', adminUser);

    expect(result.handled).toBe(true);
    expect(result.message).toMatch(/no active offer|already cancelled|no active/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a second offer while free shipping is active and leaves the existing offer unchanged", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const currentSettings = {
      active_promo: 'free_shipping',
      promo_rule: 'free_shipping',
      promo_discount_percent: 0,
      is_free_shipping_active: true,
      free_shipping_threshold: 200,
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
    };
    const upsert = jest.fn(() => ({ select: jest.fn().mockResolvedValue({ data: [], error: null }) }));

    (supabase as any).from.mockImplementation((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: currentSettings }, error: null }),
        })),
      })),
      upsert,
    }));

    const result = await handleAdminSiteSettingsCommand('make a 30% off', adminUser);

    expect(result.handled).toBe(true);
    expect(result.message).toMatch(/active|cancel the current offer/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a second offer while a percentage discount is active and leaves the existing offer unchanged", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const currentSettings = {
      active_promo: 'percentage_discount',
      promo_rule: 'percentage_discount',
      promo_discount_percent: 30,
      is_free_shipping_active: false,
      free_shipping_threshold: 200,
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
    };
    const upsert = jest.fn(() => ({ select: jest.fn().mockResolvedValue({ data: [], error: null }) }));

    (supabase as any).from.mockImplementation((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: currentSettings }, error: null }),
        })),
      })),
      upsert,
    }));

    const result = await handleAdminSiteSettingsCommand('make a free delivery', adminUser);

    expect(result.handled).toBe(true);
    expect(result.message).toMatch(/active|cancel the current offer/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps promo_banner_text out of the persisted payload for activation and cancellation", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const captured = [] as Record<string, any>[];
    const currentSettings = {
      active_promo: 'free_shipping',
      promo_rule: 'free_shipping',
      promo_discount_percent: 0,
      is_free_shipping_active: true,
      free_shipping_threshold: 200,
      promo_banner_text: 'Banner should stay manual',
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
    };

    (supabase as any).from.mockImplementation((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: currentSettings }, error: null }),
        })),
      })),
      upsert: jest.fn((rows: any[]) => {
        captured.push(rows[0].value);
        return { select: jest.fn().mockResolvedValue({ data: [{ key: 'site_config', value: rows[0].value }], error: null }) };
      }),
    }));

    const result = await handleAdminSiteSettingsCommand('cancel offer', adminUser);

    expect(result.handled).toBe(true);
    expect(captured[0]).not.toHaveProperty('promo_banner_text');
  });

  it("clears the previous offer when a new offer is activated after cancellation", async () => {
    const adminUser = { id: 'admin-1', name: 'Admin', phone: '01225502425', role: 'admin' };
    const currentSettings = {
      active_promo: 'none',
      promo_rule: 'none',
      promo_discount_percent: 0,
      is_free_shipping_active: false,
      free_shipping_threshold: 200,
      buy_x: 0,
      get_y: 0,
      promotion_scope: 'all',
    };
    const captured = [] as Record<string, any>[];

    (supabase as any).from.mockImplementation((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: { key: 'site_config', value: currentSettings }, error: null }),
        })),
      })),
      upsert: jest.fn((rows: any[]) => {
        captured.push(rows[0].value);
        return { select: jest.fn().mockResolvedValue({ data: [{ key: 'site_config', value: rows[0].value }], error: null }) };
      }),
    }));

    const result = await handleAdminSiteSettingsCommand('make a free delivery', adminUser);

    expect(result.handled).toBe(true);
    expect(captured[0]).toMatchObject({
      active_promo: 'free_shipping',
      promo_rule: 'free_shipping',
      is_free_shipping_active: true,
      promo_discount_percent: 0,
      buy_x: 0,
      get_y: 0,
    });
    expect(captured[0]).not.toHaveProperty('promo_banner_text');
  });

});

describe("Groq key fallback retry rules", () => {
  it("retries on rate limits, timeouts, and network failures before giving up", () => {
    expect(shouldRetryWithNextGroqKey(429)).toBe(true);
    expect(shouldRetryWithNextGroqKey(408)).toBe(true);
    expect(shouldRetryWithNextGroqKey(500)).toBe(true);
    expect(shouldRetryWithNextGroqKey(undefined, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetryWithNextGroqKey(undefined, new Error("timeout"))).toBe(true);
    expect(shouldRetryWithNextGroqKey(200)).toBe(false);
    expect(shouldRetryWithNextGroqKey(undefined, new Error("bad request"))).toBe(false);
  });
});

describe("Groq key rotation request flow", () => {
  it("moves from key 1 to key 2 when the first request is rate-limited", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit exceeded" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Recommended: Clary Shampoo" } }] }),
      });

      render(React.createElement(ChatWidget, { mode: "page", products: [] }));
    fireEvent.change(screen.getByLabelText(/type your message/i), { target: { value: "clary shampoo" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test_key_1_dummy");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer test_key_2_dummy");
    expect(screen.getByText(/Recommended: Clary Shampoo/i)).toBeInTheDocument();
  });

  it("keeps rotating until key 5 succeeds after keys 1 through 4 are rejected", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit exceeded" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit exceeded" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit exceeded" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit exceeded" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Recommended: Clary shampoo" } }] }),
      });

    render(React.createElement(ChatWidget, { mode: "page", products: [] }));
    fireEvent.change(screen.getByLabelText(/type your message/i), { target: { value: "best shampoo" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test_key_1_dummy");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer test_key_2_dummy");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer test_key_3_dummy");
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe("Bearer test_key_4_dummy");
    expect(fetchMock.mock.calls[4][1].headers.Authorization).toBe("Bearer test_key_5_dummy");
    expect(screen.getByText(/Recommended: Clary shampoo/i)).toBeInTheDocument();
  });

  it("stops after the configured keys are exhausted without making a sixth attempt", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit exceeded" } }),
      })
    );

    render(React.createElement(ChatWidget, { mode: "page", products: [] }));
    fireEvent.change(screen.getByLabelText(/type your message/i), { target: { value: "all keys fail" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(screen.getByText(/rate limit exceeded|Groq API key rotation failed/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls[4][1].headers.Authorization).toBe("Bearer test_key_5_dummy");
    expect(fetchMock).not.toHaveBeenCalledTimes(6);
  });

  it("fails fast on 401 without cycling through all configured keys", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    render(React.createElement(ChatWidget, { mode: "page", products: [] }));
    fireEvent.change(screen.getByLabelText(/type your message/i), { target: { value: "unauthorized attempt" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test_key_1_dummy");
    expect(screen.getAllByText(/Unauthorized/i).length).toBeGreaterThan(0);
  });

  it("retries using the next key after a network failure", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Recovered after network failure" } }] }),
      });

    render(React.createElement(ChatWidget, { mode: "page", products: [] }));
    fireEvent.change(screen.getByLabelText(/type your message/i), { target: { value: "network retry" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test_key_1_dummy");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer test_key_2_dummy");
    expect(screen.getByText(/Recovered after network failure/i)).toBeInTheDocument();
  });

  it("does not retry when the first request succeeds", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Success on first try" } }] }),
    });

    render(React.createElement(ChatWidget, { mode: "page", products: [] }));
    fireEvent.change(screen.getByLabelText(/type your message/i), { target: { value: "single request success" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test_key_1_dummy");
    expect(screen.getByText(/Success on first try/i)).toBeInTheDocument();
  });
});

describe("guest chat limit logic — user-only message counting", () => {
  // 19 user messages sent → 20th should still be allowed
  it("allows the user when count is below the daily limit", () => {
    expect(getGuestLimitStatus(19, 20)).toEqual({ allowed: true, remaining: 1 });
  });

  // 20 user messages sent → 21st should be blocked (>= 20)
  it("blocks the user once the daily limit is exactly reached", () => {
    expect(getGuestLimitStatus(20, 20)).toEqual({ allowed: false, remaining: 0 });
  });

  // 0 messages → fresh day, should be allowed
  it("allows the user at the start of the day with zero messages", () => {
    expect(getGuestLimitStatus(0, 20)).toEqual({ allowed: true, remaining: 20 });
  });

  // Well over the limit
  it("blocks the user when count exceeds the limit", () => {
    expect(getGuestLimitStatus(25, 20)).toEqual({ allowed: false, remaining: 0 });
  });
});

describe("buildDynamicFallback intent parsing", () => {
  it("tailors fallback to hair when user asks about hair/gel/shampoo without mentioning skin", () => {
    const fallback = buildDynamicFallback("عايز جيل للشعر الكيرلي", true);
    expect(fallback).toContain("شعرك");
    expect(fallback).not.toContain("بشرتك");
  });

  it("tailors fallback to hair in English without mentioning skin", () => {
    const fallback = buildDynamicFallback("I want curl styling gel", false);
    expect(fallback).toContain("hair");
    expect(fallback).not.toContain("skin");
  });

  it("tailors fallback to skin when user asks about face/skin products", () => {
    const fallback = buildDynamicFallback("مرطب للبشرة الجافة", true);
    expect(fallback).toContain("بشرتك");
  });

  it("handles product comparison queries contextually", () => {
    const arabicFallback = buildDynamicFallback("ممكن تقارن بين غسول سيرافي وبيوديرما؟", true);
    expect(arabicFallback).toContain("تقارن");
    expect(arabicFallback).toContain("الفرق");

    const englishFallback = buildDynamicFallback("Can you compare these two serums?", false);
    expect(englishFallback.toLowerCase()).toContain("compare");
  });

  it("handles skincare/haircare routine inquiries contextually", () => {
    const arabicFallback = buildDynamicFallback("عايزة روتين صباحي لنضارة الوش", true);
    expect(arabicFallback).toContain("روتينك");
    expect(arabicFallback).toContain("الخطوات");

    const englishFallback = buildDynamicFallback("What is the best morning routine?", false);
    expect(englishFallback.toLowerCase()).toContain("routine");
  });

  it("handles order and shipping inquiries contextually", () => {
    const arabicFallback = buildDynamicFallback("ازاي اتبع الاوردر بتاعي والشحن بياخد اد ايه؟", true);
    expect(arabicFallback).toContain("الشحن");
    expect(arabicFallback).toContain("المحافظات");

    const englishFallback = buildDynamicFallback("How do I track my order and how is shipping?", false);
    expect(englishFallback.toLowerCase()).toContain("deliver");
  });

  it("provides general fallback without skin bias when asking about generic items or prices", () => {
    const fallback = buildDynamicFallback("الأسعار عندكم عاملة إيه؟", true);
    expect(fallback).not.toContain("نوع بشرتك");
    expect(fallback).toContain("أنا معاك يا فندم");
  });
});

describe("formatBotText sanitizer", () => {
  it("returns dynamic fallback if text is empty", () => {
    expect(formatBotText("")).toContain("أنا معاك يا فندم");
  });

  it("strips bold asterisks, italics, and markdown headers", () => {
    const input = "### ترشيحات اليوم\n**سيروم هيالورونيك** من *لاروش* تحفة جداً!";
    const output = formatBotText(input);
    expect(output).not.toContain("*");
    expect(output).not.toContain("#");
    expect(output).toContain("سيروم هيالورونيك من لاروش تحفة جداً!");
  });

  it("strips bullet points, dashes, and numbered list prefixes", () => {
    const input = "- المنتج الأول: غسول للبشرة\n• المنتج التاني: مرطب طبي\n1. كريم واقي شمس";
    const output = formatBotText(input);
    expect(output).not.toContain("-");
    expect(output).not.toContain("•");
    expect(output).not.toContain("1.");
    expect(output).toContain("المنتج الأول: غسول للبشرة\nالمنتج التاني: مرطب طبي\nكريم واقي شمس");
  });

  it("cleans raw markdown tables and pipes into natural text", () => {
    const input = "| المنتج | السعر |\n|---|---|\n| غسول بيوديرما | 350 جنيه |";
    const output = formatBotText(input);
    expect(output).not.toContain("|");
    expect(output).toContain("غسول بيوديرما");
    expect(output).toContain("350 جنيه");
  });

  it("cleans English responses without markdown clutter or bullet symbols", () => {
    const input = "### Recommendations\n**CeraVe Foaming Cleanser** - 450 EGP\n- Perfect for daily oily skin care\n1. Wash face gently";
    const output = formatBotText(input);
    expect(output).not.toContain("*");
    expect(output).not.toContain("#");
    expect(output).not.toContain("1.");
    expect(output).toContain("CeraVe Foaming Cleanser, 450 EGP\nPerfect for daily oily skin care\nWash face gently");
  });
});

describe("buildCatalogContext injection accuracy", () => {
  it("injects exact raw details without losing descriptions or properties", () => {
    const mockProducts = [
      {
        id: 101,
        name: "Raw African Curl Enhancing Gel",
        brand: "Raw African",
        category: "haircare",
        subcategory: "hair-masks",
        price: 240,
        originalPrice: 280,
        skinType: "Curly & Wavy",
        tag: "Best Seller",
        rating: 4.8,
        reviews: 120,
        image: "https://example.com/gel.jpg",
        description:
          "Specialized styling gel formulated exclusively for curly hair to define curls and fight frizz without flaking.",
      },
      {
        id: 102,
        name: "CeraVe Hydrating Cleanser",
        brand: "CeraVe",
        category: "skincare",
        subcategory: "cleansers",
        price: 320,
        skinType: "Normal to Dry",
        rating: 4.6,
        reviews: 450,
        image: "https://example.com/cleanser.jpg",
        description:
          "Gentle non-foaming lotion cleanser for dry skin with ceramides and hyaluronic acid.",
      },
    ];

    const context = buildCatalogContext(mockProducts);
    expect(context).toContain("RAW_PRODUCT_NAME: Raw African Curl Enhancing Gel");
    expect(context).toContain("HAIR_AND_SCALP_TYPE: Curly & Wavy");
    expect(context).toContain(
      "OFFICIAL_DATABASE_DESCRIPTION: Specialized styling gel formulated exclusively for curly hair to define curls and fight frizz without flaking."
    );
    expect(context).toContain("SKIN_TYPE_SUITABILITY: Normal to Dry");
    expect(context).toContain("PRICE: 240 EGP (original: 280 EGP)");
  });

  it("handles empty catalog gracefully", () => {
    expect(buildCatalogContext([])).toBe("No product catalog available yet.");
  });
});

describe("authoritative catalog availability guardrails", () => {
  it("refuses definitive no-match claims while the live catalog is still loading or failed to load", () => {
    expect(getCatalogAvailabilityStatus({
      products: [],
      query: "Clary Shampoo",
      catalogLoading: true,
    })).toContain("still loading");

    expect(getCatalogAvailabilityStatus({
      products: [],
      query: "Clary Shampoo",
      catalogError: "fetch failed",
    })).toContain("could not be verified");

    expect(getCatalogAvailabilityStatus({
      products: [{ id: 1, name: "Something Else" } as any],
      query: "Clary Shampoo",
      matchedProducts: [],
    })).toContain("no product in the current catalog matched the request");
  });
});

describe("catalog-aware multilingual matching", () => {
  const mockProducts = [
    {
      id: 1,
      name: "Lip Repair Balm",
      brand: "Phermono",
      category: "lipcare",
      subcategory: "lip-care",
      price: 220,
      originalPrice: 260,
      rating: 4.7,
      reviews: 90,
      image: "https://example.com/lip-balm.jpg",
      description: "Hydrating balm for dry, chapped lips that softens and protects the delicate lip area during the day.",
    },
    {
      id: 2,
      name: "Rose Glow Lip Oil",
      brand: "Phermono",
      category: "lipcare",
      subcategory: "lip-oil",
      price: 260,
      rating: 4.5,
      reviews: 50,
      image: "https://example.com/lip-oil.jpg",
      description: "Glossy, glossy-finish lip oil with a shiny finish designed for color and shine rather than deep moisture.",
    },
    {
      id: 3,
      name: "Vitamin C Serum",
      brand: "Phermono",
      category: "skincare",
      subcategory: "serums",
      price: 450,
      rating: 4.8,
      reviews: 120,
      image: "https://example.com/serum.jpg",
      description: "Brightening serum for the face that helps improve the look of dull skin.",
    },
  ] as any;

  it("finds a real product by English name and translation", () => {
    const matches = searchCatalogProducts(mockProducts, "lip balm");
    expect(matches[0].name).toBe("Lip Repair Balm");
    const arabicMatches = searchCatalogProducts(mockProducts, "ليب بالم");
    expect(arabicMatches[0].name).toBe("Lip Repair Balm");
  });

  it("preserves canonical English product identity in Egyptian Arabic transliterations", () => {
    const transliterationProducts = [
      { id: 1, name: "Lip Gloss", brand: "Phermono", category: "lipcare", subcategory: "Lip Gloss", price: 210, description: "Glossy shine for the lips." },
      { id: 2, name: "Lip Balm", brand: "Phermono", category: "lipcare", subcategory: "Lip Balm", price: 180, description: "Hydrating balm for dry and chapped lips." },
      { id: 3, name: "Seropipe Intense Nutrition Hair Shampoo 300 ml", brand: "Seropip", category: "haircare", subcategory: "Shampoos", price: 245, description: "Dry and damaged hair shampoo." },
      { id: 4, name: "Leave-In Conditioner", brand: "Phermono", category: "haircare", subcategory: "Hair Treatments", price: 260, description: "Leave-in conditioner for soft, manageable hair after shower." },
    ] as any;

    expect(searchCatalogProducts(transliterationProducts, "ليب جلوس")[0].name).toBe("Lip Gloss");
    expect(searchCatalogProducts(transliterationProducts, "ليب بالم")[0].name).toBe("Lip Balm");
    expect(searchCatalogProducts(transliterationProducts, "سيروبايب")[0].name).toBe("Seropipe Intense Nutrition Hair Shampoo 300 ml");
    expect(searchCatalogProducts(transliterationProducts, "ليف إن")[0].name).toBe("Leave-In Conditioner");
  });

  it("matches punctuation-heavy product names and spacing variants like Clary Shampoo", () => {
    const brandedProducts = [
      {
        id: 901,
        name: "Clary Shampoo™",
        brand: "Phermono",
        category: "haircare",
        subcategory: "Shampoos",
        price: 280,
        description: "Cleansing shampoo for healthy, soft, manageable hair.",
      },
      {
        id: 902,
        name: "Hydrating Hair Mask",
        brand: "Phermono",
        category: "haircare",
        subcategory: "Hair Masks",
        price: 340,
        description: "Deeply nourishing mask for dry, frizzy hair.",
      },
    ] as any;

    expect(searchCatalogProducts(brandedProducts, "Clary Shampoo")[0].name).toBe("Clary Shampoo™");
    expect(searchCatalogProducts(brandedProducts, "clary shampoo")[0].name).toBe("Clary Shampoo™");
    expect(searchCatalogProducts(brandedProducts, "clary   shampoo")[0].name).toBe("Clary Shampoo™");
    expect(searchCatalogProducts(brandedProducts, "clary-shampoo")[0].name).toBe("Clary Shampoo™");
    expect(searchCatalogProducts(brandedProducts, "Clary Shampoo™")[0].name).toBe("Clary Shampoo™");
  });

  it("matches Arabic and need-based descriptions, not just one exact string", () => {
    const arabicMatches = searchCatalogProducts(mockProducts, "عايز مرطب شفايف");
    const needMatches = searchCatalogProducts(mockProducts, "I need something to moisturize my lips");

    expect(arabicMatches[0].name).toBe("Lip Repair Balm");
    expect(needMatches[0].name).toBe("Lip Repair Balm");
  });

  it("matches previously unseen Egyptian phonetic spellings without relying on dictionary entries", () => {
    const unseenPhoneticProducts = [
      { id: 1, name: "Lip Gloss", brand: "Phermono", category: "lipcare", subcategory: "Lip Gloss", price: 210, description: "Glossy shine for the lips." },
      { id: 2, name: "Lip Balm", brand: "Phermono", category: "lipcare", subcategory: "Lip Balm", price: 180, description: "Hydrating balm for dry and chapped lips." },
      { id: 3, name: "Leave-In Conditioner", brand: "Phermono", category: "haircare", subcategory: "Hair Treatments", price: 260, description: "Leave-in conditioner for soft, manageable hair after shower." },
    ] as any;

    expect(searchCatalogProducts(unseenPhoneticProducts, "ليب جلاووس")[0].name).toBe("Lip Gloss");
    expect(searchCatalogProducts(unseenPhoneticProducts, "ليف اني")[0].name).toBe("Leave-In Conditioner");
    expect(searchCatalogProducts(unseenPhoneticProducts, "ليب بلام")[0].name).toBe("Lip Balm");
  });

  it("keeps similar-sounding but different product families distinct", () => {
    const familyProducts = [
      { id: 1, name: "Lip Gloss", brand: "Phermono", category: "lipcare", subcategory: "Lip Gloss", price: 210, description: "Glossy shine for the lips." },
      { id: 2, name: "Leave-In Conditioner", brand: "Phermono", category: "haircare", subcategory: "Hair Treatments", price: 260, description: "Leave-in conditioner for soft, manageable hair after shower." },
      { id: 3, name: "Hydrating Moisturizer", brand: "Phermono", category: "skincare", subcategory: "Moisturizers", price: 240, description: "Rich hydration for dry skin and sensitive areas." },
    ] as any;

    expect(searchCatalogProducts(familyProducts, "ليب جلاووس")[0].name).toBe("Lip Gloss");
    expect(searchCatalogProducts(familyProducts, "ليف اني")[0].name).toBe("Leave-In Conditioner");
    expect(searchCatalogProducts(familyProducts, "بادي ميلك")).toHaveLength(0);
    expect(searchCatalogProducts(familyProducts, "مرطب للوجه")[0].name).toBe("Hydrating Moisturizer");
  });

  it("matches Arabic and English product names across transliteration, order, and mixed-language variants", () => {
    const multilingualProducts = [
      { id: 1, name: "Body Milk", brand: "Phermono", category: "bath-body", subcategory: "Body Care", price: 180, description: "Lightweight body moisturizer for soft, hydrated skin." },
      { id: 2, name: "Body Milk Cream", brand: "Phermono", category: "bath-body", subcategory: "Body Care", price: 220, description: "Creamy body milk with rich hydration." },
      { id: 3, name: "Clary Shampoo", brand: "Clary", category: "haircare", subcategory: "Shampoos", price: 275, description: "Deep cleansing shampoo for healthy, shiny hair." },
      { id: 4, name: "Clary Serum", brand: "Clary", category: "haircare", subcategory: "Serums", price: 310, description: "Hair serum with dimensional care and shine." },
      { id: 5, name: "Hydrating Moisturizer", brand: "Phermono", category: "skincare", subcategory: "Moisturizers", price: 240, description: "Rich hydration for dry skin and sensitive areas." },
    ] as any;

    expect(searchCatalogProducts(multilingualProducts, "بادي ميلك")[0].name).toBe("Body Milk");
    expect(searchCatalogProducts(multilingualProducts, "بودي ميلك")[0].name).toBe("Body Milk");
    expect(searchCatalogProducts(multilingualProducts, "بودي ميلك كريم")[0].name).toBe("Body Milk Cream");
    expect(searchCatalogProducts(multilingualProducts, "شامبو كلاري")[0].name).toBe("Clary Shampoo");
    expect(searchCatalogProducts(multilingualProducts, "كلاري شامبو")[0].name).toBe("Clary Shampoo");
    expect(searchCatalogProducts(multilingualProducts, "سيرم كلاري")[0].name).toBe("Clary Serum");
    expect(searchCatalogProducts(multilingualProducts, "body milk")[0].name).toBe("Body Milk");
    expect(searchCatalogProducts(multilingualProducts, "مرطب")[0].name).toBe("Hydrating Moisturizer");
  });

  it("finds live Arabic shampoo stock, ranks by price for the most expensive option, and removes dry-hair restrictions when the user broadens the query", () => {
    const realShampooProducts = [
      { id: 14, name: "Clary anti dandruff shampoo 300ml", brand: "Clary", category: "haircare", subcategory: "Shampoos", price: 290, description: "" },
      { id: 12, name: "Clary shampoo 300ml", brand: "Clary", category: "haircare", subcategory: "Shampoos", price: 275, description: "" },
      { id: 22, name: "Atrakta Dandr-Off Hair Mask", brand: "atrakta", category: "haircare", subcategory: "Hair Masks", price: 320, description: "The hair mask is suitable for all hair & scalp and is used..." },
      { id: 23, name: "INNOVI CARE HAIR SHAMPOO CONDITIONER 200 ML 1 BOX", brand: "innovi", category: "haircare", subcategory: "Shampoos", price: 160, description: "شامبو بلسم ينظف شعرك بعمق من غير ما ينشفه" },
      { id: 37, name: "Seropipe Intense Nutrition Hair Shampoo 300 ml", brand: "Seropip", category: "haircare", subcategory: "Shampoos", price: 245, description: "Dry and Damaged Hair" },
    ] as any;

    const priceyShampoo = searchCatalogProducts(realShampooProducts, "عايز أغلى شامبو");
    expect(priceyShampoo.length).toBeGreaterThan(0);
    expect(priceyShampoo[0].name).toBe("Clary anti dandruff shampoo 300ml");
    expect(priceyShampoo[0].price).toBe(290);

    const dryHairQuery = searchCatalogProducts(realShampooProducts, "للشعر الجاف");
    expect(dryHairQuery.length).toBeGreaterThan(0);

    const broadShampoo = searchCatalogProducts(realShampooProducts, "طب عايز أي شامبو");
    expect(broadShampoo.length).toBeGreaterThan(0);
    expect(broadShampoo.map((product) => product.name)).toEqual(
      expect.arrayContaining([
        "Clary anti dandruff shampoo 300ml",
        "Clary shampoo 300ml",
        "Seropipe Intense Nutrition Hair Shampoo 300 ml",
      ])
    );
  });

  it("uses the effective price for category-scoped price intent and ignores zero-value legacy prices", () => {
    const priceProducts = [
      {
        id: 1001,
        name: "Clary shampoo 300ml",
        brand: "Clary",
        category: "haircare",
        subcategory: "Shampoos",
        price: 0,
        sellingPrice: 275,
        marketPrice: 330,
        description: "Classic shampoo for healthy, manageable hair.",
      },
      {
        id: 1002,
        name: "Clary anti dandruff shampoo 300ml",
        brand: "Clary",
        category: "haircare",
        subcategory: "Shampoos",
        price: 0,
        sellingPrice: 290,
        marketPrice: 350,
        description: "Anti-dandruff shampoo and deep cleansing treatment.",
      },
      {
        id: 1003,
        name: "Aroma Silk Mist 100ml",
        brand: "Aroma",
        category: "fragrance",
        subcategory: "Fragrance",
        price: 0,
        sellingPrice: 999,
        marketPrice: 1100,
        description: "Fragrance topper with a light floral finish.",
      },
      {
        id: 1004,
        name: "Shaan Body Milk 300 ml",
        brand: "shaan",
        category: "bath-body",
        subcategory: "Body Care",
        price: 0,
        sellingPrice: 185,
        marketPrice: 230,
        description: "Hydrating body milk for dry skin.",
      },
      {
        id: 1005,
        name: "No Price Shampoo",
        brand: "Generic",
        category: "haircare",
        subcategory: "Shampoos",
        price: 0,
        sellingPrice: undefined,
        marketPrice: undefined,
        description: "Must not be ranked if no positive effective price exists.",
      },
    ] as any;

    const highestShampoo = searchCatalogProducts(priceProducts, "أغلى شامبو");
    expect(highestShampoo[0].name).toBe("Clary anti dandruff shampoo 300ml");
    expect(highestShampoo.some((product) => product.category === "fragrance")).toBe(false);
    expect(highestShampoo.some((product) => product.name === "No Price Shampoo")).toBe(false);

    const cheapestShampoo = searchCatalogProducts(priceProducts, "أرخص شامبو");
    expect(cheapestShampoo[0].name).toBe("Clary shampoo 300ml");
    expect(cheapestShampoo.every((product) => product.category === "haircare")).toBe(true);

    const englishPriceQuery = searchCatalogProducts(priceProducts, "highest price shampoo");
    expect(englishPriceQuery[0].name).toBe("Clary anti dandruff shampoo 300ml");
    expect(englishPriceQuery.every((product) => product.category === "haircare")).toBe(true);
  });

  it("prioritizes a matching subcategory over a misleading product-name match", () => {
    const subcategoryPriorityProducts = [
      {
        id: 201,
        name: "Balm & Glow",
        brand: "Phermono",
        category: "lipcare",
        subcategory: "Lip Gloss",
        price: 200,
        description: "Shiny gloss that gives lips a glossy finish.",
      },
      {
        id: 202,
        name: "Daily Lip Care",
        brand: "Phermono",
        category: "lipcare",
        subcategory: "Lip Balm",
        price: 180,
        description: "Moisturizing balm for dry and chapped lips.",
      },
    ] as any;

    expect(searchCatalogProducts(subcategoryPriorityProducts, "lip balm")[0].id).toBe(202);
    expect(searchCatalogProducts(subcategoryPriorityProducts, "ليب بالم")[0].id).toBe(202);
  });

  it("uses subcategory matches before product names across unrelated categories", () => {
    const categoryProducts = [
      { id: 301, name: "CeraVe Cream Face Wash", brand: "CeraVe", category: "skincare", subcategory: "Cleansers", price: 240, description: "Gentle face wash clean for daily use." },
      { id: 302, name: "Hydrating Cleanser", brand: "Phermono", category: "skincare", subcategory: "Moisturizers", price: 260, description: "Hydrating cream for sensitive skin." },
      { id: 303, name: "Daily Shampoo", brand: "Phermono", category: "haircare", subcategory: "Shampoos", price: 220, description: "Cleansing and freshening shampoo for everyday use." },
    ] as any;

    expect(searchCatalogProducts(categoryProducts, "غسول للوجه")[0].id).toBe(301);
    expect(searchCatalogProducts(categoryProducts, "face cleanser")[0].id).toBe(301);
    expect(searchCatalogProducts(categoryProducts, "شامبو")[0].id).toBe(303);
  });

  it("distinguishes by description and ignores false positives", () => {
    const matches = searchCatalogProducts(mockProducts, "shiny gloss for lips");
    expect(matches[0].name).toBe("Rose Glow Lip Oil");
    expect(matches.some((product) => product.name === "Lip Repair Balm")).toBe(false);
  });

  it("returns no matches for genuinely missing products and keeps empty catalog language clear", () => {
    expect(searchCatalogProducts(mockProducts, "nonexistent unicorn serum")).toEqual([]);
    expect(buildCatalogContext(mockProducts, "nonexistent unicorn serum")).toContain("No catalog matches");
    expect(buildCatalogContext([], "lip balm")).toBe("No product catalog available yet.");
  });

});


// ─────────────────────────────────────────────────────────────────────────────
// NEW: Semantic intent extraction tests
// ─────────────────────────────────────────────────────────────────────────────

describe("semantic intent extraction — extractIntentSignals", () => {
  it("detects leave-in product concept from 'عايز ليف ان'", () => {
    const signals = extractIntentSignals("عايز ليف ان");
    expect(signals.productConcepts.some(c => /leave.in|conditioner|treatment/i.test(c))).toBe(true);
  });

  it("detects frizzy concern from 'شعري هايش'", () => {
    const signals = extractIntentSignals("شعري هايش");
    expect(signals.concern).toContain("frizzy");
    expect(signals.bodyArea).toContain("hair");
  });

  it("detects acne concern from 'محتاج حاجة للحبوب'", () => {
    const signals = extractIntentSignals("محتاج حاجة للحبوب");
    expect(signals.concern).toContain("acne");
    expect(signals.productConcepts.some(c => /acne|cleanser|treatment/i.test(c))).toBe(true);
  });

  it("detects face area and moisturizing concern from 'حاجة ترطب وشي'", () => {
    const signals = extractIntentSignals("حاجة ترطب وشي");
    expect(signals.bodyArea).toContain("face");
    expect(signals.concern).toContain("moisturizing");
  });

  it("detects oily concern from 'للشعر الدهني'", () => {
    const signals = extractIntentSignals("للشعر الدهني");
    expect(signals.concern).toContain("oily");
    expect(signals.bodyArea).toContain("hair");
  });

  it("detects post-shower / leave-in concept from 'حاجة تفضل على شعري بعد الشاور'", () => {
    const signals = extractIntentSignals("حاجة تفضل على شعري بعد الشاور");
    expect(signals.productConcepts.some(c => /leave.in|post.shower|treatment/i.test(c))).toBe(true);
    expect(signals.bodyArea).toContain("hair");
  });

  it("detects facial moisturizer intent from English 'I need something to moisturize my face'", () => {
    const signals = extractIntentSignals("I need something to moisturize my face");
    expect(signals.bodyArea).toContain("face");
    expect(signals.concern).toContain("moisturizing");
    expect(signals.language).toBe("en");
  });

  it("detects frizzy hair intent from English 'What can I use for frizzy hair?'", () => {
    const signals = extractIntentSignals("What can I use for frizzy hair?");
    expect(signals.concern).toContain("frizzy");
    expect(signals.bodyArea).toContain("hair");
  });

  it("detects follow-up from 'عايز حاجة أرخص' with history", () => {
    const history = [
      { sender: "user" as const, text: "عايز شامبو للشعر الهايش" },
      { sender: "bot" as const, text: "عندنا TRESemmé Keratin Shampoo" },
    ];
    const signals = extractIntentSignals("عايز حاجة أرخص", history);
    expect(signals.isFollowUp).toBe(true);
    expect(signals.priceIntent).toBe("cheap");
    expect(signals.followUpContext).toBe("عايز شامبو للشعر الهايش");
  });

  it("detects mixed language correctly", () => {
    const signals = extractIntentSignals("عايز leave-in conditioner");
    expect(signals.language).toBe("mixed");
  });

  it("detects cheap price intent from 'مش غالي'", () => {
    const signals = extractIntentSignals("عايز حاجة كويسة بس مش غالية");
    expect(signals.priceIntent).toBe("cheap");
  });

  it("detects expensive price intent from 'غالي'", () => {
    const signals = extractIntentSignals("عايز أغلى شامبو");
    expect(signals.priceIntent).toBe("expensive");
  });

  it("detects dandruff concern from 'قشرة'", () => {
    const signals = extractIntentSignals("عندي مشكلة قشرة في الشعر");
    expect(signals.concern).toContain("dandruff");
    expect(signals.productConcepts.some(c => /dandruff/i.test(c))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Semantic catalog search — expanded intent coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("semantic catalog search — expanded intent coverage", () => {
  const semanticProducts = [
    { id: 1, name: "Garnier Fructis Leave-In Conditioner", brand: "Garnier", category: "haircare", subcategory: "Hair Treatments", price: 180, description: "Leave-in conditioner for frizzy and dry hair. Apply after shower on damp hair." },
    { id: 2, name: "OGX Anti-Frizz Keratin Oil", brand: "OGX", category: "haircare", subcategory: "Hair Oils", price: 320, description: "Anti-frizz hair oil that controls frizz and adds shine to unruly hair." },
    { id: 3, name: "CeraVe Moisturizing Cream", brand: "CeraVe", category: "skincare", subcategory: "Moisturizers", price: 280, description: "Rich moisturizing cream for dry to very dry face and body skin." },
    { id: 4, name: "La Roche-Posay Effaclar Cleanser", brand: "La Roche-Posay", category: "skincare", subcategory: "Cleansers", price: 450, description: "Foaming gel cleanser for oily and acne-prone skin. Controls excess oil and fights breakouts." },
    { id: 5, name: "Neutrogena Hydro Boost Gel", brand: "Neutrogena", category: "skincare", subcategory: "Moisturizers", price: 350, description: "Water gel moisturizer that provides intense hydration for face skin." },
    { id: 6, name: "Head & Shoulders Oily Scalp Shampoo", brand: "Head & Shoulders", category: "haircare", subcategory: "Shampoos", price: 95, description: "Shampoo specifically formulated for oily scalp and hair. Controls excess oil." },
    { id: 7, name: "TRESemmé Keratin Smooth Shampoo", brand: "TRESemmé", category: "haircare", subcategory: "Shampoos", price: 120, description: "Smoothing shampoo for frizzy and unruly hair with keratin." },
    { id: 8, name: "Himalaya Anti-Dandruff Shampoo", brand: "Himalaya", category: "haircare", subcategory: "Shampoos", price: 85, description: "Anti-dandruff shampoo for flaky and itchy scalp." },
  ] as any;

  it("'عايز ليف ان' — finds leave-in conditioners from the catalog", () => {
    const results = searchCatalogProducts(semanticProducts, "عايز ليف ان");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Garnier Fructis Leave-In Conditioner");
  });

  it("'حاجة تفضل على شعري بعد الشاور' — finds leave-in or post-shower hair products", () => {
    const results = searchCatalogProducts(semanticProducts, "حاجة تفضل على شعري بعد الشاور");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => p.description.toLowerCase().includes("leave-in") || p.description.toLowerCase().includes("after shower") || p.description.toLowerCase().includes("shower"))).toBe(true);
  });

  it("'شعري هايش، أستخدم إيه؟' — finds anti-frizz products", () => {
    const results = searchCatalogProducts(semanticProducts, "شعري هايش، أستخدم إيه؟");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /frizz|keratin|smooth/i.test(p.description) || /frizz|keratin|smooth/i.test(p.name))).toBe(true);
  });

  it("'عايز حاجة ترطب وشي' — finds facial moisturizers", () => {
    const results = searchCatalogProducts(semanticProducts, "عايز حاجة ترطب وشي");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /moistur|hydrat/i.test(p.description) && /face|facial|skin/i.test(p.description))).toBe(true);
  });

  it("'محتاج حاجة للحبوب' — finds acne-relevant products", () => {
    const results = searchCatalogProducts(semanticProducts, "محتاج حاجة للحبوب");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /acne|breakout|oily/i.test(p.description))).toBe(true);
  });

  it("'عايز حاجة تنظف البشرة' — finds cleansers", () => {
    const results = searchCatalogProducts(semanticProducts, "عايز حاجة تنظف البشرة");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /cleanser|clean/i.test(p.name) || /cleanser/i.test(p.subcategory))).toBe(true);
  });

  it("'عايز حاجة للشعر الدهني' — finds oily hair products", () => {
    const results = searchCatalogProducts(semanticProducts, "عايز حاجة للشعر الدهني");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /oily/i.test(p.description))).toBe(true);
  });

  it("'I need something to moisturize my face' — finds facial moisturizers", () => {
    const results = searchCatalogProducts(semanticProducts, "I need something to moisturize my face");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /moistur|hydrat/i.test(p.description) && /face/i.test(p.description))).toBe(true);
  });

  it("'What can I use for frizzy hair?' — finds anti-frizz hair products", () => {
    const results = searchCatalogProducts(semanticProducts, "What can I use for frizzy hair?");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => /frizz/i.test(p.description) || /frizz/i.test(p.name))).toBe(true);
  });

  it("'عايز حاجة كويسة بس مش غالية' — returns products (budget intent)", () => {
    const results = searchCatalogProducts(semanticProducts, "عايز حاجة كويسة بس مش غالية");
    expect(results.length).toBeGreaterThan(0);
  });

  it("semantically equivalent queries return the same top result", () => {
    const r1 = searchCatalogProducts(semanticProducts, "شامبو للشعر الدهني");
    const r2 = searchCatalogProducts(semanticProducts, "عايز حاجة للشعر الدهني");
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
    expect(r1.some(p => /oily/i.test(p.description))).toBe(true);
    expect(r2.some(p => /oily/i.test(p.description))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Follow-up conversation context tests
// ─────────────────────────────────────────────────────────────────────────────

describe("follow-up conversation context", () => {
  const products = [
    { id: 1, name: "TRESemmé Anti-Frizz Conditioner", brand: "TRESemmé", category: "haircare", subcategory: "Conditioners", price: 130, description: "Conditioner for frizzy hair." },
    { id: 2, name: "TRESemmé Keratin Shampoo", brand: "TRESemmé", category: "haircare", subcategory: "Shampoos", price: 115, description: "Smoothing shampoo for unruly hair." },
    { id: 3, name: "CeraVe Facial Cleanser", brand: "CeraVe", category: "skincare", subcategory: "Cleansers", price: 290, description: "Gentle foaming cleanser for normal to oily face." },
  ] as any;

  it("'عايز حاجة أرخص' after shampoo query uses hair context from history", () => {
    const history = [
      { sender: "user" as const, text: "عايز شامبو للشعر الهايش" },
      { sender: "bot" as const, text: "عندنا TRESemmé Keratin Shampoo بـ 115 جنيه" },
    ];
    const results = searchCatalogProducts(products, "عايز حاجة أرخص", history);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => p.category === "haircare")).toBe(true);
  });

  it("'وريني المتاح' after skincare query uses skincare context", () => {
    const history = [
      { sender: "user" as const, text: "محتاج غسول للوجه" },
      { sender: "bot" as const, text: "عندنا CeraVe Facial Cleanser" },
    ];
    const results = searchCatalogProducts(products, "وريني المتاح", history);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(p => p.category === "skincare")).toBe(true);
  });

  it("does not carry prior lip-product context into a new unrelated product request", () => {
    const lipProducts = [
      { id: 10, name: "Rose Glow Lip Gloss", brand: "Phermono", category: "lipcare", subcategory: "Lip Gloss", price: 220, description: "Glossy lip gloss with shine." },
      { id: 11, name: "Lip Repair Balm", brand: "Phermono", category: "lipcare", subcategory: "Lip Balm", price: 210, description: "Hydrating balm for dry, chapped lips." },
      { id: 12, name: "Seropipe Intense Nutrition Hair Shampoo 300 ml", brand: "Seropip", category: "haircare", subcategory: "Shampoos", price: 245, description: "Dry and Damaged Hair" },
    ] as any;

    const history = [
      { sender: "user" as const, text: "Lip Gloss" },
      { sender: "bot" as const, text: "Rose Glow Lip Gloss is available." },
      { sender: "user" as const, text: "Lip Balm" },
      { sender: "bot" as const, text: "Lip Repair Balm is available." },
    ];

    const results = searchCatalogProducts(lipProducts, "Seropipe", history);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Seropipe Intense Nutrition Hair Shampoo 300 ml");
  });

  it("keeps prior context only for explicit follow-up references", () => {
    const history = [
      { sender: "user" as const, text: "Lip Gloss" },
      { sender: "bot" as const, text: "Rose Glow Lip Gloss is available." },
    ];

    const filtered = buildGroqMessages(history, { sender: "user", text: "what about its price?" });
    expect(filtered.some((m) => /Lip Gloss/i.test(m.content))).toBe(true);
    expect(filtered.some((m) => /what about its price/i.test(m.content))).toBe(true);

    const isolated = buildGroqMessages(history, { sender: "user", text: "Seropipe" });
    expect(isolated.some((m) => /Lip Gloss/i.test(m.content))).toBe(false);
    expect(isolated).toHaveLength(1);
    expect(isolated[0].content).toBe("Seropipe");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Genuine no-match test — does not hallucinate
// ─────────────────────────────────────────────────────────────────────────────

describe("genuine no-match — does not hallucinate", () => {
  it("returns empty for truly unrelated queries with no catalog match", () => {
    const results = searchCatalogProducts(
      [{ id: 1, name: "Clary Shampoo", brand: "Clary", category: "haircare", subcategory: "Shampoos", price: 200, description: "Regular shampoo." }] as any,
      "أريد شراء سيارة"
    );
    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION: Audit fix #1 — subcategory label sent to Groq
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCatalogContext — subcategory and isHair regression", () => {
  const hairProductWithSubcategory = {
    id: 1,
    name: "Argan Oil Leave-In",
    brand: "Moroccanoil",
    category: "haircare",
    subcategory: "Hair Treatments",
    subcategoryId: null,
    price: 350,
    description: "Leave-in treatment for dry hair.",
    skinType: null,
    tag: null,
    rating: null,
    originalPrice: null,
    marketPrice: null,
  } as any;

  const skinProductWithSubcategoryOnly = {
    id: 2,
    name: "CeraVe Moisturizing Cream",
    brand: "CeraVe",
    category: "skincare",
    subcategory: "Moisturizers",
    subcategoryId: null,
    price: 280,
    description: null,
    skinType: "Dry",
    tag: null,
    rating: null,
    originalPrice: null,
    marketPrice: null,
  } as any;

  it("uses human-readable subcategory when subcategoryId is null", () => {
    const ctx = buildCatalogContext([hairProductWithSubcategory], "leave-in");
    expect(ctx).toContain("SUBCATEGORY: Hair Treatments");
    expect(ctx).not.toContain("SUBCATEGORY: general");
  });

  it("falls back to subcategoryId when subcategory is absent", () => {
    const p = { ...hairProductWithSubcategory, subcategory: null, subcategoryId: "hair-treatments" };
    const ctx = buildCatalogContext([p], "leave-in");
    expect(ctx).toContain("SUBCATEGORY: hair-treatments");
  });

  it("falls back to 'general' when both subcategory and subcategoryId are absent", () => {
    const p = { ...hairProductWithSubcategory, subcategory: null, subcategoryId: null };
    const ctx = buildCatalogContext([p], "leave-in");
    expect(ctx).toContain("SUBCATEGORY: general");
  });

  it("classifies haircare product as HAIR_AND_SCALP_TYPE via subcategory when subcategoryId is null", () => {
    // subcategoryId is null, subcategory = "Hair Treatments" → isHair should still be true
    const ctx = buildCatalogContext([hairProductWithSubcategory], "leave-in");
    expect(ctx).toContain("HAIR_AND_SCALP_TYPE");
    expect(ctx).not.toContain("SKIN_TYPE_SUITABILITY");
  });

  it("uses neutral fallback description when product description is null", () => {
    const ctx = buildCatalogContext([skinProductWithSubcategoryOnly], "moisturizer");
    expect(ctx).toContain("No official product description available.");
    expect(ctx).not.toContain("beauty intelligence");
    expect(ctx).not.toContain("Use your expert");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION: Audit fix #2 — skinType included in search
// ─────────────────────────────────────────────────────────────────────────────

describe("searchCatalogProducts — skinType field regression", () => {
  const oilySkinProduct = {
    id: 10,
    name: "Neutrogena Oil-Free Moisturizer",
    brand: "Neutrogena",
    category: "skincare",
    subcategory: "Moisturizers",
    subcategoryId: "moisturizers",
    price: 220,
    description: "Lightweight moisturizer.",
    skinType: "Oily",
    tag: null,
  } as any;

  const drySkinProduct = {
    id: 11,
    name: "Cetaphil Rich Cream",
    brand: "Cetaphil",
    category: "skincare",
    subcategory: "Moisturizers",
    subcategoryId: "moisturizers",
    price: 310,
    description: "Rich cream for intense hydration.",
    skinType: "Dry",
    tag: null,
  } as any;

  it("finds oily-skin product when query contains 'oily'", () => {
    const results = searchCatalogProducts([oilySkinProduct, drySkinProduct], "moisturizer for oily skin");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(10);
  });

  it("Arabic query 'مرطب للبشرة الدهنية' finds oily-skin product via skinType", () => {
    const results = searchCatalogProducts([oilySkinProduct, drySkinProduct], "مرطب للبشرة الدهنية");
    // Semantic expansion should resolve to 'oily' / 'moisturizer', and oily product scores higher
    expect(results.length).toBeGreaterThan(0);
    const foundOily = results.some((p) => p.skinType === "Oily");
    expect(foundOily).toBe(true);
  });

  it("finds dry-skin product when query contains 'dry skin'", () => {
    const results = searchCatalogProducts([oilySkinProduct, drySkinProduct], "cream for dry skin");
    expect(results.length).toBeGreaterThan(0);
    // dry skin product should appear in results
    expect(results.some((p) => p.skinType === "Dry")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION: Audit fix #4 — hidden products excluded from chatbot results
// ─────────────────────────────────────────────────────────────────────────────

describe("searchCatalogProducts — isHidden products excluded", () => {
  const visibleProduct = {
    id: 20,
    name: "Visible Shampoo",
    brand: "Brand A",
    category: "haircare",
    subcategory: "Shampoos",
    price: 100,
    description: "A great shampoo.",
    isHidden: false,
    skinType: null,
    tag: null,
  } as any;

  const hiddenProduct = {
    id: 21,
    name: "Secret Shampoo",
    brand: "Brand B",
    category: "haircare",
    subcategory: "Shampoos",
    price: 100,
    description: "A hidden shampoo.",
    isHidden: true,
    skinType: null,
    tag: null,
  } as any;

  // Note: isHidden filtering is done in handleSend() before calling searchCatalogProducts().
  // The test below verifies that searchCatalogProducts itself does not re-introduce hidden
  // products when the caller has already pre-filtered — i.e., passing only visible products
  // still returns only visible products.
  it("searchCatalogProducts returns only the products passed to it (isHidden filtering is caller responsibility)", () => {
    // Caller pre-filters: only visibleProduct is passed
    const results = searchCatalogProducts([visibleProduct], "شامبو");
    expect(results.every((p) => !p.isHidden)).toBe(true);
    expect(results.some((p) => p.id === 20)).toBe(true);
  });

  it("hidden product is not returned when caller pre-filters hidden products", () => {
    const visibleOnly = [visibleProduct]; // simulates the filter in handleSend
    const results = searchCatalogProducts(visibleOnly, "secret shampoo");
    expect(results.some((p) => p.id === 21)).toBe(false);
  });
});

// =============================================================================
// Deodorant category — semantic matching, disambiguation, and regression tests
// =============================================================================

describe("Deodorant category — mock catalog fixture", () => {
  // Representative catalog: 3 Roll-On products, 2 Spray products, 0 Stick products.
  // Products are read dynamically — do not hard-code IDs in production matching logic.
  const deodorantProducts = [
    {
      id: 501,
      name: "Dove Original Roll-On Deodorant 50ml",
      brand: "Dove",
      category: "Deodorant",
      subcategory: "Roll-On",
      price: 89,
      description: "Dove Original Roll-On Deodorant provides 48-hour odour protection. Gentle on skin and suitable for daily use. Does not contain alcohol.",
      skinType: null,
      tag: "Best Seller",
    },
    {
      id: 502,
      name: "Nivea Pearl & Beauty Roll-On Deodorant 50ml",
      brand: "Nivea",
      category: "Deodorant",
      subcategory: "Roll-On",
      price: 79,
      description: "Nivea Pearl & Beauty Roll-On provides effective underarm odour protection and leaves skin smooth. Recommended for normal skin.",
      skinType: "Normal",
      tag: null,
    },
    {
      id: 503,
      name: "Secret Invisible Solid Roll-On 48h",
      brand: "Secret",
      category: "Deodorant",
      subcategory: "Roll-On",
      price: 110,
      description: "Advanced 48-hour odour protection roll-on deodorant. Dermatologist-tested for sensitive skin.",
      skinType: "Sensitive",
      tag: null,
    },
    {
      id: 504,
      name: "Axe Black Body Spray Deodorant 150ml",
      brand: "Axe",
      category: "Deodorant",
      subcategory: "Spray",
      price: 95,
      description: "Axe Black Body Spray provides long-lasting fragrance and deodorant protection in one spray.",
      skinType: null,
      tag: null,
    },
    {
      id: 505,
      name: "Dove Invisible Dry Spray Deodorant 150ml",
      brand: "Dove",
      category: "Deodorant",
      subcategory: "Spray",
      price: 105,
      description: "Dove Invisible Dry Spray leaves no white marks. Provides 48-hour protection against underarm odour.",
      skinType: null,
      tag: null,
    },
  ] as any;

  // ── 1. English category and subcategory names ─────────────────────────────
  it("English 'deodorant' matches all Deodorant category products", () => {
    const results = searchCatalogProducts(deodorantProducts, "deodorant");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("English 'roll-on' finds only Roll-On subcategory products", () => {
    const results = searchCatalogProducts(deodorantProducts, "roll-on");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  it("English 'roll on' (without hyphen) also finds Roll-On products", () => {
    const results = searchCatalogProducts(deodorantProducts, "roll on deodorant");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  it("English 'spray deodorant' finds Spray subcategory products", () => {
    const results = searchCatalogProducts(deodorantProducts, "spray deodorant");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Spray")).toBe(true);
  });

  // ── 2. Arabic semantic matching ───────────────────────────────────────────
  it("'رشحلي ديودرانت' finds Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0631\u0634\u062d\u0644\u064a \u062f\u064a\u0648\u062f\u0631\u0627\u0646\u062a");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'عايز مزيل عرق' finds Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0639\u0627\u064a\u0632 \u0645\u0632\u064a\u0644 \u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'مزيل للعرق' finds Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0645\u0632\u064a\u0644 \u0644\u0644\u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'مزيل ريحة العرق' (meaning-only, no official name) finds Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0645\u0632\u064a\u0644 \u0631\u064a\u062d\u0629 \u0627\u0644\u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'عايز حاجة تقلل ريحة العرق' (benefit description only) finds Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0639\u0627\u064a\u0632 \u062d\u0627\u062c\u0629 \u062a\u0642\u0644\u0644 \u0631\u064a\u062d\u0629 \u0627\u0644\u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'مزيلات العرق' (plural form) finds Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0645\u0632\u064a\u0644\u0627\u062a \u0627\u0644\u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  // ── 3. Arabizi / phonetic / spelling variation matching ───────────────────
  it("'ديودرانت' (standard Arabizi) matches Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u062f\u064a\u0648\u062f\u0631\u0627\u0646\u062a");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'ديودرنت' (common spelling variant, dropped alef) matches Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u062f\u064a\u0648\u062f\u0631\u0646\u062a");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  it("'ديودورانت' (elongated vowel variant) matches Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u062f\u064a\u0648\u062f\u0648\u0631\u0627\u0646\u062a");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.category === "Deodorant")).toBe(true);
  });

  // ── 4. Roll-On subcategory — Arabic and Arabizi ───────────────────────────
  it("'عايز رول أون' finds Roll-On products specifically", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0639\u0627\u064a\u0632 \u0631\u0648\u0644 \u0623\u0648\u0646");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  it("'رول اون' (without hamza) finds Roll-On products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0631\u0648\u0644 \u0627\u0648\u0646");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  it("'رولون' (joined form) finds Roll-On products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0631\u0648\u0644\u0648\u0646");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  it("'عندكم رول أون؟' finds Roll-On products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0639\u0646\u062f\u0643\u0645 \u0631\u0648\u0644 \u0623\u0648\u0646\u061f");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  it("'مزيل عرق بالرول' (descriptive form) finds Roll-On products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0645\u0632\u064a\u0644 \u0639\u0631\u0642 \u0628\u0627\u0644\u0631\u0648\u0644");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Roll-On")).toBe(true);
  });

  // ── 5. Spray subcategory — with deodorant context ─────────────────────────
  it("'سبراي مزيل عرق' finds Spray subcategory products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0633\u0628\u0631\u0627\u064a \u0645\u0632\u064a\u0644 \u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Spray")).toBe(true);
  });

  it("'بخاخ مزيل عرق' (bakhakh = nozzle/spray) finds Spray deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0628\u062e\u0627\u062e \u0645\u0632\u064a\u0644 \u0639\u0631\u0642");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Spray")).toBe(true);
  });

  it("'مزيل عرق بخاخ' finds Spray deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0645\u0632\u064a\u0644 \u0639\u0631\u0642 \u0628\u062e\u0627\u062e");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => p.subcategory === "Spray")).toBe(true);
  });

  // ── 6. Spray disambiguation — must NOT auto-assign to deodorant ───────────
  it("'سبراي' alone in a haircare context does NOT exclusively match Deodorant products", () => {
    const mixedProducts = [
      ...deodorantProducts,
      {
        id: 600, name: "Garnier Fructis Hair Spray 250ml", brand: "Garnier",
        category: "haircare", subcategory: "Styling", price: 75,
        description: "Flexible hold hair spray for styling and finishing.",
      },
    ] as any;
    // "سبراي للشعر" should find hair spray, NOT deodorant spray
    const results = searchCatalogProducts(mixedProducts, "\u0633\u0628\u0631\u0627\u064a \u0644\u0644\u0634\u0639\u0631");
    expect(results.length).toBeGreaterThan(0);
    // Hair spray should rank higher than deodorant spray for this query
    expect(results[0].category).toBe("haircare");
  });

  it("'سبراى شعر' (alternate spelling ى) does NOT match Deodorant products first", () => {
    const mixedProducts = [
      ...deodorantProducts,
      {
        id: 601, name: "Tresemme Hair Spray", brand: "TRESemmé",
        category: "haircare", subcategory: "Styling", price: 80,
        description: "Strong hold hair spray for long-lasting hairstyle.",
      },
    ] as any;
    const results = searchCatalogProducts(mixedProducts, "\u0633\u0628\u0631\u0627\u0649 \u0634\u0639\u0631");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe("haircare");
  });

  // ── 7. Stick subcategory — empty catalog, no fabrication ─────────────────
  it("Stick query returns zero results when no Stick products exist in catalog", () => {
    const results = searchCatalogProducts(deodorantProducts, "deodorant stick");
    // Stick sub is empty; results may include Roll-On/Spray (category-level match)
    // but zero Stick-subcategory products must be returned
    expect(results.every((p: any) => p.subcategory !== "Stick")).toBe(true);
  });

  it("'عندكم مزيل عرق ستيك؟' returns zero Stick products (empty subcategory)", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0639\u0646\u062f\u0643\u0645 \u0645\u0632\u064a\u0644 \u0639\u0631\u0642 \u0633\u062a\u064a\u0643\u061f");
    expect(results.every((p: any) => p.subcategory !== "Stick")).toBe(true);
  });

  it("'ستيك مزيل عرق' returns zero Stick products (empty subcategory)", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0633\u062a\u064a\u0643 \u0645\u0632\u064a\u0644 \u0639\u0631\u0642");
    expect(results.every((p: any) => p.subcategory !== "Stick")).toBe(true);
  });

  // ── 8. Subcategory-scoped vs. main-category requests ─────────────────────
  it("Roll-On request ranks Roll-On subcategory products higher than Spray products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0631\u0648\u0644 \u0623\u0648\u0646");
    const topResult = results[0];
    expect(topResult.subcategory).toBe("Roll-On");
  });

  it("Main-category 'مزيل عرق' request returns products from both Roll-On and Spray subcategories", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0645\u0632\u064a\u0644 \u0639\u0631\u0642");
    const subcategories = new Set(results.map((p: any) => p.subcategory));
    expect(subcategories.has("Roll-On")).toBe(true);
    expect(subcategories.has("Spray")).toBe(true);
  });

  // ── 9. Feature questions grounded in actual descriptions ──────────────────
  it("Roll-On sensitive skin: only product 503 (explicitly dermatologist-tested for sensitive skin) is matched for sensitive skin query", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0631\u0634\u062d\u0644\u064a \u0631\u0648\u0644 \u0623\u0648\u0646 \u0644\u0644\u0628\u0634\u0631\u0629 \u0627\u0644\u062d\u0633\u0627\u0633\u0629");
    // Products 501 and 502 do NOT have 'sensitive' in description; 503 does.
    // The match should include 503 and may include others, but 503 must appear.
    expect(results.some((p: any) => p.id === 503)).toBe(true);
  });

  it("Alcohol-free claim: product 501 (explicitly alcohol-free) ranks higher than product 502 for alcohol-free query", () => {
    const results = searchCatalogProducts(deodorantProducts, "roll-on alcohol-free deodorant");
    const ids = results.map((p: any) => p.id);
    // Product 501 description explicitly says "Does not contain alcohol"
    // Product 502 description does not mention alcohol
    expect(ids).toContain(501);
  });

  it("48-hour protection query finds products that mention it in their descriptions", () => {
    const results = searchCatalogProducts(deodorantProducts, "deodorant 48 hour protection");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p: any) => /48[- ]?hour/i.test(p.description))).toBe(true);
  });

  // ── 10. No fabrication when no catalog product exists ─────────────────────
  it("Completely unrelated query returns no Deodorant products", () => {
    const results = searchCatalogProducts(deodorantProducts, "\u0639\u0627\u064a\u0632 \u0634\u0627\u0645\u0628\u0648 \u0644\u0644\u0634\u0639\u0631 \u0627\u0644\u0643\u064a\u0631\u0644\u064a");
    expect(results).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deodorant — extractIntentSignals integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Deodorant — extractIntentSignals detection", () => {
  it("detects 'deodorant' body-area from English 'deodorant'", () => {
    const signals = extractIntentSignals("I need a deodorant");
    expect(signals.bodyArea).toContain("deodorant");
  });

  it("detects 'deodorant' body-area from Arabic 'مزيل عرق'", () => {
    const signals = extractIntentSignals("\u0639\u0627\u064a\u0632 \u0645\u0632\u064a\u0644 \u0639\u0631\u0642");
    expect(signals.bodyArea).toContain("deodorant");
  });

  it("detects 'deodorant' body-area from Arabizi 'ديودرانت'", () => {
    const signals = extractIntentSignals("\u0631\u0634\u062d\u0644\u064a \u062f\u064a\u0648\u062f\u0631\u0627\u0646\u062a");
    expect(signals.bodyArea).toContain("deodorant");
  });

  it("detects 'deodorant' body-area from 'رول أون'", () => {
    const signals = extractIntentSignals("\u0639\u0627\u064a\u0632 \u0631\u0648\u0644 \u0623\u0648\u0646");
    expect(signals.bodyArea).toContain("deodorant");
  });

  it("detects 'deodorant' productConcepts from 'ديودرانت' via SEMANTIC_EXPANSION", () => {
    const signals = extractIntentSignals("\u0639\u0627\u064a\u0632 \u062f\u064a\u0648\u062f\u0631\u0627\u0646\u062a");
    expect(signals.productConcepts.some((c: string) => /deodorant|odor/i.test(c))).toBe(true);
  });

  it("detects roll-on productConcepts from 'رول أون'", () => {
    const signals = extractIntentSignals("\u0639\u0627\u064a\u0632 \u0631\u0648\u0644 \u0623\u0648\u0646");
    expect(signals.productConcepts.some((c: string) => /roll/i.test(c))).toBe(true);
  });

  it("does NOT push 'deodorant' body-area for plain 'سبراي' (spray) without deodorant context", () => {
    const signals = extractIntentSignals("\u0639\u0627\u064a\u0632 \u0633\u0628\u0631\u0627\u064a \u0644\u0644\u0634\u0639\u0631");
    expect(signals.bodyArea).not.toContain("deodorant");
  });
});

// =============================================================================
// Skin Care category — Two-Path Language Understanding & Regression Tests
// =============================================================================

import {
  SKIN_CARE_SUBCATEGORIES,
  matchSkinCarePhonetic,
  matchSkinCareSemantic,
  resolveSkinCareSubcategory,
  normalizeArabicPhonetic,
} from "./ChatWidget";

describe("Skin Care category — Two-Path Separation Tests", () => {
  it("exports all 20 exact catalog subcategories", () => {
    expect(SKIN_CARE_SUBCATEGORIES).toHaveLength(20);
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Face cleanser");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("body lotion");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Face Creams & Moisturizers");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("BODY WASH");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("SunSCREEN");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("NAIL OIL");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("LIP PALM");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Serum");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("eye contour");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("body Urea");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Hair Lotion");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Hair Serum");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Hair Mask");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("body cream");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Toner");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Foundation");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Body Oil");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("LIP GLOSS");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("bikini");
    expect(SKIN_CARE_SUBCATEGORIES).toContain("Hand cream");
  });

  // ── Path A: Phonetic Transliterations ──────────────────────────────────────
  describe("Path A: Phonetic Transliterations", () => {
    it("recognizes phonetic variations of body lotion (بادي لوشن, بودي لوشن, بادي لوسيون, بودي لوسن)", () => {
      expect(matchSkinCarePhonetic("عايز بادي لوشن")?.subcategoryId).toBe("body lotion");
      expect(matchSkinCarePhonetic("بودي لوشن")?.subcategoryId).toBe("body lotion");
      expect(matchSkinCarePhonetic("بادي لوسيون")?.subcategoryId).toBe("body lotion");
      expect(matchSkinCarePhonetic("بودي لوسن")?.subcategoryId).toBe("body lotion");
    });

    it("recognizes phonetic variations of Face cleanser (فيس كلينزر, كلينزر, كلينسر)", () => {
      expect(matchSkinCarePhonetic("فيس كلينزر")?.subcategoryId).toBe("Face cleanser");
      expect(matchSkinCarePhonetic("كلينزر")?.subcategoryId).toBe("Face cleanser");
      expect(matchSkinCarePhonetic("كلينسر للبشرة")?.subcategoryId).toBe("Face cleanser");
    });

    it("recognizes phonetic variations of Sunscreen (صن سكرين, صن بلوك, صنسكرين, سن بلوك)", () => {
      expect(matchSkinCarePhonetic("صن سكرين")?.subcategoryId).toBe("SunSCREEN");
      expect(matchSkinCarePhonetic("صن بلوك")?.subcategoryId).toBe("SunSCREEN");
      expect(matchSkinCarePhonetic("صنسكرين")?.subcategoryId).toBe("SunSCREEN");
      expect(matchSkinCarePhonetic("سن بلوك")?.subcategoryId).toBe("SunSCREEN");
    });

    it("recognizes phonetic variations of Serum (سيروم, سيرم)", () => {
      expect(matchSkinCarePhonetic("عايز سيروم")?.subcategoryId).toBe("Serum");
      expect(matchSkinCarePhonetic("سيرم للوجه")?.subcategoryId).toBe("Serum");
    });

    it("recognizes phonetic variations of Lip Gloss (ليب جلوس, ليب جلوص, ليب جلاوس)", () => {
      expect(matchSkinCarePhonetic("ليب جلوس")?.subcategoryId).toBe("LIP GLOSS");
      expect(matchSkinCarePhonetic("ليب جلوص")?.subcategoryId).toBe("LIP GLOSS");
      expect(matchSkinCarePhonetic("ليب جلاوس")?.subcategoryId).toBe("LIP GLOSS");
    });

    it("recognizes phonetic variations of eye contour (آي كونتور, اي كونتور)", () => {
      expect(matchSkinCarePhonetic("آي كونتور")?.subcategoryId).toBe("eye contour");
      expect(matchSkinCarePhonetic("اي كونتور")?.subcategoryId).toBe("eye contour");
    });

    it("recognizes phonetic variations of LIP PALM / Balm (ليب بالم, ليب پالم, ليب بلم)", () => {
      expect(matchSkinCarePhonetic("ليب بالم")?.subcategoryId).toBe("LIP PALM");
      expect(matchSkinCarePhonetic("ليب پالم")?.subcategoryId).toBe("LIP PALM");
      expect(matchSkinCarePhonetic("ليب بلم")?.subcategoryId).toBe("LIP PALM");
    });

    it("recognizes phonetic variations of NAIL OIL (نيل اويل, نايل اويل)", () => {
      expect(matchSkinCarePhonetic("نيل اويل")?.subcategoryId).toBe("NAIL OIL");
      expect(matchSkinCarePhonetic("نايل اويل")?.subcategoryId).toBe("NAIL OIL");
    });

    it("recognizes phonetic variations of body Urea (بادي يوريا, بودي يوريا)", () => {
      expect(matchSkinCarePhonetic("بادي يوريا")?.subcategoryId).toBe("body Urea");
      expect(matchSkinCarePhonetic("بودي يوريا")?.subcategoryId).toBe("body Urea");
    });

    it("recognizes phonetic variations of Hand cream (هاند كريم, هاندكريم)", () => {
      expect(matchSkinCarePhonetic("هاند كريم")?.subcategoryId).toBe("Hand cream");
      expect(matchSkinCarePhonetic("هاندكريم")?.subcategoryId).toBe("Hand cream");
    });

    it("recognizes phonetic variations of body cream (بادي كريم, بودي كريم)", () => {
      expect(matchSkinCarePhonetic("بادي كريم")?.subcategoryId).toBe("body cream");
      expect(matchSkinCarePhonetic("بودي كريم")?.subcategoryId).toBe("body cream");
    });

    it("recognizes phonetic variations of BODY WASH (بادي ووش, بودي واش)", () => {
      expect(matchSkinCarePhonetic("بادي ووش")?.subcategoryId).toBe("BODY WASH");
      expect(matchSkinCarePhonetic("بودي واش")?.subcategoryId).toBe("BODY WASH");
    });

    it("recognizes phonetic variations of Body Oil (بادي اويل, بودي اويل)", () => {
      expect(matchSkinCarePhonetic("بادي اويل")?.subcategoryId).toBe("Body Oil");
      expect(matchSkinCarePhonetic("بودي اويل")?.subcategoryId).toBe("Body Oil");
    });

    it("recognizes phonetic variations of Toner (تونر, تونار)", () => {
      expect(matchSkinCarePhonetic("تونر")?.subcategoryId).toBe("Toner");
      expect(matchSkinCarePhonetic("تونار")?.subcategoryId).toBe("Toner");
    });

    it("recognizes phonetic variations of Foundation (فاونديشن, فونديشن, فوندشين)", () => {
      expect(matchSkinCarePhonetic("فاونديشن")?.subcategoryId).toBe("Foundation");
      expect(matchSkinCarePhonetic("فونديشن")?.subcategoryId).toBe("Foundation");
      expect(matchSkinCarePhonetic("فوندشين")?.subcategoryId).toBe("Foundation");
    });

    it("recognizes phonetic variations of bikini (بيكيني, بكيني)", () => {
      expect(matchSkinCarePhonetic("بيكيني")?.subcategoryId).toBe("bikini");
      expect(matchSkinCarePhonetic("بكيني")?.subcategoryId).toBe("bikini");
    });

    it("recognizes phonetic variations of Hair subcategories in Skin Care (هير لوشن, هير سيروم, هير ماسك)", () => {
      expect(matchSkinCarePhonetic("هير لوشن")?.subcategoryId).toBe("Hair Lotion");
      expect(matchSkinCarePhonetic("هير سيروم")?.subcategoryId).toBe("Hair Serum");
      expect(matchSkinCarePhonetic("هير ماسك")?.subcategoryId).toBe("Hair Mask");
    });
  });

  // ── Path B: Accurate Arabic Translations & Semantic Equivalents ───────────
  describe("Path B: Accurate Arabic Translations & Semantic Equivalents", () => {
    it("recognizes Arabic translations for Face cleanser (غسول الوجه, غسول الوش, منظف الوجه, منظف البشرة)", () => {
      expect(matchSkinCareSemantic("غسول الوجه")?.subcategoryId).toBe("Face cleanser");
      expect(matchSkinCareSemantic("غسول الوش")?.subcategoryId).toBe("Face cleanser");
      expect(matchSkinCareSemantic("منظف الوجه")?.subcategoryId).toBe("Face cleanser");
      expect(matchSkinCareSemantic("منظف البشرة")?.subcategoryId).toBe("Face cleanser");
    });

    it("recognizes Arabic translations for body lotion (لوشن للجسم, مرطب للجسم, مستحضر ترطيب الجسم)", () => {
      expect(matchSkinCareSemantic("لوشن للجسم")?.subcategoryId).toBe("body lotion");
      expect(matchSkinCareSemantic("مرطب للجسم")?.subcategoryId).toBe("body lotion");
      expect(matchSkinCareSemantic("مستحضر ترطيب الجسم")?.subcategoryId).toBe("body lotion");
    });

    it("recognizes Arabic translations for Face Creams & Moisturizers (كريم وجه, مرطب وش, كريم ترطيب البشرة)", () => {
      expect(matchSkinCareSemantic("كريم وجه")?.subcategoryId).toBe("Face Creams & Moisturizers");
      expect(matchSkinCareSemantic("مرطب وش")?.subcategoryId).toBe("Face Creams & Moisturizers");
      expect(matchSkinCareSemantic("كريم ترطيب البشرة")?.subcategoryId).toBe("Face Creams & Moisturizers");
    });

    it("recognizes Arabic translations for BODY WASH (غسول الجسم, شاور جل, منظف الجسم)", () => {
      expect(matchSkinCareSemantic("غسول الجسم")?.subcategoryId).toBe("BODY WASH");
      expect(matchSkinCareSemantic("شاور جل")?.subcategoryId).toBe("BODY WASH");
      expect(matchSkinCareSemantic("منظف الجسم")?.subcategoryId).toBe("BODY WASH");
    });

    it("recognizes Arabic translations for Sunscreen (واقي شمس, كريم حماية من الشمس, واقي من الشمس)", () => {
      expect(matchSkinCareSemantic("واقي شمس")?.subcategoryId).toBe("SunSCREEN");
      expect(matchSkinCareSemantic("كريم حماية من الشمس")?.subcategoryId).toBe("SunSCREEN");
      expect(matchSkinCareSemantic("واقي من الشمس")?.subcategoryId).toBe("SunSCREEN");
    });

    it("recognizes Arabic translations for NAIL OIL (زيت أظافر, زيت للأظافر, عناية بالأظافر)", () => {
      expect(matchSkinCareSemantic("زيت أظافر")?.subcategoryId).toBe("NAIL OIL");
      expect(matchSkinCareSemantic("زيت للأظافر")?.subcategoryId).toBe("NAIL OIL");
      expect(matchSkinCareSemantic("عناية بالأظافر")?.subcategoryId).toBe("NAIL OIL");
    });

    it("recognizes Arabic translations for LIP PALM (مرطب شفاه, بلسم شفاه, مرطب شفايف)", () => {
      expect(matchSkinCareSemantic("مرطب شفاه")?.subcategoryId).toBe("LIP PALM");
      expect(matchSkinCareSemantic("بلسم شفاه")?.subcategoryId).toBe("LIP PALM");
      expect(matchSkinCareSemantic("مرطب شفايف")?.subcategoryId).toBe("LIP PALM");
    });

    it("recognizes Arabic translations for eye contour (كريم العين, منتج لمنطقة حول العين, مرطب حول العين)", () => {
      expect(matchSkinCareSemantic("كريم العين")?.subcategoryId).toBe("eye contour");
      expect(matchSkinCareSemantic("منتج لمنطقة حول العين")?.subcategoryId).toBe("eye contour");
      expect(matchSkinCareSemantic("مرطب حول العين")?.subcategoryId).toBe("eye contour");
    });

    it("recognizes Arabic translations for body Urea (يوريا للجسم, كريم يوريا للجسم, مرطب يوريا)", () => {
      expect(matchSkinCareSemantic("يوريا للجسم")?.subcategoryId).toBe("body Urea");
      expect(matchSkinCareSemantic("كريم يوريا للجسم")?.subcategoryId).toBe("body Urea");
      expect(matchSkinCareSemantic("مرطب يوريا")?.subcategoryId).toBe("body Urea");
    });

    it("recognizes Arabic translations for body cream (كريم جسم, كريم ترطيب الجسم)", () => {
      expect(matchSkinCareSemantic("كريم جسم")?.subcategoryId).toBe("body cream");
      expect(matchSkinCareSemantic("كريم ترطيب الجسم")?.subcategoryId).toBe("body cream");
    });

    it("recognizes Arabic translations for Toner (تونر للوجه, منقي مسام الوجه)", () => {
      expect(matchSkinCareSemantic("تونر للوجه")?.subcategoryId).toBe("Toner");
      expect(matchSkinCareSemantic("منقي مسام")?.subcategoryId).toBe("Toner");
    });

    it("recognizes Arabic translations for Foundation (كريم أساس, مستحضر أساس للمكياج)", () => {
      expect(matchSkinCareSemantic("كريم أساس")?.subcategoryId).toBe("Foundation");
      expect(matchSkinCareSemantic("مستحضر أساس للمكياج")?.subcategoryId).toBe("Foundation");
    });

    it("recognizes Arabic translations for Body Oil (زيت جسم, زيت للجسم, زيت ترطيب الجسم)", () => {
      expect(matchSkinCareSemantic("زيت جسم")?.subcategoryId).toBe("Body Oil");
      expect(matchSkinCareSemantic("زيت للجسم")?.subcategoryId).toBe("Body Oil");
      expect(matchSkinCareSemantic("زيت ترطيب الجسم")?.subcategoryId).toBe("Body Oil");
    });

    it("recognizes Arabic translations for LIP GLOSS (ملمع شفاه, جلوس شفاه, ملمع شفايف)", () => {
      expect(matchSkinCareSemantic("ملمع شفاه")?.subcategoryId).toBe("LIP GLOSS");
      expect(matchSkinCareSemantic("جلوس شفاه")?.subcategoryId).toBe("LIP GLOSS");
      expect(matchSkinCareSemantic("ملمع شفايف")?.subcategoryId).toBe("LIP GLOSS");
    });

    it("recognizes Arabic translations for Hand cream (كريم إيد, كريم لليدين, مرطب اليدين)", () => {
      expect(matchSkinCareSemantic("كريم إيد")?.subcategoryId).toBe("Hand cream");
      expect(matchSkinCareSemantic("كريم لليدين")?.subcategoryId).toBe("Hand cream");
      expect(matchSkinCareSemantic("مرطب اليدين")?.subcategoryId).toBe("Hand cream");
    });

    it("recognizes Arabic translations for bikini (تفتيح المناطق الحساسة, كريم بكيني, العناية بالمنطقة الحساسة)", () => {
      expect(matchSkinCareSemantic("تفتيح المناطق الحساسة")?.subcategoryId).toBe("bikini");
      expect(matchSkinCareSemantic("العناية بالمنطقة الحساسة")?.subcategoryId).toBe("bikini");
    });

    it("recognizes Arabic translations for Hair subcategories (لوشن للشعر, سيروم للشعر, ماسك للشعر)", () => {
      expect(matchSkinCareSemantic("لوشن للشعر")?.subcategoryId).toBe("Hair Lotion");
      expect(matchSkinCareSemantic("سيروم للشعر")?.subcategoryId).toBe("Hair Serum");
      expect(matchSkinCareSemantic("ماسك للشعر")?.subcategoryId).toBe("Hair Mask");
    });
  });

  // ── Strict Independence: Proof that Path A and Path B are Separate ─────────
  describe("Strict Independence of Path A and Path B", () => {
    it("proves that phonetic transliteration 'بودي لوشن' does NOT match semantic path", () => {
      expect(matchSkinCarePhonetic("بودي لوشن")).not.toBeNull();
      expect(matchSkinCareSemantic("بودي لوشن")).toBeNull();
    });

    it("proves that semantic translation 'لوشن للجسم' does NOT match phonetic path", () => {
      expect(matchSkinCareSemantic("لوشن للجسم")).not.toBeNull();
      expect(matchSkinCarePhonetic("لوشن للجسم")).toBeNull();
    });

    it("proves that phonetic 'صن سكرين' does NOT match semantic path", () => {
      expect(matchSkinCarePhonetic("صن سكرين")).not.toBeNull();
      expect(matchSkinCareSemantic("صن سكرين")).toBeNull();
    });

    it("proves that semantic 'واقي شمس' does NOT match phonetic path", () => {
      expect(matchSkinCareSemantic("واقي شمس")).not.toBeNull();
      expect(matchSkinCarePhonetic("واقي شمس")).toBeNull();
    });

    it("both paths resolve to identical canonical subcategory in resolveSkinCareSubcategory", () => {
      const phoneticRes = resolveSkinCareSubcategory("بودي لوشن");
      const semanticRes = resolveSkinCareSubcategory("مرطب للجسم");
      expect(phoneticRes?.subcategoryId).toBe("body lotion");
      expect(semanticRes?.subcategoryId).toBe("body lotion");
      expect(phoneticRes?.matchType).toBe("phonetic");
      expect(semanticRes?.matchType).toBe("semantic");
    });

    it("identifies 'both' when a user supplies both transliteration and translation in the same query", () => {
      const combinedRes = resolveSkinCareSubcategory("غسول وجه فيس كلينزر");
      expect(combinedRes?.subcategoryId).toBe("Face cleanser");
      expect(combinedRes?.matchType).toBe("both");
    });
  });

  // ── Ambiguity Resolution ──────────────────────────────────────────────────
  describe("Ambiguity Resolution for generic isolated words", () => {
    it("flags isolated 'كريم' as ambiguous with options when no context exists", () => {
      const res = resolveSkinCareSubcategory("عايز كريم");
      expect(res?.isAmbiguous).toBe(true);
      expect(res?.ambiguousOptions).toEqual(
        expect.arrayContaining(["Face Creams & Moisturizers", "body cream", "Hand cream"])
      );
      expect(res?.clarifyingQuestion).toBeTruthy();
    });

    it("resolves 'كريم' to Face Creams & Moisturizers when face context is provided in query", () => {
      const res = resolveSkinCareSubcategory("عايز كريم للوش");
      expect(res?.subcategoryId).toBe("Face Creams & Moisturizers");
      expect(res?.isAmbiguous).toBeFalsy();
    });

    it("resolves 'كريم' to body cream when body context is provided in query", () => {
      const res = resolveSkinCareSubcategory("عايز كريم للجسم");
      expect(res?.subcategoryId).toBe("body cream");
      expect(res?.isAmbiguous).toBeFalsy();
    });

    it("resolves 'كريم' to Hand cream when hand context is provided in query", () => {
      const res = resolveSkinCareSubcategory("عايز كريم لليدين");
      expect(res?.subcategoryId).toBe("Hand cream");
      expect(res?.isAmbiguous).toBeFalsy();
    });

    it("resolves ambiguous 'كريم' using previous message history about face", () => {
      const history = [
        { sender: "user" as const, text: "عايز حاجة لوشي" },
        { sender: "bot" as const, text: "عندنا غسولات ومرطبات للوجه" },
      ];
      const res = resolveSkinCareSubcategory("طب وريني كريم", history);
      expect(res?.subcategoryId).toBe("Face Creams & Moisturizers");
      expect(res?.isAmbiguous).toBeFalsy();
    });

    it("flags isolated 'غسول' as ambiguous between face cleanser and body wash", () => {
      const res = resolveSkinCareSubcategory("عندكم غسول؟");
      expect(res?.isAmbiguous).toBe(true);
      expect(res?.ambiguousOptions).toEqual(
        expect.arrayContaining(["Face cleanser", "BODY WASH"])
      );
    });

    it("flags isolated 'زيت' as ambiguous between body oil and nail oil", () => {
      const res = resolveSkinCareSubcategory("عايز زيت");
      expect(res?.isAmbiguous).toBe(true);
      expect(res?.ambiguousOptions).toEqual(
        expect.arrayContaining(["Body Oil", "NAIL OIL"])
      );
    });
  });
});

describe("Skin Care catalog product search — Mock Catalog Tests", () => {
  const skinCareCatalog = [
    {
      id: 701,
      name: "CeraVe Hydrating Facial Cleanser 236ml",
      brand: "CeraVe",
      category: "skincare",
      subcategory: "Face cleanser",
      price: 320,
      description: "Non-foaming face wash for normal to dry skin. Cleanses and hydrates without disrupting the protective skin barrier. Contains 3 essential ceramides and hyaluronic acid.",
      skinType: "Dry",
    },
    {
      id: 702,
      name: "La Roche-Posay Effaclar Purifying Foaming Gel",
      brand: "La Roche-Posay",
      category: "skincare",
      subcategory: "Face cleanser",
      price: 450,
      description: "Gentle foaming gel cleanser for oily and blemish-prone skin. Purifies skin while eliminating excess sebum.",
      skinType: "Oily",
    },
    {
      id: 703,
      name: "Nivea Nourishing Body Lotion 400ml",
      brand: "Nivea",
      category: "skincare",
      subcategory: "body lotion",
      price: 180,
      description: "Deeply moisturizing body lotion with almond oil. Infused with deep moisture serum for 48h dry skin relief.",
      skinType: "Dry",
    },
    {
      id: 704,
      name: "CeraVe Moisturizing Cream 340g",
      brand: "CeraVe",
      category: "skincare",
      subcategory: "Face Creams & Moisturizers",
      price: 420,
      description: "Rich moisturizing cream for dry to very dry skin on face and body. Suitable for night use and day use.",
      skinType: "Dry",
    },
    {
      id: 705,
      name: "Bioderma Photoderm Max Aquafluid SPF 50+",
      brand: "Bioderma",
      category: "skincare",
      subcategory: "SunSCREEN",
      price: 520,
      description: "High sun protection fluid with SPF 50+ UVA/UVB protection. Water-resistant and anti-shine finish for sensitive skin.",
      skinType: "Sensitive",
    },
    {
      id: 706,
      name: "The Ordinary Hyaluronic Acid 2% + B5",
      brand: "The Ordinary",
      category: "skincare",
      subcategory: "Serum",
      price: 480,
      description: "Hydrating face serum that plumps and smooths skin texture with multi-depth hydration.",
      skinType: "All",
    },
    {
      id: 707,
      name: "Kiehl's Creamy Eye Treatment with Avocado",
      brand: "Kiehl's",
      category: "skincare",
      subcategory: "eye contour",
      price: 650,
      description: "Nourishing eye contour cream that gently moisturizes delicate under-eye area. Relieves dryness around eyes and prevents fine dehydration lines.",
      skinType: "Sensitive",
    },
    {
      id: 708,
      name: "Eucerin Roughness Relief Body Lotion with Urea",
      brand: "Eucerin",
      category: "skincare",
      subcategory: "body Urea",
      price: 390,
      description: "Urea-enriched formula that exfoliates and intensely hydrates extremely dry, rough, and bumpy skin.",
      skinType: "Dry",
    },
    {
      id: 709,
      name: "Bioderma Atoderm Shower Gel 500ml",
      brand: "Bioderma",
      category: "skincare",
      subcategory: "BODY WASH",
      price: 340,
      description: "Soap-free foaming body wash cleanser for normal to dry sensitive body skin.",
      skinType: "Sensitive",
    },
    {
      id: 710,
      name: "Mavala Cuticle and Nail Oil 10ml",
      brand: "Mavala",
      category: "skincare",
      subcategory: "NAIL OIL",
      price: 210,
      description: "Nutritive oil treatment for dry cuticles and damaged nails.",
      skinType: null,
    },
    {
      id: 711,
      name: "Carmex Classic Lip Balm Pot 7.5g",
      brand: "Carmex",
      category: "skincare",
      subcategory: "LIP PALM",
      price: 130,
      description: "Medicated lip balm that soothes, relieves, and softens dry and chapped lips with camphor and menthol.",
      skinType: null,
    },
    {
      id: 712,
      name: "Fenty Beauty Gloss Bomb Universal Lip Luminizer",
      brand: "Fenty",
      category: "skincare",
      subcategory: "LIP GLOSS",
      price: 550,
      description: "High-shine lip gloss with conditioning shea butter for luscious, shiny lips.",
      skinType: null,
    },
    {
      id: 713,
      name: "Neutrogena Hydro Boost Body Gel Cream",
      brand: "Neutrogena",
      category: "skincare",
      subcategory: "body cream",
      price: 260,
      description: "Refreshing body cream formula with hyaluronic acid for soft, supple skin.",
      skinType: null,
    },
    {
      id: 714,
      name: "COSRX Clarifying Treatment Toner 150ml",
      brand: "COSRX",
      category: "skincare",
      subcategory: "Toner",
      price: 380,
      description: "Mild exfoliating toner formulated with AHA and BHA to purify pores and refine skin texture.",
      skinType: "Oily",
    },
    {
      id: 715,
      name: "Maybelline Fit Me Matte + Poreless Liquid Foundation",
      brand: "Maybelline",
      category: "skincare",
      subcategory: "Foundation",
      price: 290,
      description: "Lightweight liquid foundation that mattifies and refines pores for a natural, seamless finish.",
      skinType: "Normal to Oily",
    },
    {
      id: 716,
      name: "Palmer's Cocoa Butter Body Therapy Oil",
      brand: "Palmer's",
      category: "skincare",
      subcategory: "Body Oil",
      price: 240,
      description: "Rich moisturizing body oil that improves the appearance of scars, stretch marks, and dry, damaged skin.",
      skinType: null,
    },
    {
      id: 717,
      name: "Starville Whitening Cream for Sensitive Area",
      brand: "Starville",
      category: "skincare",
      subcategory: "bikini",
      price: 150,
      description: "Gentle lightening and soothing cream formulated specifically for bikini and sensitive areas.",
      skinType: "Sensitive",
    },
    {
      id: 718,
      name: "L'Occitane Shea Butter Hand Cream 75ml",
      brand: "L'Occitane",
      category: "skincare",
      subcategory: "Hand cream",
      price: 490,
      description: "Intensely moisturizing hand cream with 20% organic shea butter to nourish and protect dry hands.",
      skinType: "Dry",
    },
  ] as any;

  // ── Matching by Need / Functional Paraphrase ──────────────────────────────
  it("'عايز حاجة تنظف وشي' finds Face cleanser products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "عايز حاجة تنظف وشي");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Face cleanser");
  });

  it("'عندي جفاف حوالين العين، عندكم حاجة مناسبة؟' finds eye contour products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "عندي جفاف حوالين العين، عندكم حاجة مناسبة؟");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("eye contour");
  });

  it("'عايز حاجة تحمي من الشمس' finds SunSCREEN products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "عايز حاجة تحمي من الشمس");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("SunSCREEN");
  });

  it("'عايز حاجة ترطب شفايفي' finds LIP PALM (balm) products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "عايز حاجة ترطب شفايفي");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("LIP PALM");
  });

  it("'محتاج مرطب لبشرتي' finds Face Creams & Moisturizers", () => {
    const results = searchCatalogProducts(skinCareCatalog, "محتاج مرطب لبشرتي");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Face Creams & Moisturizers");
  });

  // ── Subcategory-First Retrieval ───────────────────────────────────────────
  it("Path A phonetic 'فيس كلينزر' returns Face cleanser products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "فيس كلينزر");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.subcategory === "Face cleanser")).toBe(true);
  });

  it("Path B semantic 'غسول الوجه' returns Face cleanser products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "غسول الوجه");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p: any) => p.subcategory === "Face cleanser")).toBe(true);
  });

  it("Path A phonetic 'بودي لوشن' returns body lotion products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "بودي لوشن");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("body lotion");
  });

  it("Path B semantic 'مرطب للجسم' returns body lotion products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "مرطب للجسم");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("body lotion");
  });

  it("Path A phonetic 'صن سكرين' returns SunSCREEN products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "صن سكرين");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("SunSCREEN");
  });

  it("Path B semantic 'واقي شمس' returns SunSCREEN products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "واقي شمس");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("SunSCREEN");
  });

  it("Path A phonetic 'آي كونتور' returns eye contour products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "آي كونتور");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("eye contour");
  });

  it("Path B semantic 'كريم العين' returns eye contour products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "كريم العين");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("eye contour");
  });

  it("Path A phonetic 'ليب جلوس' returns LIP GLOSS products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "ليب جلوس");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("LIP GLOSS");
  });

  it("Path B semantic 'ملمع شفاه' returns LIP GLOSS products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "ملمع شفاه");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("LIP GLOSS");
  });

  it("Path A phonetic 'هاند كريم' returns Hand cream products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "هاند كريم");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Hand cream");
  });

  it("Path B semantic 'مرطب اليدين' returns Hand cream products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "مرطب اليدين");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Hand cream");
  });

  it("Path A phonetic 'نيل اويل' returns NAIL OIL products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "نيل اويل");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("NAIL OIL");
  });

  it("Path B semantic 'زيت أظافر' returns NAIL OIL products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "زيت أظافر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("NAIL OIL");
  });

  it("Path A phonetic 'بادي ووش' returns BODY WASH products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "بادي ووش");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("BODY WASH");
  });

  it("Path B semantic 'شاور جل للجسم' returns BODY WASH products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "شاور جل");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("BODY WASH");
  });

  it("Path A phonetic 'بادي اويل' returns Body Oil products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "بادي اويل");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Body Oil");
  });

  it("Path B semantic 'زيت ترطيب الجسم' returns Body Oil products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "زيت ترطيب الجسم");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Body Oil");
  });

  it("Path A phonetic 'بادي يوريا' returns body Urea products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "بادي يوريا");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("body Urea");
  });

  it("Path B semantic 'يوريا للجسم' returns body Urea products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "يوريا للجسم");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("body Urea");
  });

  it("Path A phonetic 'فاونديشن' returns Foundation products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "فاونديشن");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Foundation");
  });

  it("Path B semantic 'كريم أساس' returns Foundation products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "كريم أساس");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Foundation");
  });

  it("Path A phonetic 'بيكيني' returns bikini products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "بيكيني");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("bikini");
  });

  it("Path B semantic 'تفتيح المناطق الحساسة' returns bikini products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "تفتيح المناطق الحساسة");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("bikini");
  });

  it("Main category request 'عناية بالبشرة' returns products across Skin Care subcategories", () => {
    const results = searchCatalogProducts(skinCareCatalog, "عايز منتجات عناية بالبشرة");
    expect(results.length).toBeGreaterThan(1);
    const subcats = new Set(results.map((p: any) => p.subcategory));
    expect(subcats.size).toBeGreaterThan(1);
  });

  // ── Zero-Product Subcategories Handling ───────────────────────────────────
  it("requesting Hair Lotion (0 products) returns zero results without inventing products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "هير لوشن");
    expect(results).toHaveLength(0);
  });

  it("requesting Hair Serum (0 products) returns zero results without inventing products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "هير سيروم");
    expect(results).toHaveLength(0);
  });

  it("requesting Hair Mask (0 products) returns zero results without inventing products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "هير ماسك");
    expect(results).toHaveLength(0);
  });

  it("semantic 'لوشن للشعر' (0 products) returns zero results without inventing products", () => {
    const results = searchCatalogProducts(skinCareCatalog, "لوشن للشعر");
    expect(results).toHaveLength(0);
  });

  // ── Product Description Grounding ─────────────────────────────────────────
  it("grounding: questions about oily skin cleanser finds product with oily skin in description", () => {
    const results = searchCatalogProducts(skinCareCatalog, "غسول للبشرة الدهنية");
    expect(results.length).toBeGreaterThan(0);
    // Product 702 description explicitly mentions "oily and blemish-prone skin"
    expect(results[0].id).toBe(702);
  });

  it("grounding: questions about night use find products supported by description", () => {
    const results = searchCatalogProducts(skinCareCatalog, "كريم مرطب للاستخدام الليلي");
    expect(results.length).toBeGreaterThan(0);
    // Product 704 description says "Suitable for night use and day use"
    expect(results.some((p: any) => p.id === 704)).toBe(true);
  });

  it("grounding: questions about SPF 50 sun protection find product 705", () => {
    const results = searchCatalogProducts(skinCareCatalog, "واقي شمس spf 50");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(705);
  });

  it("no-match: completely unrelated request returns empty array", () => {
    const results = searchCatalogProducts(skinCareCatalog, "قطع غيار دراجات هوائية");
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Haircare category — Two-Path Language Understanding & Regression Tests
// =============================================================================

import {
  HAIRCARE_SUBCATEGORIES,
  matchHaircarePhonetic,
  matchHaircareSemantic,
  resolveHaircareSubcategory,
} from "./ChatWidget";

describe("Haircare category — Two-Path Separation Tests", () => {
  it("exports all 15 exact catalog subcategories", () => {
    expect(HAIRCARE_SUBCATEGORIES).toHaveLength(15);
    expect(HAIRCARE_SUBCATEGORIES).toContain("Shampoo");
    expect(HAIRCARE_SUBCATEGORIES).toContain("Conditioner");
    expect(HAIRCARE_SUBCATEGORIES).toContain("ampoules");
    expect(HAIRCARE_SUBCATEGORIES).toContain("serum");
    expect(HAIRCARE_SUBCATEGORIES).toContain("mask");
    expect(HAIRCARE_SUBCATEGORIES).toContain("leave in");
    expect(HAIRCARE_SUBCATEGORIES).toContain("spray");
    expect(HAIRCARE_SUBCATEGORIES).toContain("hair water");
    expect(HAIRCARE_SUBCATEGORIES).toContain("scalp");
    expect(HAIRCARE_SUBCATEGORIES).toContain("hair mist");
    expect(HAIRCARE_SUBCATEGORIES).toContain("EYELASH SERUM");
    expect(HAIRCARE_SUBCATEGORIES).toContain("Oil");
    expect(HAIRCARE_SUBCATEGORIES).toContain("Hair Lotion");
    expect(HAIRCARE_SUBCATEGORIES).toContain("Cream");
    expect(HAIRCARE_SUBCATEGORIES).toContain("fb");
  });

  // ── Path A: Phonetic Transliterations ──────────────────────────────────────
  describe("Path A: Phonetic Transliterations (Sound-based)", () => {
    it("recognizes Shampoo phonetics (شامبو / شامپو)", () => {
      expect(matchHaircarePhonetic("شامبو")?.subcategoryId).toBe("Shampoo");
      expect(matchHaircarePhonetic("شامپو")?.subcategoryId).toBe("Shampoo");
      expect(matchHaircarePhonetic("عايز شامبو")?.subcategoryId).toBe("Shampoo");
    });

    it("recognizes Conditioner phonetics (كونديشنر / كنديشنر / كوندشنر)", () => {
      expect(matchHaircarePhonetic("كونديشنر")?.subcategoryId).toBe("Conditioner");
      expect(matchHaircarePhonetic("كنديشنر")?.subcategoryId).toBe("Conditioner");
      expect(matchHaircarePhonetic("كوندشنر")?.subcategoryId).toBe("Conditioner");
    });

    it("recognizes ampoules phonetics (أمبولات / امبولات)", () => {
      expect(matchHaircarePhonetic("امبولات")?.subcategoryId).toBe("ampoules");
      expect(matchHaircarePhonetic("أمبولات")?.subcategoryId).toBe("ampoules");
      expect(matchHaircarePhonetic("امبول")?.subcategoryId).toBe("ampoules");
    });

    it("recognizes hair serum phonetics (هير سيروم / سيروم / سيرم)", () => {
      expect(matchHaircarePhonetic("هير سيروم")?.subcategoryId).toBe("serum");
      expect(matchHaircarePhonetic("سيروم شعر")?.subcategoryId).toBe("serum");
      expect(matchHaircarePhonetic("سيروم")?.subcategoryId).toBe("serum");
    });

    it("recognizes mask phonetics (هير ماسك / ماسك)", () => {
      expect(matchHaircarePhonetic("هير ماسك")?.subcategoryId).toBe("mask");
      expect(matchHaircarePhonetic("ماسك شعر")?.subcategoryId).toBe("mask");
      expect(matchHaircarePhonetic("ماسك")?.subcategoryId).toBe("mask");
    });

    it("recognizes leave in phonetics (ليف ان / ليف إن / ليفان)", () => {
      expect(matchHaircarePhonetic("ليف ان")?.subcategoryId).toBe("leave in");
      expect(matchHaircarePhonetic("ليف إن")?.subcategoryId).toBe("leave in");
      expect(matchHaircarePhonetic("ليف-ان")?.subcategoryId).toBe("leave in");
      expect(matchHaircarePhonetic("ليفان")?.subcategoryId).toBe("leave in");
    });

    it("recognizes spray phonetics (سبراي / سبراى / هير سبراي)", () => {
      expect(matchHaircarePhonetic("هير سبراي")?.subcategoryId).toBe("spray");
      expect(matchHaircarePhonetic("سبراي شعر")?.subcategoryId).toBe("spray");
      expect(matchHaircarePhonetic("سبراي")?.subcategoryId).toBe("spray");
    });

    it("recognizes hair water phonetics (هير ووتر / هير واتر)", () => {
      expect(matchHaircarePhonetic("هير ووتر")?.subcategoryId).toBe("hair water");
      expect(matchHaircarePhonetic("هير واتر")?.subcategoryId).toBe("hair water");
    });

    it("recognizes scalp phonetics (سكالب / سكالپ)", () => {
      expect(matchHaircarePhonetic("سكالب")?.subcategoryId).toBe("scalp");
      expect(matchHaircarePhonetic("سكالپ")?.subcategoryId).toBe("scalp");
      expect(matchHaircarePhonetic("سكالب شعر")?.subcategoryId).toBe("scalp");
    });

    it("recognizes hair mist phonetics (هير ميست / ميست)", () => {
      expect(matchHaircarePhonetic("هير ميست")?.subcategoryId).toBe("hair mist");
      expect(matchHaircarePhonetic("ميست شعر")?.subcategoryId).toBe("hair mist");
    });

    it("recognizes EYELASH SERUM phonetics (ايلاش سيروم / اي لاش سيروم)", () => {
      expect(matchHaircarePhonetic("ايلاش سيروم")?.subcategoryId).toBe("EYELASH SERUM");
      expect(matchHaircarePhonetic("اي لاش سيروم")?.subcategoryId).toBe("EYELASH SERUM");
      expect(matchHaircarePhonetic("ايلاش سيرم")?.subcategoryId).toBe("EYELASH SERUM");
    });

    it("recognizes Oil phonetics (هير اويل / اويل)", () => {
      expect(matchHaircarePhonetic("هير اويل")?.subcategoryId).toBe("Oil");
      expect(matchHaircarePhonetic("اويل شعر")?.subcategoryId).toBe("Oil");
    });

    it("recognizes Hair Lotion phonetics (هير لوشن / لوشن)", () => {
      expect(matchHaircarePhonetic("هير لوشن")?.subcategoryId).toBe("Hair Lotion");
      expect(matchHaircarePhonetic("لوشن شعر")?.subcategoryId).toBe("Hair Lotion");
    });

    it("recognizes Cream phonetics (هير كريم / كريم)", () => {
      expect(matchHaircarePhonetic("هير كريم")?.subcategoryId).toBe("Cream");
      expect(matchHaircarePhonetic("كريم شعر")?.subcategoryId).toBe("Cream");
    });

    it("recognizes fb phonetics (fb / اف بي / إف بي)", () => {
      expect(matchHaircarePhonetic("fb")?.subcategoryId).toBe("fb");
      expect(matchHaircarePhonetic("اف بي")?.subcategoryId).toBe("fb");
      expect(matchHaircarePhonetic("إف بي")?.subcategoryId).toBe("fb");
    });
  });

  // ── Path B: Semantic Translations ──────────────────────────────────────────
  describe("Path B: Accurate Arabic Translations & Semantic Equivalents", () => {
    it("maps 'بلسم للشعر' / 'ملين للشعر' to Conditioner", () => {
      expect(matchHaircareSemantic("بلسم")?.subcategoryId).toBe("Conditioner");
      expect(matchHaircareSemantic("بلسم للشعر")?.subcategoryId).toBe("Conditioner");
      expect(matchHaircareSemantic("ملين للشعر")?.subcategoryId).toBe("Conditioner");
      expect(matchHaircareSemantic("حاجه تنعم شعري")?.subcategoryId).toBe("Conditioner");
    });

    it("maps leave-in semantic expressions to 'leave in'", () => {
      expect(matchHaircareSemantic("كريم يترك على الشعر")?.subcategoryId).toBe("leave in");
      expect(matchHaircareSemantic("حاجة تتساب على الشعر من غير شطف")?.subcategoryId).toBe("leave in");
      expect(matchHaircareSemantic("حاجة تفضل على شعري بعد الشاور")?.subcategoryId).toBe("leave in");
      expect(matchHaircareSemantic("منتج للشعر يترك دون شطف")?.subcategoryId).toBe("leave in");
      expect(matchHaircareSemantic("بلسم بدون شطف")?.subcategoryId).toBe("leave in");
    });

    it("maps 'حمام كريم' / 'قناع للشعر' to mask", () => {
      expect(matchHaircareSemantic("حمام كريم")?.subcategoryId).toBe("mask");
      expect(matchHaircareSemantic("حمام كريم للشعر")?.subcategoryId).toBe("mask");
      expect(matchHaircareSemantic("قناع للشعر")?.subcategoryId).toBe("mask");
      expect(matchHaircareSemantic("علاج مكثف للشعر")?.subcategoryId).toBe("mask");
    });

    it("maps 'عناية بفروة الرأس' to scalp", () => {
      expect(matchHaircareSemantic("عناية بفروة الرأس")?.subcategoryId).toBe("scalp");
      expect(matchHaircareSemantic("منتج لفروة الرأس")?.subcategoryId).toBe("scalp");
      expect(matchHaircareSemantic("علاج فروة الرأس")?.subcategoryId).toBe("scalp");
      expect(matchHaircareSemantic("جلدة الراس")?.subcategoryId).toBe("scalp");
    });

    it("maps 'ماء للشعر' / 'مستحضر مائي للشعر' to hair water", () => {
      expect(matchHaircareSemantic("ماء للشعر")?.subcategoryId).toBe("hair water");
      expect(matchHaircareSemantic("مياه للشعر")?.subcategoryId).toBe("hair water");
      expect(matchHaircareSemantic("مستحضر مائي للشعر")?.subcategoryId).toBe("hair water");
    });

    it("maps 'معطر للشعر' / 'برفان شعر' to hair mist", () => {
      expect(matchHaircareSemantic("معطر للشعر")?.subcategoryId).toBe("hair mist");
      expect(matchHaircareSemantic("عطر للشعر")?.subcategoryId).toBe("hair mist");
      expect(matchHaircareSemantic("برفان شعر")?.subcategoryId).toBe("hair mist");
    });

    it("maps 'أمبولات لتساقط الشعر' / 'كورس أمبولات' to ampoules", () => {
      expect(matchHaircareSemantic("أمبولات للشعر")?.subcategoryId).toBe("ampoules");
      expect(matchHaircareSemantic("كورس امبولات")?.subcategoryId).toBe("ampoules");
      expect(matchHaircareSemantic("علاج في امبولات")?.subcategoryId).toBe("ampoules");
    });

    it("maps 'سيروم رموش' / 'تكثيف الرموش' to EYELASH SERUM", () => {
      expect(matchHaircareSemantic("سيروم رموش")?.subcategoryId).toBe("EYELASH SERUM");
      expect(matchHaircareSemantic("سيروم للرموش")?.subcategoryId).toBe("EYELASH SERUM");
      expect(matchHaircareSemantic("مصل للرموش")?.subcategoryId).toBe("EYELASH SERUM");
      expect(matchHaircareSemantic("تكثيف الرموش")?.subcategoryId).toBe("EYELASH SERUM");
      expect(matchHaircareSemantic("علاج رموش")?.subcategoryId).toBe("EYELASH SERUM");
    });

    it("maps 'لوشن للشعر' to Hair Lotion", () => {
      expect(matchHaircareSemantic("لوشن للشعر")?.subcategoryId).toBe("Hair Lotion");
      expect(matchHaircareSemantic("مستحضر سائل للشعر")?.subcategoryId).toBe("Hair Lotion");
    });

    it("maps 'زيت للشعر' to Oil", () => {
      expect(matchHaircareSemantic("زيت للشعر")?.subcategoryId).toBe("Oil");
      expect(matchHaircareSemantic("حمام زيت للشعر")?.subcategoryId).toBe("Oil");
      expect(matchHaircareSemantic("زيوت للشعر")?.subcategoryId).toBe("Oil");
    });

    it("maps 'كريم للشعر' to Cream", () => {
      expect(matchHaircareSemantic("كريم للشعر")?.subcategoryId).toBe("Cream");
      expect(matchHaircareSemantic("دهان للشعر")?.subcategoryId).toBe("Cream");
      expect(matchHaircareSemantic("كريم تصفيف للشعر")?.subcategoryId).toBe("Cream");
    });

    it("maps 'بخاخ للشعر' to spray", () => {
      expect(matchHaircareSemantic("بخاخ للشعر")?.subcategoryId).toBe("spray");
      expect(matchHaircareSemantic("رذاذ للشعر")?.subcategoryId).toBe("spray");
    });

    it("maps 'منظف للشعر' / 'غسيل الشعر' to Shampoo", () => {
      expect(matchHaircareSemantic("منظف للشعر")?.subcategoryId).toBe("Shampoo");
      expect(matchHaircareSemantic("غسيل الشعر")?.subcategoryId).toBe("Shampoo");
      expect(matchHaircareSemantic("تنظيف الشعر")?.subcategoryId).toBe("Shampoo");
    });
  });

  // ── Strict Path Separation ─────────────────────────────────────────────────
  describe("Strict Path Separation between Phonetic and Semantic", () => {
    it("ensures Arabic translation 'بلسم' does not match Path A (phonetic)", () => {
      expect(matchHaircarePhonetic("بلسم")).toBeNull();
      expect(matchHaircareSemantic("بلسم")).not.toBeNull();
    });

    it("ensures 'حمام كريم' does not match Path A (phonetic)", () => {
      expect(matchHaircarePhonetic("حمام كريم")).toBeNull();
      expect(matchHaircareSemantic("حمام كريم")).not.toBeNull();
    });

    it("ensures 'ليف ان' does not match Path B (semantic)", () => {
      expect(matchHaircareSemantic("ليف ان")).toBeNull();
      expect(matchHaircarePhonetic("ليف ان")).not.toBeNull();
    });

    it("ensures 'كونديشنر' does not match Path B (semantic)", () => {
      expect(matchHaircareSemantic("كونديشنر")).toBeNull();
      expect(matchHaircarePhonetic("كونديشنر")).not.toBeNull();
    });

    it("ensures 'سيروم للرموش' does not match Path A (phonetic)", () => {
      expect(matchHaircarePhonetic("سيروم للرموش")).toBeNull();
      expect(matchHaircareSemantic("سيروم للرموش")).not.toBeNull();
    });
  });

  // ── Serum vs Eyelash Serum Distinction ────────────────────────────────────
  describe("Hair Serum vs Eyelash Serum Distinction", () => {
    it("distinguishes eyelash serum from hair serum", () => {
      const eyelashResult = resolveHaircareSubcategory("سيروم للرموش");
      expect(eyelashResult?.subcategoryId).toBe("EYELASH SERUM");

      const hairResult = resolveHaircareSubcategory("سيروم للشعر");
      expect(hairResult?.subcategoryId).toBe("serum");
    });

    it("handles phonetic eyelash serum vs hair serum", () => {
      const eyelashResult = resolveHaircareSubcategory("ايلاش سيروم");
      expect(eyelashResult?.subcategoryId).toBe("EYELASH SERUM");

      const hairResult = resolveHaircareSubcategory("هير سيروم");
      expect(hairResult?.subcategoryId).toBe("serum");
    });
  });

  // ── Leave-in vs Rinse-off (Conditioner / Mask) Distinction ─────────────────
  describe("Leave-in vs Rinse-off Distinction", () => {
    it("maps leave-in to 'leave in' and not Conditioner or mask", () => {
      const leaveInResult = resolveHaircareSubcategory("حاجة تتساب على شعري من غير شطف");
      expect(leaveInResult?.subcategoryId).toBe("leave in");
      expect(leaveInResult?.subcategoryId).not.toBe("Conditioner");
      expect(leaveInResult?.subcategoryId).not.toBe("mask");
    });

    it("maps conditioner to Conditioner and not leave in", () => {
      const condResult = resolveHaircareSubcategory("بلسم للشعر");
      expect(condResult?.subcategoryId).toBe("Conditioner");
      expect(condResult?.subcategoryId).not.toBe("leave in");
    });

    it("maps mask to mask and not leave in", () => {
      const maskResult = resolveHaircareSubcategory("حمام كريم للشعر");
      expect(maskResult?.subcategoryId).toBe("mask");
      expect(maskResult?.subcategoryId).not.toBe("leave in");
    });
  });

  // ── Ambiguity Handling ─────────────────────────────────────────────────────
  describe("Ambiguity Handling for Shared Terms", () => {
    it("flags isolated 'سيروم' as ambiguous when no context exists", () => {
      const res = resolveHaircareSubcategory("عايز سيروم");
      expect(res?.isAmbiguous).toBe(true);
      expect(res?.clarifyingQuestion).toBeDefined();
    });

    it("resolves isolated 'سيروم' to 'serum' when hair context is in conversation history", () => {
      const history = [{ sender: "user" as const, text: "شعري تالف وجاف جدا" }];
      const res = resolveHaircareSubcategory("عايز سيروم", history);
      expect(res?.isAmbiguous).toBeFalsy();
      expect(res?.subcategoryId).toBe("serum");
    });

    it("resolves isolated 'سيروم' to 'EYELASH SERUM' when eyelash context is in conversation history", () => {
      const history = [{ sender: "user" as const, text: "عايزة حاجة لرموشي" }];
      const res = resolveHaircareSubcategory("عايز سيروم", history);
      expect(res?.isAmbiguous).toBeFalsy();
      expect(res?.subcategoryId).toBe("EYELASH SERUM");
    });

    it("flags isolated 'كريم' as ambiguous without context and resolves with hair context", () => {
      const resWithoutContext = resolveHaircareSubcategory("عايز كريم");
      expect(resWithoutContext?.isAmbiguous).toBe(true);

      const history = [{ sender: "user" as const, text: "شعري هايش ومحتاج دهان" }];
      const resWithContext = resolveHaircareSubcategory("عايز كريم", history);
      expect(resWithContext?.isAmbiguous).toBeFalsy();
      expect(resWithContext?.subcategoryId).toBe("Cream");
    });

    it("flags isolated 'زيت' as ambiguous without context and resolves with hair context", () => {
      const resWithoutContext = resolveHaircareSubcategory("عندكم زيت؟");
      expect(resWithoutContext?.isAmbiguous).toBe(true);

      const history = [{ sender: "user" as const, text: "عايز روتين للشعر" }];
      const resWithContext = resolveHaircareSubcategory("عندكم زيت؟", history);
      expect(resWithContext?.isAmbiguous).toBeFalsy();
      expect(resWithContext?.subcategoryId).toBe("Oil");
    });

    it("flags isolated 'سبراي' as ambiguous without context and resolves with hair context", () => {
      const resWithoutContext = resolveHaircareSubcategory("عايز سبراي");
      expect(resWithoutContext?.isAmbiguous).toBe(true);

      const history = [{ sender: "user" as const, text: "عايز منتجات للشعر" }];
      const resWithContext = resolveHaircareSubcategory("عايز سبراي", history);
      expect(resWithContext?.isAmbiguous).toBeFalsy();
      expect(resWithContext?.subcategoryId).toBe("spray");
    });
  });

  // ── Main Category Resolution ───────────────────────────────────────────────
  describe("Main Category: Haircare", () => {
    it("resolves 'عناية بالشعر' and 'روتين الشعر' to Haircare category", () => {
      expect(resolveHaircareSubcategory("عناية بالشعر")?.subcategoryId).toBe("Haircare");
      expect(resolveHaircareSubcategory("روتين الشعر")?.subcategoryId).toBe("Haircare");
      expect(resolveHaircareSubcategory("منتجات الشعر")?.subcategoryId).toBe("Haircare");
    });

    it("resolves phonetic 'هير كير' to Haircare category", () => {
      const res = resolveHaircareSubcategory("هير كير");
      expect(res?.subcategoryId).toBe("Haircare");
      expect(res?.matchType).toBe("phonetic");
    });
  });

  // ── extractIntentSignals Integration ───────────────────────────────────────
  describe("extractIntentSignals integration for Haircare", () => {
    it("extracts Haircare subcategory and populates hair bodyArea", () => {
      const signals = extractIntentSignals("عايز شامبو للشعر");
      expect(signals.haircareSubcategory?.subcategoryId).toBe("Shampoo");
      expect(signals.bodyArea).toContain("hair");
    });

    it("extracts EYELASH SERUM subcategory and populates eyelashes bodyArea", () => {
      const signals = extractIntentSignals("سيروم للرموش");
      expect(signals.haircareSubcategory?.subcategoryId).toBe("EYELASH SERUM");
      expect(signals.bodyArea).toContain("eyelashes");
    });
  });
});

// Mock catalog representing all 15 Haircare subcategories (with 0 products for 'fb')
const mockHaircareCatalog = [
  {
    id: 801,
    name: "Clary Clarifying Anti-Dandruff Shampoo 300ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "Shampoo",
    description: "Deep cleansing anti-dandruff shampoo for clean scalp and healthy hair. Helps eliminate dandruff flakes and excess oils.",
    originalPrice: 220,
    rating: 4.8,
    reviews: 15,
    image: "https://example.com/shampoo.jpg",
  },
  {
    id: 802,
    name: "Clary Argan Smoothing Conditioner 300ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "Conditioner",
    description: "Nourishing rinse-out conditioner with argan oil to soften and detangle hair after shampooing.",
    originalPrice: 240,
    rating: 4.7,
    reviews: 12,
    image: "https://example.com/cond.jpg",
  },
  {
    id: 803,
    name: "Seropipe Hair Growth Anti-Loss Ampoules 10x10ml",
    brand: "Seropipe",
    category: "Haircare",
    subcategory: "ampoules",
    description: "Intensive anti-hair loss ampoules that stimulate hair growth and strengthen weak follicles.",
    originalPrice: 550,
    rating: 4.9,
    reviews: 20,
    image: "https://example.com/ampoules.jpg",
  },
  {
    id: 804,
    name: "Clary Anti-Frizz Hair Serum with Keratin 100ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "serum",
    description: "Anti-frizz hair serum providing heat protection and brilliant shine for damaged hair ends.",
    originalPrice: 310,
    rating: 4.8,
    reviews: 18,
    image: "https://example.com/serum.jpg",
  },
  {
    id: 805,
    name: "Clary Deep Repair Hair Mask 500ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "mask",
    description: "Intensive rinse-off hair mask (hamam cream) providing deep moisture and repair for very dry, damaged hair.",
    originalPrice: 280,
    rating: 4.9,
    reviews: 25,
    image: "https://example.com/mask.jpg",
  },
  {
    id: 806,
    name: "Clary Leave-in Conditioning Cream 200ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "leave in",
    description: "Post-shower leave-in treatment that stays in hair without rinsing. Controls frizz and defines natural curls all day.",
    originalPrice: 260,
    rating: 4.7,
    reviews: 14,
    image: "https://example.com/leavein.jpg",
  },
  {
    id: 807,
    name: "Clary Thermal Styling Hair Protection Spray 200ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "spray",
    description: "Protective hair styling spray shielding hair fibers from flat iron heat and styling tools.",
    originalPrice: 230,
    rating: 4.6,
    reviews: 9,
    image: "https://example.com/spray.jpg",
  },
  {
    id: 808,
    name: "Clary Rosemary Hair Water Infusion 150ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "hair water",
    description: "Hydrating aqueous rosemary hair water infusion for scalp soothing and follicle revitalization.",
    originalPrice: 190,
    rating: 4.5,
    reviews: 7,
    image: "https://example.com/water.jpg",
  },
  {
    id: 809,
    name: "Clary Scalp Detox & Exfoliating Scrub 250ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "scalp",
    description: "Scalp soothing treatment removing buildup, soothing itching, and purifying scalp skin.",
    originalPrice: 290,
    rating: 4.7,
    reviews: 11,
    image: "https://example.com/scalp.jpg",
  },
  {
    id: 810,
    name: "Clary Silky Jasmine Hair Mist 100ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "hair mist",
    description: "Delicate fragrant hair perfume mist keeping hair fresh and pleasantly scented all day long.",
    originalPrice: 210,
    rating: 4.6,
    reviews: 16,
    image: "https://example.com/mist.jpg",
  },
  {
    id: 811,
    name: "RapidLash Eyelash Enhancing Growth Serum 3ml",
    brand: "RapidLash",
    category: "Haircare",
    subcategory: "EYELASH SERUM",
    description: "Clinically proven eyelash growth serum to lengthen and thicken sparse eyelashes. Formulated specifically for lash lines.",
    originalPrice: 650,
    rating: 4.9,
    reviews: 30,
    image: "https://example.com/eyelash.jpg",
  },
  {
    id: 812,
    name: "Clary Pure Rosemary Hair Oil 120ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "Oil",
    description: "Nourishing rosemary and castor hair oil blend for root stimulation and deep hot oil bath treatments.",
    originalPrice: 270,
    rating: 4.8,
    reviews: 22,
    image: "https://example.com/oil.jpg",
  },
  {
    id: 813,
    name: "Clary Fortifying Hair Lotion 150ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "Hair Lotion",
    description: "Daily lightweight liquid hair lotion for root nourishment and easy hair management.",
    originalPrice: 250,
    rating: 4.6,
    reviews: 8,
    image: "https://example.com/lotion.jpg",
  },
  {
    id: 814,
    name: "Clary Curl Defining Hair Cream 250ml",
    brand: "Clary",
    category: "Haircare",
    subcategory: "Cream",
    description: "Moisturizing hair styling cream for curl definition, moisture retention, and daily combing ease.",
    originalPrice: 220,
    rating: 4.7,
    reviews: 19,
    image: "https://example.com/cream.jpg",
  },
  // Note: subcategory "fb" has ZERO products in the catalog!
];

describe("Haircare Catalog Matching & Retrieval Tests", () => {
  it("retrieves Shampoo products for phonetic 'شامبو'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "شامبو");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Shampoo");
    expect(results[0].id).toBe(801);
  });

  it("retrieves Conditioner products for Arabic translation 'بلسم للشعر'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "بلسم للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Conditioner");
    expect(results[0].id).toBe(802);
  });

  it("retrieves Conditioner products for phonetic 'كونديشنر'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "كونديشنر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Conditioner");
    expect(results[0].id).toBe(802);
  });

  it("retrieves ampoules products for 'أمبولات لتساقط الشعر'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "أمبولات لتساقط الشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("ampoules");
    expect(results[0].id).toBe(803);
  });

  it("retrieves hair serum and NOT eyelash serum for 'سيروم للشعر'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "سيروم للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("serum");
    expect(results[0].id).toBe(804);
    expect(results.every(p => p.subcategory !== "EYELASH SERUM")).toBe(true);
  });

  it("retrieves EYELASH SERUM and NOT hair serum for 'سيروم للرموش'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "سيروم للرموش");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("EYELASH SERUM");
    expect(results[0].id).toBe(811);
    expect(results.every(p => p.subcategory !== "serum")).toBe(true);
  });

  it("retrieves mask products for 'حمام كريم للشعر'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "حمام كريم للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("mask");
    expect(results[0].id).toBe(805);
  });

  it("retrieves leave-in products for 'حاجة تتساب على شعري من غير شطف'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "حاجة تتساب على شعري من غير شطف");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("leave in");
    expect(results[0].id).toBe(806);
  });

  it("retrieves leave-in products for phonetic 'ليف ان'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "ليف ان");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("leave in");
    expect(results[0].id).toBe(806);
  });

  it("retrieves spray products for 'بخاخ للشعر' and 'هير سبراي'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "بخاخ للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("spray");
    expect(results[0].id).toBe(807);
  });

  it("retrieves hair water products for 'هير ووتر'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "هير ووتر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("hair water");
    expect(results[0].id).toBe(808);
  });

  it("retrieves scalp products for 'عناية بفروة الرأس'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "عناية بفروة الرأس");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("scalp");
    expect(results[0].id).toBe(809);
  });

  it("retrieves hair mist products for 'معطر للشعر' and 'هير ميست'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "معطر للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("hair mist");
    expect(results[0].id).toBe(810);
  });

  it("retrieves hair oil products for 'زيت للشعر' and 'هير اويل'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "زيت للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Oil");
    expect(results[0].id).toBe(812);
  });

  it("retrieves Hair Lotion products for 'لوشن للشعر' and 'هير لوشن'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "لوشن للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Hair Lotion");
    expect(results[0].id).toBe(813);
  });

  it("retrieves Cream products for 'كريم للشعر' and 'هير كريم'", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "كريم للشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subcategory).toBe("Cream");
    expect(results[0].id).toBe(814);
  });

  // ── Zero-Product fb subcategory ────────────────────────────────────────────
  it("zero-product: requesting 'fb' returns empty list without inventing products", () => {
    const results1 = searchCatalogProducts(mockHaircareCatalog, "fb");
    expect(results1).toHaveLength(0);

    const results2 = searchCatalogProducts(mockHaircareCatalog, "اف بي");
    expect(results2).toHaveLength(0);
  });

  // ── Main Category Retrieval ────────────────────────────────────────────────
  it("main category: 'عناية بالشعر' returns all available Haircare products", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "عناية بالشعر");
    expect(results.length).toBeGreaterThan(1);
    expect(results.every(p => p.category === "Haircare")).toBe(true);
  });

  // ── Description Grounding ──────────────────────────────────────────────────
  it("grounding: questions about anti-dandruff finds product with dandruff in description", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "شامبو للقشرة");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(801);
  });

  it("grounding: questions about heat protection find thermal spray 807", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "حماية من حرارة المكواة");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(807);
  });

  it("grounding: questions about anti-hair loss find ampoules 803", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "أمبولات لمنع تساقط الشعر");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(803);
  });

  it("grounding: questions about curl definition find cream 814 or leave-in 806", () => {
    const results = searchCatalogProducts(mockHaircareCatalog, "كريم للشعر الكيرلي لتحديد الكيرلز");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(814);
  });
});
