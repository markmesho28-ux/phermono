import {
  getGuestLimitStatus,
  formatBotText,
  buildDynamicFallback,
  buildCatalogContext,
  buildWebSearchQuery,
  searchCatalogProducts,
  shouldRetryWithNextGroqKey,
  shouldUseExternalProductResearch,
  resolveProductResearchTarget,
  buildProductResearchContext,
} from "./ChatWidget";

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

describe("external product research helpers", () => {
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

  it("only triggers external research for product-detail and comparison intents", () => {
    expect(shouldUseExternalProductResearch("what ingredients are in lip repair balm?")).toBe(true);
    expect(shouldUseExternalProductResearch("compare lip repair balm and rose glow lip oil")).toBe(true);
    expect(shouldUseExternalProductResearch("what is the price of your lip balm")).toBe(false);
    expect(shouldUseExternalProductResearch("hi there")).toBe(false);
  });

  it("resolves the intended product by name and brand before external search", () => {
    const target = resolveProductResearchTarget(mockProducts, "Phermono Lip Repair Balm ingredients");
    expect(target?.name).toBe("Lip Repair Balm");
    expect(target?.brand).toBe("Phermono");
  });

  it("keeps external research separate from catalog availability and includes source URLs", () => {
    const context = buildProductResearchContext(
      mockProducts[0],
      {
        ok: true,
        summary: "This lip balm is formulated to hydrate dry lips and protect the skin barrier.",
        source: "https://example.com/lip-repair-balm",
        url: "https://example.com/lip-repair-balm",
      }
    );

    expect(context).toContain("Phermono catalog");
    expect(context).toContain("https://example.com/lip-repair-balm");
    expect(context).toContain("This lip balm is formulated");
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

  it("matches Arabic and need-based descriptions, not just one exact string", () => {
    const arabicMatches = searchCatalogProducts(mockProducts, "عايز مرطب شفايف");
    const needMatches = searchCatalogProducts(mockProducts, "I need something to moisturize my lips");

    expect(arabicMatches[0].name).toBe("Lip Repair Balm");
    expect(needMatches[0].name).toBe("Lip Repair Balm");
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

  it("builds an exact external product search query from the real brand and product name", () => {
    expect(buildWebSearchQuery("Lip Repair Balm", "Phermono")).toContain("Phermono");
    expect(buildWebSearchQuery("Lip Repair Balm", "Phermono")).toContain("Lip Repair Balm");
    expect(buildWebSearchQuery("Lip Repair Balm")).toBe("Lip Repair Balm");
  });
});

