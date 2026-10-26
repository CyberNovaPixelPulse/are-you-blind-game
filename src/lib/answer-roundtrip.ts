export type AnswerQuestion = { id: string; optionIds: readonly string[] };
export type AnswerVerdict = {
  questionId: string; optionId: string; correctOptionId: string; isCorrect: boolean;
  answerText: string; tauntText: string; originalImageUrl: string;
};
export type AnswerOutcome =
  | { kind: 'verdict'; verdict: AnswerVerdict; submittedAt: number }
  | { kind: 'retryable' | 'unavailable'; message: string }
  | { kind: 'ignored' };
type Dependencies = {
  request: (questionId: string, optionId: string, signal: AbortSignal) => Promise<Response>;
  now?: () => number;
};

/** One instance per player mode; each presentation gets a separate adoption boundary. */
export function createAnswerRoundtrip({ request, now = Date.now }: Dependencies) {
  let current: { question: AnswerQuestion; optionId?: string; submittedAt?: number; pending: boolean; adopted: boolean; unavailable: boolean } | undefined;
  return {
    present(question: AnswerQuestion) {
      current = { question: { id: question.id, optionIds: [...question.optionIds] }, pending: false, adopted: false, unavailable: false };
    },
    invalidate() { current = undefined; },
    async submit(optionId: string): Promise<AnswerOutcome> {
      const attempt = current;
      if (!attempt || attempt.pending || attempt.adopted || attempt.unavailable || !attempt.question.optionIds.includes(optionId)) return { kind: 'ignored' };
      if (attempt.optionId && attempt.optionId !== optionId) return { kind: 'ignored' };
      attempt.optionId = optionId;
      attempt.submittedAt ??= now();
      attempt.pending = true;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const { response, data } = await Promise.race([
          (async () => {
            const response = await request(attempt.question.id, optionId, controller.signal);
            return { response, data: await response.json().catch(() => null) };
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10000);
          }),
        ]);
        if (current !== attempt) return { kind: 'ignored' };
        if (!response.ok && data?.code === 'question_unavailable') {
          attempt.unavailable = true;
          return { kind: 'unavailable', message: typeof data.error === 'string' ? data.error : '此題暫時無法判定' };
        }
        if (!response.ok || !data || data.questionId !== attempt.question.id || data.optionId !== optionId ||
            !attempt.question.optionIds.includes(data.correctOptionId) || typeof data.isCorrect !== 'boolean' ||
            data.isCorrect !== (optionId === data.correctOptionId)) {
          return { kind: 'retryable', message: '判定答案失敗，請重試。' };
        }
        attempt.adopted = true;
        const text = (value: unknown) => typeof value === 'string' ? value : '';
        return { kind: 'verdict', submittedAt: attempt.submittedAt, verdict: {
          questionId: data.questionId, optionId, correctOptionId: data.correctOptionId, isCorrect: data.isCorrect,
          answerText: text(data.answerText), tauntText: text(data.tauntText), originalImageUrl: text(data.originalImageUrl),
        } };
      } catch {
        return current !== attempt ? { kind: 'ignored' } : { kind: 'retryable', message: '判定答案時發生連線錯誤，請重試。' };
      } finally { clearTimeout(timer); attempt.pending = false; }
    },
  };
}

export const requestAnswer = (questionId: string, optionId: string, signal: AbortSignal) => fetch('/api/questions/answer', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ questionId, optionId }), signal,
});
