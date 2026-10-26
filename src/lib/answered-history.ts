type Entry = { failures: number; unsynced: boolean; controller: AbortController; timer?: ReturnType<typeof setTimeout> };
export function createAnsweredHistory({ write }: {
  write: (userId: string, questionId: string, signal: AbortSignal) => Promise<void>;
}) {
  let player: string | null | undefined;
  let generation = 0;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  function clear() {
    generation++;
    for (const entry of entries.values()) { clearTimeout(entry.timer); entry.controller.abort(); }
    entries.clear();
    notify();
  }
  async function persist(userId: string, questionId: string, entry: Entry) {
    if (player !== userId || entries.get(questionId) !== entry) return;
    try {
      await write(userId, questionId, entry.controller.signal);
    } catch {
      if (player !== userId || entries.get(questionId) !== entry) return;
      entry.failures++;
      if (entry.failures < 3) entry.timer = setTimeout(() => void persist(userId, questionId, entry), entry.failures * 1000);
      else { entry.unsynced = true; notify(); }
    }
  }
  function record(questionId: string) {
    if (entries.has(questionId)) return;
    const entry: Entry = { failures: 0, unsynced: false, controller: new AbortController() };
    entries.set(questionId, entry);
    if (player) void persist(player, questionId, entry);
  }
  return {
    setPlayer(userId: string | null) { if (player !== userId) { player = userId; clear(); } },
    record,
    capture() {
      const epoch = generation;
      return (questionId: string) => { if (generation === epoch) record(questionId); };
    },
    isAnswered: (questionId: string) => entries.has(questionId),
    getUnsyncedCount: () => [...entries.values()].filter(entry => entry.unsynced).length,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { player = undefined; clear(); },
  };
}
