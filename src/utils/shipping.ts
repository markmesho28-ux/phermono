export const SHIPPING_RATES: Record<string, number> = {
  // Only support the two allowed governorates (Arabic names). Default is 50.
  default: 50,
  'أسوان': 50,
  'أسيوط': 50,
};

export function getShippingCost(governorate?: string): number {
  if (!governorate) return SHIPPING_RATES.default;
  return SHIPPING_RATES[governorate] ?? SHIPPING_RATES.default;
}
