import { useAuth } from "./useAuth";

/**
 * usePermission("ADMIN") -> true/false
 * usePermission(["ADMIN", "TEACHER"]) -> true if role is any of these
 */
export function usePermission(allowedRoles) {
  const { user } = useAuth();
  if (!user) return false;
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(user.role);
}
