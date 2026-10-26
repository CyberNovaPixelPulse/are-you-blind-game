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
  mode?: 'random' | 'assigned';
  refillBelow?: number;
  draw(count: number, avoidId: string | undefined, reservedIds: string[], language: string): Promise<DrawBatch<T>>;
  seen: SeenStore;
}) {
  let language = config.language;
  let generation = 0;
  let upcoming: T[] = [];
  let current: T | undefined;
  let assignedLoaded = false;
  const consumed = new Set<string>();
  const hints = new Map<string, boolean>();
  let presentedDuringRefill = new Set<string>();

  let filling: Promise<'ok' | 'error' | 'idle' | 'empty'> | undefined;

  async function fill(count: number) {
    const requestedGeneration = generation;
    const presented = new Set<string>();
    presentedDuringRefill = presented;
    const drawn = await config.draw(count, current?.id, upcoming.map(q => q.id), language);
    if (generation !== requestedGeneration) return 'idle' as const;
    if (drawn.error) return 'error' as const;
    if (config.mode !== 'assigned' && drawn.resetSeen) {
      const seen = new Set(config.seen.read());
      config.seen.write([...new Set([...drawn.keepIds.filter(id => seen.has(id)), ...presented])]);
    }
    if (config.mode === 'assigned') assignedLoaded = true;
    const reserved = new Set([...upcoming.map(q => q.id), ...(config.mode === 'assigned' ? consumed : [])]);
    const candidates = drawn.questions.filter(q => {
      if (reserved.has(q.id)) return false;
      reserved.add(q.id);
      return true;
    });
    const alternatives = candidates.filter(q => q.id !== current?.id);
    const fresh = config.mode === 'assigned' ? candidates : alternatives.length ? alternatives : candidates;
    for (const question of fresh) hints.set(question.id, drawn.thinLanguage === true);
    upcoming.push(...fresh);
    return upcoming.length ? 'ok' as const : 'empty' as const;
  }

  function refill(count = 5) {
    if (config.mode === 'assigned' && assignedLoaded) return Promise.resolve(upcoming.length ? 'ok' as const : 'empty' as const);
    if (upcoming.length >= (config.refillBelow ?? 2)) return Promise.resolve('ok' as const);
    if (filling) return filling;
    const requestedGeneration = generation;
    const task = fill(count).catch(() => generation === requestedGeneration ? 'error' as const : 'idle' as const);
    filling = task;
    void task.finally(() => { if (filling === task) filling = undefined; });
    return task;
  }

  function setLanguage(nextLanguage: string) {
    generation += 1;
    language = nextLanguage;
    upcoming = [];
    filling = undefined;
    assignedLoaded = false;
    hints.clear();
  }

  return {
    refill,
    peekUpcoming() { return upcoming[0]; },
    setLanguage,
    reset(nextLanguage: string) {
      setLanguage(nextLanguage);
      current = undefined;
      consumed.clear();
    },
    async next() {
      const requestedGeneration = generation;
      const outcome = upcoming.length ? 'ok' : await refill();
      if (requestedGeneration !== generation) return { question: undefined, outcome: 'idle' as const, thinLanguage: false };
      const question = upcoming.shift();
      const thinLanguage = question ? hints.get(question.id) === true : false;
      if (question) hints.delete(question.id);
      return { question, outcome, thinLanguage };
    },
    present(question: T) {
      current = question;
      if (config.mode === 'assigned') consumed.add(question.id);
      presentedDuringRefill.add(question.id);
      config.seen.remember(question.id);
    },
  };
}
