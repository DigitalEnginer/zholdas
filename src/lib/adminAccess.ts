import { User } from '../types';

const configuredSuperAdminEmails = (process.env.EXPO_PUBLIC_SUPER_ADMIN_EMAIL ?? '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export function isSuperAdmin(user?: User | null) {
  if (!user || user.role !== 'admin') return false;
  if (configuredSuperAdminEmails.length === 0) return true;
  return configuredSuperAdminEmails.includes(user.email.trim().toLowerCase());
}

export function getSuperAdminEmailRequirement() {
  return configuredSuperAdminEmails.join(', ');
}
