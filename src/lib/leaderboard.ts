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

type RawScore = LeaderboardEntry & { created_at: string };

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

function missingTable(message: string) {
  const text = message.toLowerCase();
  return text.includes("column") || text.includes("schema cache") || text.includes("could not find");
}

function readRow(value: unknown): RawScore | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    user_id?: unknown;
    username?: unknown;
    avatar_url?: unknown;
    total_score?: unknown;
    streak_count?: unknown;
    created_at?: unknown;
  };
  if (typeof row.user_id !== "string" || typeof row.username !== "string") return null;
  if (typeof row.total_score !== "number" || typeof row.streak_count !== "number") return null;
  return {
    rank: 0,
    user_id: row.user_id,
    username: row.username.trim() || "玩家",
    avatar_url: typeof row.avatar_url === "string" && row.avatar_url.trim() ? row.avatar_url : null,
    total_score: row.total_score,
    streak_count: row.streak_count,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

function keepBest(current: RawScore, candidate: RawScore) {
  if (candidate.total_score !== current.total_score) return candidate.total_score > current.total_score;
  if (candidate.streak_count !== current.streak_count) return candidate.streak_count > current.streak_count;
  return candidate.created_at < current.created_at;
}

function rankPlayers(rows: RawScore[]): LeaderboardEntry[] {
  const best = new Map<string, RawScore>();
  for (const row of rows) {
    const current = best.get(row.user_id);
    if (!current || keepBest(current, row)) best.set(row.user_id, row);
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.total_score - a.total_score ||
        b.streak_count - a.streak_count ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((row, index) => ({
      rank: index + 1,
      user_id: row.user_id,
      username: row.username,
      avatar_url: row.avatar_url,
      total_score: row.total_score,
      streak_count: row.streak_count,
    }));
}

async function loadRanked(): Promise<{ players: LeaderboardEntry[]; unavailable: boolean }> {
  const rows: RawScore[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("challenge_leaderboard")
      .select("user_id, username, avatar_url, total_score, streak_count, created_at")
      .order("total_score", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { players: [], unavailable: missingTable(error.message) };
    const parsed = (data ?? []).map(readRow).filter((row): row is RawScore => row !== null);
    rows.push(...parsed);
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return { players: rankPlayers(rows), unavailable: false };
}

export async function getGlobalLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const board = await loadRanked();
  return board.players.slice(0, limit);
}

export async function getMyRank(userId: string): Promise<LeaderboardEntry | null> {
  const board = await loadRanked();
  return board.players.find((entry) => entry.user_id === userId) ?? null;
}

export async function loadLadder(userId?: string | null, limit = 50): Promise<LadderLoad> {
  const board = await loadRanked();
  return {
    entries: board.players.slice(0, limit),
    me: userId ? (board.players.find((entry) => entry.user_id === userId) ?? null) : null,
    unavailable: board.unavailable,
  };
}
