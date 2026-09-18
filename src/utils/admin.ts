// Admin constants and utility functions for robust role verification

export const ADMIN_PHONE_NUMBER = '01225502425';
export const ADMIN_NAME = 'wassef';

export const ADMIN_PHONE_VARIANTS = [
  '01225502425',
  '1225502425',
  '+201225502425',
  '201225502425',
];

/**
 * Normalizes phone numbers by stripping all non-digit characters.
 */
export const normalizePhone = (phone?: string | null): string => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').trim();
};

/**
 * Checks if a given phone number matches the primary admin phone number (01225502425).
 * Handles variations such as country codes (+20), missing leading zero, spaces, dashes, etc.
 */
export const isAdminPhone = (phone?: string | null): boolean => {
  if (!phone) return false;
  const digits = normalizePhone(phone);
  return (
    digits === '01225502425' ||
    digits === '1225502425' ||
    digits === '201225502425' ||
    digits.endsWith('1225502425')
  );
};

/**
 * Comprehensive verification of admin privileges for a user, profile row, or session object.
 * Checks:
 * 1. Admin phone number (01225502425 and variants)
 * 2. Associated email containing admin identifiers
 * 3. Database/profile `role` column ('admin', 'ADMIN', 'administrator', 'superadmin')
 * 4. Database/profile `is_admin` or `isAdmin` boolean/flag (true, 'true', 1)
 * 5. Supabase `user_metadata` or `app_metadata`
 */
export const checkIsAdminRole = (profileOrUser?: any): boolean => {
  if (!profileOrUser || typeof profileOrUser !== 'object') return false;

  // 1. Phone number check
  if (
    isAdminPhone(profileOrUser.phone) ||
    isAdminPhone(profileOrUser.phone_number) ||
    isAdminPhone(profileOrUser.user_metadata?.phone) ||
    isAdminPhone(profileOrUser.user_metadata?.phone_number)
  ) {
    return true;
  }

  // 2. Email check
  const email = String(
    profileOrUser.email ??
    profileOrUser.user_metadata?.email ??
    ''
  ).toLowerCase().trim();

  if (email) {
    const emailDigits = email.replace(/\D/g, '');
    if (emailDigits.includes('01225502425') || emailDigits.includes('1225502425')) {
      return true;
    }
    if (email.startsWith('admin@') || email.startsWith('superadmin@')) {
      return true;
    }
  }

  // 3. Role field check (case-insensitive, trims whitespace)
  const role = String(
    profileOrUser.role ??
    profileOrUser.user_metadata?.role ??
    profileOrUser.app_metadata?.role ??
    ''
  ).toLowerCase().trim();

  if (role === 'admin' || role === 'superadmin' || role === 'administrator') {
    return true;
  }

  // 4. Boolean or string flags: is_admin, isAdmin
  const isAdminFlag =
    profileOrUser.is_admin ??
    profileOrUser.isAdmin ??
    profileOrUser.user_metadata?.is_admin ??
    profileOrUser.user_metadata?.isAdmin ??
    profileOrUser.app_metadata?.is_admin;

  if (isAdminFlag === true || String(isAdminFlag).toLowerCase() === 'true' || isAdminFlag === 1) {
    return true;
  }

  return false;
};
