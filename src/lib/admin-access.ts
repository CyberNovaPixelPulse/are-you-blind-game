import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

const COOKIE = "quiz_admin";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function adminKeyMatches(input: string): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !input) return false;
  return timingSafeEqual(digest(input), digest(secret));
}

export function adminCookieValue(): string | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  return createHash("sha256").update(`quiz-admin-v1:${secret}`).digest("hex");
}

export async function assertLocalDev() {
  if (process.env.NODE_ENV !== "development") notFound();
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "";
  const hostname = host.split(":")[0]?.replace(/^\[|\]$/g, "") ?? "";
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    notFound();
  }
}

export async function hasAdminSession(): Promise<boolean> {
  const expected = adminCookieValue();
  if (!expected) return false;
  const jar = await cookies();
  const current = jar.get(COOKIE)?.value;
  if (!current || current.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(current), Buffer.from(expected));
}

export async function requireAdmin() {
  await assertLocalDev();
  if (!process.env.ADMIN_SECRET || !(await hasAdminSession())) notFound();
}

export function adminCookieName() {
  return COOKIE;
}
