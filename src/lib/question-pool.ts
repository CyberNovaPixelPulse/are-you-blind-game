import type { BatchDrawResult, DrawnQuestion } from './question-draw';

type Question = Pick<DrawnQuestion, 'id'>;
type DrawBatch<T> = Omit<BatchDrawResult, 'questions'> & { questions: T[] };
type SeenStore = {
  read(): string[];
  write(ids: string[]): void;
  remember(id: string): void;
};

/** Owns upcoming questions; the caller confirms when one is actually presented. */
export function createQuestionPool<T extends Question>(config: {
  language: string;
  draw(count: number, avoidId: string | undefined, reservedIds: string[], language: string): Promise<DrawBatch<T>>;
  seen: SeenStore;
}) {
  let language = config.language;
  let generation = 0;
  let upcoming: T[] = [];
  let current: T | undefined;
  let thinLanguage = false;
  let presentedDuringRefill = new Set<string>();

  let filling: Promise<'ok' | 'error' | 'idle'> | undefined;

  async function fill() {
    const requestedGeneration = generation;
    const presented = new Set<string>();
    presentedDuringRefill = presented;
    const drawn = await config.draw(5, current?.id, upcoming.map(q => q.id), language);
    if (generation !== requestedGeneration) return 'idle' as const;
    thinLanguage = drawn.thinLanguage === true;
    if (drawn.error) return 'error' as const;
    if (drawn.resetSeen) {
      const seen = new Set(config.seen.read());
      config.seen.write([...new Set([...drawn.keepIds.filter(id => seen.has(id)), ...presented])]);
    }
    const reserved = new Set(upcoming.map(q => q.id));
    const candidates = drawn.questions.filter(q => {
      if (reserved.has(q.id)) return false;
      reserved.add(q.id);
      return true;
    });
    const alternatives = candidates.filter(q => q.id !== current?.id);
    upcoming.push(...(alternatives.length ? alternatives : candidates));
    return 'ok' as const;
  }

  function refill() {
    if (upcoming.length >= 2) return Promise.resolve('ok' as const);
    if (filling) return filling;
    const requestedGeneration = generation;
    const task = fill().catch(() => generation === requestedGeneration ? 'error' as const : 'idle' as const);
    filling = task;
    void task.finally(() => { if (filling === task) filling = undefined; });
    return task;
  }

  return {
    refill,
    peekUpcoming() { return upcoming[0]; },
    setLanguage(nextLanguage: string) {
      generation += 1;
      language = nextLanguage;
      upcoming = [];
      filling = undefined;
      thinLanguage = false;
    },
    async next() {
      const requestedGeneration = generation;
      const outcome = upcoming.length ? 'ok' : await refill();
      if (requestedGeneration !== generation) return { question: undefined, outcome: 'idle' as const, thinLanguage };
      return { question: upcoming.shift(), outcome, thinLanguage };
    },
    present(question: T) {
      current = question;
      presentedDuringRefill.add(question.id);
      config.seen.remember(question.id);
    },
  };
}
