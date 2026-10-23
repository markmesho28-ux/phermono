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
  shouldRetryWithNextGroqKey,
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
  },
}));

const originalFetch = global.fetch;

const mockSupabaseGuestUsage = () => {
  (supabase as any).from.mockImplementation(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn().mockReturnThis(),
  }));
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
    expect(searchCatalogProducts(mockProducts, "ليب بالم")[0].name).toBe("Lip Repair Balm");
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

