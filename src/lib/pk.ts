import type { User } from "@supabase/supabase-js";
import { isLanguageCode } from "@/lib/languages";
import { pickPkBot } from "@/lib/pk-bots";
import { MIN_LANGUAGE_POOL } from "@/lib/question-draw";
import { supabase } from "@/lib/supabase";

export const PK_LANGUAGE = "zh-TW";
export const RANDOM_MATCH_WAIT_MS = 15_000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type PkMode = "random" | "private";
export type PkStatus = "waiting" | "playing" | "finished";

export type PkRoom = {
  id: string;
  room_code: string;
  host_id: string;
  mode: PkMode;
  status: PkStatus;
  max_players: number;
  question_ids: string[];
  started_at: string | null;
};

export type PkPlayer = {
  room_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  joined_at: string;
  is_bot: boolean;
  current_question: number;
  total_score: number;
};

export function makeRoomCode() {
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 4);
}

export function pkTableMissing(error: { code?: string | null } | null | undefined) {
  return error?.code === "42P01";
}

function clipName(value: string) {
  const text = [...value.trim()].slice(0, 40).join("");
  return text || "玩家";
}

export async function loadPkIdentity(user: User) {
  const profile = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const meta = user.user_metadata ?? {};
  const fromProfile = typeof profile.data?.username === "string" ? profile.data.username : "";
  const fromMeta = String(meta.full_name || meta.name || "");
  const fromEmail = user.email?.split("@")[0] ?? "";
  const avatarValue = profile.data?.avatar_url || meta.avatar_url || meta.picture || null;
  return {
    username: clipName(fromProfile || fromMeta || fromEmail),
    avatarUrl: typeof avatarValue === "string" && avatarValue.trim() ? avatarValue : null,
  };
}

export function readRoom(value: unknown): PkRoom | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PkRoom>;
  if (
    typeof row.id !== "string" ||
    typeof row.room_code !== "string" ||
    typeof row.host_id !== "string" ||
    (row.mode !== "random" && row.mode !== "private") ||
    (row.status !== "waiting" && row.status !== "playing" && row.status !== "finished") ||
    typeof row.max_players !== "number"
  ) {
    return null;
  }
  const questionIds = Array.isArray(row.question_ids)
    ? row.question_ids.filter((id): id is string => typeof id === "string")
    : [];
  return {
    id: row.id,
    room_code: row.room_code,
    host_id: row.host_id,
    mode: row.mode,
    status: row.status,
    max_players: row.max_players,
    question_ids: questionIds,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
  };
}

export function readPlayer(value: unknown): PkPlayer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PkPlayer>;
  if (typeof row.room_id !== "string" || typeof row.user_id !== "string" || typeof row.username !== "string") {
    return null;
  }
  const question = Number(row.current_question);
  const score = Number(row.total_score);
  return {
    room_id: row.room_id,
    user_id: row.user_id,
    username: row.username,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    joined_at: typeof row.joined_at === "string" ? row.joined_at : "",
    is_bot: row.is_bot === true,
    current_question: Number.isFinite(question) && question > 0 ? Math.floor(question) : 0,
    total_score: Number.isFinite(score) && score > 0 ? Math.floor(score) : 0,
  };
}

export async function addPkBot(roomId: string, usedNames: string[]) {
  const bot = pickPkBot(usedNames);
  const added = await supabase.rpc("add_pk_bot", {
    target_room_id: roomId,
    bot_name: bot.username,
    bot_avatar: bot.avatarUrl,
  });
  if (added.error) throw Object.assign(new Error(added.error.message), { code: added.error.code });
  const row = Array.isArray(added.data) ? added.data[0] : added.data;
  return readPlayer(row);
}

export async function updatePkBotScore(roomId: string, botUserId: string, question: number, score: number) {
  const saved = await supabase.rpc("update_pk_bot_score", {
    target_room_id: roomId,
    bot_user_id: botUserId,
    next_question: question,
    next_score: score,
  });
  if (saved.error) throw Object.assign(new Error(saved.error.message), { code: saved.error.code });
}

export async function saveMyPkScore(roomId: string, userId: string, question: number, score: number) {
  await supabase
    .from("pk_participants")
    .update({ current_question: question, total_score: score })
    .eq("room_id", roomId)
    .eq("user_id", userId);
}

async function loadActiveQuestionIds(language: string | null) {
  let query = supabase.from("questions").select("id").eq("status", "active");
  if (language) query = query.eq("language", language);
  const loaded = await query.limit(200);
  if (loaded.error) throw new Error(loaded.error.message);
  return (loaded.data ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
}

function uniqueIds(groups: string[][]) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const group of groups) {
    for (const id of group) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export async function pickPkQuestionIds(limit = 5, language?: string) {
  const code = language && isLanguageCode(language) ? language : PK_LANGUAGE;
  const groups = [await loadActiveQuestionIds(code)];
  let ids = uniqueIds(groups);
  if (ids.length < MIN_LANGUAGE_POOL) {
    for (const fallback of ["en", "zh-TW"]) {
      if (fallback === code) continue;
      groups.push(await loadActiveQuestionIds(fallback));
      ids = uniqueIds(groups);
      if (ids.length >= MIN_LANGUAGE_POOL) break;
    }
  }
  if (ids.length < MIN_LANGUAGE_POOL) {
    groups.push(await loadActiveQuestionIds(null));
    ids = uniqueIds(groups);
  }
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = ids[index];
    ids[index] = ids[swapIndex];
    ids[swapIndex] = current;
  }
  return ids.slice(0, limit);
}

export async function startPkRoom(roomId: string, questionIds: string[]) {
  const started = await supabase.rpc("start_pk_room", {
    target_room_id: roomId,
    next_question_ids: questionIds,
  });
  if (!started.error) {
    const row = Array.isArray(started.data) ? started.data[0] : started.data;
    return readRoom(row);
  }
  const missingFunction = started.error.code === "42883" || started.error.code === "PGRST202";
  if (!missingFunction) {
    throw Object.assign(new Error(started.error.message), { code: started.error.code });
  }
  const fallback = await supabase
    .from("pk_rooms")
    .update({
      status: "playing",
      question_ids: questionIds,
      started_at: new Date().toISOString(),
    })
    .eq("id", roomId)
    .eq("status", "waiting")
    .select("*")
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return readRoom(fallback.data);
}
