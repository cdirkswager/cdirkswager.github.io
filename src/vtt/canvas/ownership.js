export const OWNERSHIP_LEVELS = ['none', 'observer', 'owner']

export function getAccessLevel(user, actor) {
  if (!user || !actor) return 'none'
  if (user.role === 'dm') return 'owner'
  const grant = actor.ownership?.users?.[user.userId]
  if (grant && OWNERSHIP_LEVELS.indexOf(grant) >= 0) return grant
  const def = actor.ownership?.default
  if (def && OWNERSHIP_LEVELS.indexOf(def) >= 0) return def
  return 'none'
}

export function hasAccess(user, actor, minimum) {
  const levels = { none: 0, observer: 1, owner: 2 }
  const actual = levels[getAccessLevel(user, actor)] ?? 0
  const required = levels[minimum] ?? 0
  return actual >= required
}
