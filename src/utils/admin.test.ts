import { isAdminPhone, checkIsAdminRole, normalizePhone } from './admin';

describe('admin utility functions', () => {
  describe('normalizePhone', () => {
    it('strips non-digits properly', () => {
      expect(normalizePhone('0122 550 2425')).toBe('01225502425');
      expect(normalizePhone('+20-122-550-2425')).toBe('201225502425');
      expect(normalizePhone(null)).toBe('');
      expect(normalizePhone(undefined)).toBe('');
    });
  });

  describe('isAdminPhone', () => {
    it('identifies standard admin phone number 01225502425', () => {
      expect(isAdminPhone('01225502425')).toBe(true);
      expect(isAdminPhone('0122 550 2425')).toBe(true);
      expect(isAdminPhone('0122-550-2425')).toBe(true);
      expect(isAdminPhone('+201225502425')).toBe(true);
      expect(isAdminPhone('1225502425')).toBe(true);
      expect(isAdminPhone('201225502425')).toBe(true);
    });

    it('rejects non-admin phone numbers', () => {
      expect(isAdminPhone('01010072795')).toBe(false);
      expect(isAdminPhone('01112223334')).toBe(false);
      expect(isAdminPhone('')).toBe(false);
      expect(isAdminPhone(null)).toBe(false);
    });
  });

  describe('checkIsAdminRole', () => {
    it('grants admin when phone is 01225502425', () => {
      expect(checkIsAdminRole({ phone: '01225502425' })).toBe(true);
      expect(checkIsAdminRole({ phone: '+201225502425', role: 'customer' })).toBe(true);
      expect(checkIsAdminRole({ user_metadata: { phone: '01225502425' } })).toBe(true);
    });

    it('grants admin when role is admin (case-insensitive)', () => {
      expect(checkIsAdminRole({ role: 'admin' })).toBe(true);
      expect(checkIsAdminRole({ role: 'ADMIN' })).toBe(true);
      expect(checkIsAdminRole({ role: 'Admin' })).toBe(true);
      expect(checkIsAdminRole({ role: 'superadmin' })).toBe(true);
      expect(checkIsAdminRole({ user_metadata: { role: 'admin' } })).toBe(true);
    });

    it('grants admin when is_admin is true', () => {
      expect(checkIsAdminRole({ is_admin: true })).toBe(true);
      expect(checkIsAdminRole({ is_admin: 'true' })).toBe(true);
      expect(checkIsAdminRole({ isAdmin: true })).toBe(true);
      expect(checkIsAdminRole({ user_metadata: { is_admin: true } })).toBe(true);
    });

    it('returns false for regular customer accounts', () => {
      expect(checkIsAdminRole({ role: 'customer', phone: '01010072795' })).toBe(false);
      expect(checkIsAdminRole(null)).toBe(false);
      expect(checkIsAdminRole({})).toBe(false);
    });
  });

  describe('ADMIN_NAME constant', () => {
    it('is set to wassef', () => {
      const { ADMIN_NAME } = require('./admin');
      expect(ADMIN_NAME).toBe('wassef');
    });
  });
});
