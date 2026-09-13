/**
 * Safely parses and formats order dates with fallbacks for
 * order.createdAt, order.created_at, order.date, order.order_date.
 * Fallbacks gracefully to the current date/time if missing, null, or invalid.
 */
export function formatOrderDate(orderOrDate: any): string {
  const rawDate =
    typeof orderOrDate === 'object' && orderOrDate !== null
      ? (orderOrDate.createdAt ??
         orderOrDate.created_at ??
         orderOrDate.date ??
         orderOrDate.order_date)
      : orderOrDate;

  if (rawDate) {
    const num = Number(rawDate);
    const parsed = !isNaN(num) && num > 1000000000 ? new Date(num) : new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleString();
    }
  }

  // Gracefully fallback to current time or safe formatted string
  return new Date().toLocaleString();
}

/**
 * Returns a valid timestamp number for sorting orders chronologically.
 */
export function getOrderTimestamp(orderOrDate: any): number {
  const rawDate =
    typeof orderOrDate === 'object' && orderOrDate !== null
      ? (orderOrDate.createdAt ??
         orderOrDate.created_at ??
         orderOrDate.date ??
         orderOrDate.order_date)
      : orderOrDate;

  if (rawDate) {
    const num = Number(rawDate);
    const parsed = !isNaN(num) && num > 1000000000 ? new Date(num) : new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  const idNum = Number(orderOrDate?.id);
  if (!isNaN(idNum) && idNum > 1000000000) {
    return idNum;
  }
  return 0;
}
