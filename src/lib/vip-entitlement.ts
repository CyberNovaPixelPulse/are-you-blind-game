export function isVipEntitlementActive(value: {
  is_vip?: unknown;
  vip_plan?: unknown;
  vip_expires_at?: unknown;
} | null | undefined, now = Date.now()) {
  if (value?.is_vip !== true) return false;
  if (value.vip_plan === "lifetime") return true;
  if (value.vip_plan === "monthly") {
    if (typeof value.vip_expires_at !== "string") return false;
    const expires = Date.parse(value.vip_expires_at);
    return Number.isFinite(expires) && expires > now;
  }
  // Legacy manually granted accounts have no plan metadata.
  return value.vip_plan == null;
}
