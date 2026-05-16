// Çoklu rol yardımcıları — user.roles array, geriye-uyum için user.role da desteklenir.

export function getUserRoles(user) {
  if (!user) return []
  if (Array.isArray(user.roles)) return user.roles
  if (user.role) return [user.role]
  return []
}

// user belirtilen rollerden EN AZ BİRİNE sahip mi?
export function hasAnyRole(user, ...allowed) {
  const roles = getUserRoles(user)
  return roles.some((r) => allowed.includes(r))
}

// Listenin tamamıyla kesişim var mı (allowed bir array ise)
export function hasAnyRoleArr(user, allowedArr) {
  const roles = getUserRoles(user)
  return roles.some((r) => allowedArr.includes(r))
}

export function formatRoles(user) {
  return getUserRoles(user).join(', ')
}
