const ADMIN_CLIENT_KEYS = ["admin_auth", "quiz_admin"];

export function clearAdminClientCache() {
  if (typeof window === "undefined") return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of ADMIN_CLIENT_KEYS) storage.removeItem(key);
  }
}
