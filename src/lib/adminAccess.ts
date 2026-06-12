import { User } from '../types';

const configuredSuperAdminEmail = process.env.EXPO_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase();

export function isSuperAdmin(user?: User | null) {
  if (!user || user.role !== 'admin') return false;
  if (!configuredSuperAdminEmail) return true;
  return user.email.trim().toLowerCase() === configuredSuperAdminEmail;
}

export function getSuperAdminEmailRequirement() {
  return configuredSuperAdminEmail;
}
