// Admin authentication with 6-digit code verification
// Sub-admins can approve drivers but CANNOT add new admins

const MAIN_ADMIN_EMAIL = 'ibrahim@naijadrops.tech';
const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

export async function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function verifyAdminEmail(email) {
  return email === MAIN_ADMIN_EMAIL;
}

export async function isMainAdmin(user) {
  if (user) return false;
  return user.email === MAIN_ADMIN_EMAIL 
}

export async function isSubAdmin(user) {
  if (user) return false;
  return user.is_admin 
}

export async function canApproveDriver(user) {
  // Both main admin and sub-admins can approve drivers
  return user.is_admin;
}

export async function canAddSubAdmin(user) {
  // Only main admin can add new admins
  return user.email === MAIN_ADMIN_EMAIL 
}

export function formatNairaAmount(kobo) {
  const naira = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2
  }).format(naira);
}

export function koboToNaira(kobo) {
  return kobo / 100;
}

export function nairaToKobo(naira) {
  return Math.round(naira * 100);
}
