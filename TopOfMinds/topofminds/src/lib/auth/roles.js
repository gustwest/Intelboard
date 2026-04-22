export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  CONSULTANT: 'CONSULTANT',
};

export function isAdmin(role) {
  return role === ROLES.SUPERADMIN || role === ROLES.ADMIN;
}

export function isSuperadmin(role) {
  return role === ROLES.SUPERADMIN;
}

export function isConsultant(role) {
  return role === ROLES.CONSULTANT;
}
