import { getGuestLimitStatus, formatBotText, buildDynamicFallback, buildCatalogContext } from "./ChatWidget";

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

