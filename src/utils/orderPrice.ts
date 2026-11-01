import type { Product, SiteSettings } from '../types';

export function resolveOrderItemPrice(item: any, productsCatalog?: Product[]): number {
  if (!item || typeof item !== 'object') return 0;

  const candidates = [
    item.price,
    item.unit_price,
    item.unitPrice,
    item.selling_price,
    item.sellingPrice,
    item.item_price,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  const total = Number(item.total_price ?? item.totalPrice);
  const qty = Number(item.qty) || 1;
  if (Number.isFinite(total) && total > 0 && qty > 0) {
    return +(total / qty).toFixed(2);
  }

  if (Array.isArray(productsCatalog) && productsCatalog.length > 0) {
    const matched = productsCatalog.find((product) => {
      const matchId = item.id !== undefined && item.id !== null && String(product.id) === String(item.id);
      const matchName = item.name && product.name && String(product.name).trim().toLowerCase() === String(item.name).trim().toLowerCase();
      return matchId || matchName;
    });

    if (matched) {
      const productPrice = Number(
        matched.sellingPrice ??
        (matched as any).selling_price ??
        (matched as any).price ??
        matched.marketPrice ??
        matched.originalPrice
      );
      if (Number.isFinite(productPrice) && productPrice > 0) {
        return productPrice;
      }
    }
  }

  const fallback = Number(item.price ?? item.unit_price ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

export function normalizeOrderItems(items: any[], productsCatalog?: Product[]): any[] {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const qty = Number(item.qty) || 1;
    const unitPrice = resolveOrderItemPrice(item, productsCatalog);
    const lineTotal = +(unitPrice * qty).toFixed(2);

    return {
      ...item,
      qty,
      price: unitPrice,
      unit_price: unitPrice,
      total_price: lineTotal,
    };
  });
}

export function getOrderShipping(order: any): number {
  const shippingValue = Number(order?.shipping ?? order?.delivery_fee ?? order?.shipping_fee ?? 0);
  return Number.isFinite(shippingValue) && shippingValue >= 0 ? shippingValue : 0;
}

export function getOrderBaseSubtotal(order: any): number {
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemSubtotal = items.reduce((sum: number, item: any) => {
    if (!item || typeof item !== 'object') return sum;

    const quantity = Number(item.qty) || 1;
    const totalPrice = Number(item.total_price ?? item.totalPrice ?? 0);
    if (Number.isFinite(totalPrice) && totalPrice >= 0) {
      return sum + totalPrice;
    }

    const unitPrice = Number(item.price ?? item.unit_price ?? item.unitPrice ?? item.selling_price ?? item.sellingPrice ?? 0);
    if (Number.isFinite(unitPrice) && unitPrice >= 0) {
      return sum + (unitPrice * quantity);
    }

    return sum;
  }, 0);

  if (itemSubtotal > 0) {
    return itemSubtotal;
  }

  const total = Number(order?.total ?? order?.final_total ?? order?.original_total ?? 0) || 0;
  const shipping = getOrderShipping(order);
  return Math.max(total - shipping, 0);
}

export function getOrderPricingSummary(order: any): { originalTotal: number; discountAmount: number; discountPercent: number; finalTotal: number; hasDiscount: boolean } {
  const settings = order?.promoSettings ?? {};
  const promoRule = String(settings?.promo_rule ?? settings?.active_promo ?? '').trim().toLowerCase();
  const promoDiscountPercent = Number(settings?.promo_discount_percent ?? 0);
  const hasDiscount = promoRule === 'percentage_discount' && promoDiscountPercent > 0 && promoDiscountPercent <= 100;
  const baseSubtotal = getOrderBaseSubtotal(order);
  const shipping = getOrderShipping(order);
  const originalTotal = baseSubtotal + shipping;
  const discountAmount = hasDiscount ? Number((baseSubtotal * (promoDiscountPercent / 100)).toFixed(2)) : 0;
  const finalTotal = hasDiscount ? Number(((baseSubtotal - discountAmount) + shipping).toFixed(2)) : originalTotal;

  return {
    originalTotal,
    discountAmount,
    discountPercent: hasDiscount ? promoDiscountPercent : 0,
    finalTotal,
    hasDiscount,
  };
}

export function getOrderDisplayMeta(order: any, settings: Partial<SiteSettings> = {}): { label: string; total: number; hasDiscount: boolean; originalTotal: number; discountAmount: number; finalTotal: number } {
  const promoRule = String(settings?.promo_rule ?? settings?.active_promo ?? '').trim().toLowerCase();
  const promoDiscountPercent = Number(settings?.promo_discount_percent ?? 0);
  const hasDiscount = promoRule === 'percentage_discount' && promoDiscountPercent > 0 && promoDiscountPercent <= 100;
  const baseSubtotal = getOrderBaseSubtotal(order);
  const shipping = getOrderShipping(order);
  const originalTotal = baseSubtotal + shipping;
  const discountAmount = hasDiscount ? Number((baseSubtotal * (promoDiscountPercent / 100)).toFixed(2)) : 0;
  const finalTotal = hasDiscount ? Number(((baseSubtotal - discountAmount) + shipping).toFixed(2)) : originalTotal;

  return {
    label: hasDiscount ? 'Total After Discount' : 'Total',
    total: finalTotal,
    hasDiscount,
    originalTotal,
    discountAmount,
    finalTotal,
  };
}

export function getOrderDisplayTotal(order: any, settings: Partial<SiteSettings> = {}): number {
  return Number(getOrderDisplayMeta(order, settings).total || 0);
}

export function getOrderDisplayItemPrice(item: any): number {
  if (!item || typeof item !== 'object') return 0;

  const qty = Number(item.qty) || 1;
  const price = Number(item.price ?? item.unit_price ?? item.unitPrice ?? 0);
  const totalPrice = Number(item.total_price ?? item.totalPrice ?? 0);

  if (price > 0) return price;
  if (totalPrice > 0 && qty > 0) return Number((totalPrice / qty).toFixed(2));

  return Number(item.price ?? item.unit_price ?? 0) || 0;
}
