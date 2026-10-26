import { createHmac, timingSafeEqual } from "node:crypto";

export type AttestedDistractor = { text: string; taunt: string };
export type ModerationAttestation = {
  userId: string;
  questionId: string;
  answer: string;
  distractors: AttestedDistractor[];
  imageSha256: string;
  qualityScore: number;
  scoreBreakdown: Record<string, unknown>;
  expiresAt: number;
};

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

function signature(payload: string) {
  const key = secret();
  if (!key) throw new Error("Missing signing key");
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issueModerationAttestation(
  input: Omit<ModerationAttestation, "expiresAt">,
) {
  const payload = Buffer.from(JSON.stringify({
    ...input,
    expiresAt: Date.now() + 5 * 60_000,
  } satisfies ModerationAttestation)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyModerationAttestation(value: unknown): ModerationAttestation | null {
  if (typeof value !== "string" || value.length > 12_000) return null;
  const [payload, provided, extra] = value.split(".");
  if (!payload || !provided || extra) return null;

  let expected: string;
  try {
    expected = signature(payload);
  } catch {
    return null;
  }
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ModerationAttestation;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.questionId !== "string" ||
      typeof parsed.answer !== "string" ||
      !Array.isArray(parsed.distractors) || parsed.distractors.length !== 3 ||
      typeof parsed.imageSha256 !== "string" || !/^[a-f0-9]{64}$/.test(parsed.imageSha256) ||
      typeof parsed.qualityScore !== "number" || parsed.qualityScore < 60 || parsed.qualityScore > 100 ||
      !parsed.scoreBreakdown || typeof parsed.scoreBreakdown !== "object" ||
      typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}
