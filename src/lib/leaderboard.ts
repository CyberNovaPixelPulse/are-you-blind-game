import { supabase } from "@/lib/supabase";

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_score: number;
  streak_count: number;
};

export type LadderLoad = {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  unavailable: boolean;
};

export type LeaderboardMode = "endless" | "daily";

function missingTable(message: string) {
  const text = message.toLowerCase();
  return text.includes("function") || text.includes("schema cache") || text.includes("could not find");
}

function readRow(value: unknown): LeaderboardEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || typeof row.username !== "string") return null;
  if (typeof row.total_score !== "number" || typeof row.streak_count !== "number") return null;
  return {
    rank: Number(row.rank) || 0,
    user_id: row.user_id,
    username: row.username.trim() || "玩家",
    avatar_url: typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url : null,
    total_score: row.total_score,
    streak_count: row.streak_count,
  };
}

async function loadRanked(
  limit = 50,
  userId?: string | null,
  mode: LeaderboardMode = "endless",
  challengeDate?: string | null,
): Promise<{ players: LeaderboardEntry[]; unavailable: boolean }> {
  const { data, error } = await supabase.rpc("get_challenge_leaderboard", {
    p_mode: mode,
    p_date: mode === "daily" ? challengeDate ?? null : null,
    p_limit: limit,
    p_user_id: userId ?? null,
  });
  if (error) return { players: [], unavailable: missingTable(error.message) };
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return {
    players: rows.map(readRow).filter((row): row is LeaderboardEntry => row !== null),
    unavailable: false,
  };
}

export async function getGlobalLeaderboard(limit = 50, mode: LeaderboardMode = "endless", date?: string | null) {
  const board = await loadRanked(limit, null, mode, date);
  return board.players.filter((entry) => entry.rank <= limit);
}

export async function getMyRank(
  userId: string,
  mode: LeaderboardMode = "endless",
  date?: string | null,
): Promise<LeaderboardEntry | null> {
  const board = await loadRanked(50, userId, mode, date);
  return board.players.find((entry) => entry.user_id === userId) ?? null;
}

export async function loadLadder(
  userId?: string | null,
  limit = 50,
  mode: LeaderboardMode = "endless",
  date?: string | null,
): Promise<LadderLoad> {
  const board = await loadRanked(limit, userId, mode, date);
  return {
    entries: board.players.filter((entry) => entry.rank <= limit),
    me: userId ? board.players.find((entry) => entry.user_id === userId) ?? null : null,
    unavailable: board.unavailable,
  };
}
