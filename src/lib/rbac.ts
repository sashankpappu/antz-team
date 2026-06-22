/**
 * App roles → gbrain scopes (§5 of the brief).
 * Every brain read executes under the signed-in user's scope; this mapping is
 * the single source of truth for that translation.
 */
export type AppRole = "viewer" | "member" | "admin";
export type BrainScope = "read" | "write" | "admin";

const ROLE_SCOPES: Record<AppRole, BrainScope[]> = {
  viewer: ["read"],
  member: ["read", "write"],
  admin: ["read", "write", "admin"],
};

export function scopesForRole(role: AppRole): BrainScope[] {
  return ROLE_SCOPES[role] ?? ROLE_SCOPES.viewer;
}

export function roleCan(role: AppRole, scope: BrainScope): boolean {
  return scopesForRole(role).includes(scope);
}
