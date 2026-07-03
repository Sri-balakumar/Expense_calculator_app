// Admin configuration — single source of truth for who is admin (port of admin-config.js).

export const ADMIN_EMAIL = "sribalakumarr@gmail.com";

export function isAdminEmail(email?: string | null): boolean {
  return (email || "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export function isAdmin(user?: { email?: string | null } | null): boolean {
  return !!user && isAdminEmail(user.email);
}
