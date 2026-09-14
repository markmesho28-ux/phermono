import { Product } from '../types';

/**
 * Resolves an order item's unit price with robust fallback support:
 * 1. Checks item.price, item.unit_price, item.unitPrice, item.selling_price, item.sellingPrice
 * 2. If item has total_price and qty, derives price = total_price / qty
 * 3. Falls back to looking up the product in the product catalog by ID or by name
 * 4. Ensures a valid finite number is always returned (defaults to 0 if completely unknown)
 */
export function resolveOrderItemPrice(item: any, productsCatalog?: Product[]): number {
  if (!item || typeof item !== 'object') return 0;

  // 1. Direct property candidate check
  const candidates = [
    item.price,
    item.unit_price,
    item.unitPrice,
    item.selling_price,
    item.sellingPrice,
    item.item_price,
  ];

  for (const c of candidates) {
    const val = Number(c);
    if (Number.isFinite(val) && val > 0) {
      return val;
    }
  }

  // 2. Derive from total_price / qty if present
  const total = Number(item.total_price ?? item.totalPrice);
  const qty = Number(item.qty) || 1;
  if (Number.isFinite(total) && total > 0 && qty > 0) {
    return +(total / qty).toFixed(2);
  }

  // 3. Fallback: look up product in the products catalog by product ID or name
  if (Array.isArray(productsCatalog) && productsCatalog.length > 0) {
    const matched = productsCatalog.find(p => {
      const matchId = item.id !== undefined && item.id !== null && String(p.id) === String(item.id);
      const matchName = item.name && p.name && String(p.name).trim().toLowerCase() === String(item.name).trim().toLowerCase();
      return matchId || matchName;
    });

    if (matched) {
      const pPrice = Number(
        matched.sellingPrice ??
        (matched as any).selling_price ??
        (matched as any).price ??
        matched.marketPrice ??
        matched.originalPrice
      );
      if (Number.isFinite(pPrice) && pPrice > 0) {
        return pPrice;
      }
    }
  }

  const fallback = Number(item.price ?? item.unit_price ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

/**
 * Normalizes an order's items array ensuring each item has a valid price,
 * unit_price, and total_price resolved against catalog products.
 */
export function normalizeOrderItems(items: any[], productsCatalog?: Product[]): any[] {
  if (!Array.isArray(items)) return [];
  return items.map(it => {
    const price = resolveOrderItemPrice(it, productsCatalog);
    const qty = Number(it.qty) || 1;
    const totalPrice = Number(it.total_price ?? it.totalPrice) || +(price * qty).toFixed(2);
    return {
      ...it,
      qty,
      price,
      unit_price: Number(it.unit_price) || price,
      total_price: totalPrice,
    };
  });
}
