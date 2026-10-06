export type QuizOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  tauntText: string;
};

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some((item) => item === value);
}

export function readStoredOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) return [];
  const parsed: QuizOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      id?: unknown;
      text?: unknown;
      is_correct?: unknown;
      taunt?: unknown;
    };
    if (
      (typeof row.id !== "number" && typeof row.id !== "string") ||
      typeof row.text !== "string"
    ) {
      continue;
    }
    parsed.push({
      id: String(row.id),
      text: row.text,
      isCorrect: row.is_correct === true,
      tauntText: typeof row.taunt === "string" ? row.taunt : "",
    });
  }
  return parsed;
}
