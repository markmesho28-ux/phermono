import { getGuestLimitStatus, formatBotText, buildDynamicFallback } from "./ChatWidget";

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

