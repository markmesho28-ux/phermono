import { formatOrderDate, getOrderTimestamp } from './orderDate';

describe('formatOrderDate', () => {
  it('formats valid ISO date string from createdAt', () => {
    const res = formatOrderDate({ createdAt: '2026-05-10T12:00:00Z' });
    expect(res).not.toBe('Invalid Date');
    expect(res).toContain('2026');
  });

  it('formats created_at property from database row', () => {
    const res = formatOrderDate({ created_at: '2026-06-15T08:30:00Z' });
    expect(res).not.toBe('Invalid Date');
    expect(res).toContain('2026');
  });

  it('formats order_date or date property', () => {
    const res1 = formatOrderDate({ order_date: '2026-07-20T10:00:00Z' });
    expect(res1).not.toBe('Invalid Date');
    expect(res1).toContain('2026');

    const res2 = formatOrderDate({ date: '2026-08-01' });
    expect(res2).not.toBe('Invalid Date');
    expect(res2).toContain('2026');
  });

  it('formats timestamp numbers and numeric strings', () => {
    const timestamp = 1778400000000;
    const res1 = formatOrderDate({ createdAt: timestamp });
    expect(res1).not.toBe('Invalid Date');

    const res2 = formatOrderDate({ created_at: String(timestamp) });
    expect(res2).not.toBe('Invalid Date');
  });

  it('gracefully falls back to current date/time when missing or null', () => {
    const res1 = formatOrderDate({});
    expect(res1).not.toBe('Invalid Date');
    expect(typeof res1).toBe('string');
    expect(res1.length).toBeGreaterThan(0);

    const res2 = formatOrderDate({ createdAt: null, created_at: undefined });
    expect(res2).not.toBe('Invalid Date');

    const res3 = formatOrderDate(null);
    expect(res3).not.toBe('Invalid Date');

    const res4 = formatOrderDate(undefined);
    expect(res4).not.toBe('Invalid Date');
  });

  it('gracefully falls back to current date/time when given an invalid date string', () => {
    const res = formatOrderDate({ createdAt: 'not-a-valid-date-string' });
    expect(res).not.toBe('Invalid Date');
    expect(typeof res).toBe('string');
    expect(res.length).toBeGreaterThan(0);
  });
});

describe('getOrderTimestamp', () => {
  it('returns valid timestamp for valid date fields', () => {
    const ts = getOrderTimestamp({ createdAt: '2026-05-10T12:00:00Z' });
    expect(ts).toBeGreaterThan(0);

    const tsDb = getOrderTimestamp({ created_at: '2026-05-10T12:00:00Z' });
    expect(tsDb).toBeGreaterThan(0);
  });

  it('falls back to 0 or numeric id when missing', () => {
    expect(getOrderTimestamp({})).toBe(0);
    expect(getOrderTimestamp({ id: 1778400000000 })).toBe(1778400000000);
  });
});
