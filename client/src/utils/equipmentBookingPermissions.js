const VIEWER_DEPARTMENT_IDS = new Set([1, 3]);
const MECHANICS_USER_IDS = new Set(['JC0023', 'JC0101', 'JC0011', 'JC0019', 'JC005']);

export function getUserRoles(user) {
  return Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean);
}

export function canOperateEquipmentBooking(user) {
  if (!user?.token) return false;
  const roles = getUserRoles(user);
  return roles.includes('admin') ||
    (roles.includes('sales') && Number(user.department_id) === 4) ||
    (roles.includes('supervisor') && Number(user.department_id) === 1) ||
    MECHANICS_USER_IDS.has(String(user.user_id || ''));
}

export function canViewEquipmentBooking(user) {
  if (!user?.token) return false;
  return canOperateEquipmentBooking(user) ||
    VIEWER_DEPARTMENT_IDS.has(Number(user.department_id));
}

export { MECHANICS_USER_IDS };
