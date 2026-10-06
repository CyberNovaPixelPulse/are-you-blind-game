const SEEN_KEY = "seen_question_ids";
const LEGACY_KEY = "played_question_ids";
const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEEN = 4000;

export function isQuestionId(value: string) {
  return QUESTION_ID.test(value);
}

function readStoredIds(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && isQuestionId(id)).slice(0, MAX_SEEN);
  } catch {
    return [];
  }
}

export function readSeenIds(): string[] {
  const current = readStoredIds(SEEN_KEY);
  if (current) return current;
  const legacy = readStoredIds(LEGACY_KEY) ?? [];
  if (legacy.length > 0) {
    writeSeenIds(legacy);
    return legacy;
  }
  return [];
}

export function writeSeenIds(ids: string[]) {
  const unique = [...new Set(ids.filter(isQuestionId))].slice(0, MAX_SEEN);
  localStorage.setItem(SEEN_KEY, JSON.stringify(unique));
}

export function rememberSeen(id: string) {
  if (!isQuestionId(id)) return;
  const ids = readSeenIds();
  if (ids.includes(id)) return;
  writeSeenIds([...ids, id]);
}
