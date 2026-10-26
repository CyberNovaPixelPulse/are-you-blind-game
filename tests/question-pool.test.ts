import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuestionPool } from '../src/lib/question-pool';

const question = (id: string) => ({ id });
const batch = (ids: string[], resetSeen = false, keepIds: string[] = []) => ({
  questions: ids.map(question), error: '', resetSeen, keepIds,
});

test('upcoming questions are not seen until presented, including cycle reset', async () => {
  let seen = ['old', 'current'];
  const pool = createQuestionPool({
    language: 'zh-TW',
    draw: async () => batch(['next', 'later'], true, ['current', 'later']),
    seen: { read: () => seen, write: ids => { seen = ids; }, remember: id => { seen.push(id); } },
  });
  await pool.refill();
  assert.deepEqual(seen, ['current']);
  const next = await pool.next();
  assert.equal(next.question?.id, 'next');
  assert.deepEqual(seen, ['current']);
  pool.present(next.question!);
  assert.deepEqual(seen, ['current', 'next']);
});

test('concurrent refills produce distinct upcoming questions and prefer alternatives to current', async () => {
  let finish!: (value: ReturnType<typeof batch>) => void;
  const response = new Promise<ReturnType<typeof batch>>(resolve => { finish = resolve; });
  const pool = createQuestionPool({
    language: 'zh-TW', draw: async () => response,
    seen: { read: () => [], write: () => {}, remember: () => {} },
  });
  pool.present(question('current'));
  const first = pool.refill();
  const second = pool.refill();
  finish(batch(['current', 'next', 'next', 'later']));
  await Promise.all([first, second]);
  assert.equal((await pool.next()).question?.id, 'next');
  assert.equal((await pool.next()).question?.id, 'later');
});

test('real draw policy prioritizes unseen and unattempted questions then cycles without seeing upcoming', async () => {
  const { pickQuestions } = await import('../src/lib/question-draw');
  const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
  const rows = ids.map(id => ({ id, crop_image_path: id, original_image_path: '', author_name: '', options: [
    { id: 'a', text: 'A', is_correct: true, taunt: '' },
    { id: 'b', text: 'B', is_correct: false, taunt: '' },
  ] }));
  let seen = [ids[0]];
  const pool = createQuestionPool({
    language: 'zh-TW',
    draw: async (count, avoid, reserved) => pickQuestions(rows, seen, [ids[2]], avoid, reserved, count),
    seen: { read: () => seen, write: ids => { seen = ids; }, remember: id => { if (!seen.includes(id)) seen.push(id); } },
  });
  const first = await pool.next();
  assert.equal(first.question?.id, ids[1]);
  pool.present(first.question!);
  const second = await pool.next();
  assert.equal(second.question?.id, ids[2]);
  pool.present(second.question!);
  const cycled = await pool.next();
  assert.notEqual(cycled.question?.id, ids[2]);
  assert.ok(cycled.question);
  assert.ok(!seen.includes(cycled.question.id));
});

test('a single playable question can repeat indefinitely', async () => {
  const pool = createQuestionPool({
    language: 'zh-TW', draw: async () => batch(['only'], true),
    seen: { read: () => ['only'], write: () => {}, remember: () => {} },
  });
  for (let i = 0; i < 4; i++) {
    const next = await pool.next();
    assert.equal(next.question?.id, 'only');
    pool.present(next.question!);
  }
});

test('invalidating a language discards upcoming and ignores an older in-flight response', async () => {
  let finish!: (value: ReturnType<typeof batch>) => void;
  const old = new Promise<ReturnType<typeof batch>>(resolve => { finish = resolve; });
  const pool = createQuestionPool({
    language: 'zh-TW', draw: async (_count, _avoid, _reserved, language) => language === 'zh-TW' ? old : batch(['english']),
    seen: { read: () => [], write: () => {}, remember: () => {} },
  });
  const stale = pool.refill();
  pool.setLanguage('en');
  assert.equal((await pool.next()).question?.id, 'english');
  finish(batch(['old']));
  await stale;
  assert.equal((await pool.next()).question?.id, 'english');
});

test('a rejected draw remains a retryable failure instead of escaping the lifecycle', async () => {
  let available = false;
  const pool = createQuestionPool({
    language: 'zh-TW', draw: async () => { if (!available) throw new Error('offline'); return batch(['recovered']); },
    seen: { read: () => [], write: () => {}, remember: () => {} },
  });
  assert.equal((await pool.next()).outcome, 'error');
  available = true;
  assert.equal((await pool.next()).question?.id, 'recovered');
});

test('a cycle reset preserves questions presented while the refill was in flight', async () => {
  let seen: string[] = [];
  let finish!: (value: ReturnType<typeof batch>) => void;
  let initial = true;
  const pool = createQuestionPool({
    language: 'zh-TW',
    draw: async () => {
      if (initial) { initial = false; return batch(['first', 'second']); }
      return new Promise<ReturnType<typeof batch>>(resolve => { finish = resolve; });
    },
    seen: { read: () => seen, write: ids => { seen = ids; }, remember: id => { seen.push(id); } },
  });
  pool.present((await pool.next()).question!);
  const refill = pool.refill();
  pool.present((await pool.next()).question!);
  finish(batch(['third'], true, ['first']));
  await refill;
  assert.deepEqual(seen, ['first', 'second']);
});

test('old response cleanup cannot release a newer refill or leak its language hint', async () => {
  let oldDone!: (value: ReturnType<typeof batch> & { thinLanguage?: boolean }) => void;
  let newDone!: (value: ReturnType<typeof batch> & { thinLanguage?: boolean }) => void;
  let englishAvailable = false;
  const old = new Promise<ReturnType<typeof batch>>(resolve => { oldDone = resolve; });
  const newer = new Promise<ReturnType<typeof batch>>(resolve => { newDone = resolve; });
  const pool = createQuestionPool({
    language: 'zh-TW',
    draw: async (_n, _a, _r, lang) => lang === 'zh-TW' ? old : englishAvailable ? batch(['unexpected']) : newer,
    seen: { read: () => [], write: () => {}, remember: () => {} },
  });
  const stale = pool.refill();
  pool.setLanguage('en');
  const pending = pool.next();
  oldDone({ ...batch(['old']), thinLanguage: true });
  await stale;
  englishAvailable = true;
  const coalesced = pool.refill();
  newDone({ ...batch(['english']), thinLanguage: false });
  await coalesced;
  assert.equal((await pending).question?.id, 'english');
  assert.equal((await pool.next()).thinLanguage, false);
});

test('mixed-language hint follows the presented batch rather than a later background refill', async () => {
  let initial = true;
  const pool = createQuestionPool({
    language: 'en',
    draw: async () => {
      if (initial) { initial = false; return { ...batch(['english1', 'english2']), thinLanguage: false }; }
      return { ...batch(['mixed']), thinLanguage: true };
    },
    seen: { read: () => [], write: () => {}, remember: () => {} },
  });
  const first = await pool.next(); pool.present(first.question!);
  await pool.refill();
  assert.equal((await pool.next()).thinLanguage, false);
  assert.equal((await pool.next()).thinLanguage, true);
});

test('background failure preserves upcoming and seen state, and empty success is explicit exhaustion', async () => {
  let state: 'initial' | 'failure' | 'empty' | 'recover' = 'initial';
  let seen: string[] = [];
  const pool = createQuestionPool({
    language: 'en', draw: async () => {
      if (state === 'initial') return batch(['first', 'second']);
      if (state === 'failure') return { ...batch([], true), error: 'offline' };
      return batch(state === 'empty' ? [] : ['recovered']);
    },
    seen: { read: () => seen, write: ids => { seen = ids; }, remember: id => { seen.push(id); } },
  });
  pool.present((await pool.next()).question!);
  state = 'failure';
  assert.equal(await pool.refill(), 'error');
  assert.equal((await pool.next()).question?.id, 'second');
  assert.deepEqual(seen, ['first']);
  assert.equal((await pool.next()).outcome, 'error');
  state = 'empty';
  assert.equal((await pool.next()).outcome, 'empty');
  state = 'recover';
  assert.equal((await pool.next()).question?.id, 'recovered');
});

test('assigned daily source preserves its order, never cycles, and resets only for a new run', async () => {
  let seen: string[] = [];
  const pool = createQuestionPool({
    language: 'en', mode: 'assigned',
    draw: async () => batch(['current', 'first', 'first', 'last'], true),
    seen: { read: () => seen, write: ids => { seen = ids; }, remember: id => { seen.push(id); } },
  });
  pool.present(question('current'));
  assert.equal((await pool.next()).question?.id, 'first');
  pool.present(question('first'));
  assert.equal((await pool.next()).question?.id, 'last');
  pool.present(question('last'));
  assert.equal((await pool.next()).outcome, 'empty');
  assert.equal((await pool.next()).outcome, 'empty');
  assert.deepEqual(seen, ['current', 'first', 'last']);
  pool.reset('en');
  assert.equal((await pool.next()).question?.id, 'current');
});

test('failed daily acquisition retries the assigned source and language changes keep consumed questions excluded', async () => {
  let online = false;
  const pool = createQuestionPool({
    language: 'en', mode: 'assigned',
    draw: async () => online ? batch(['one', 'two']) : { ...batch([]), error: 'offline' },
    seen: { read: () => [], write: () => {}, remember: () => {} },
  });
  assert.equal((await pool.next()).outcome, 'error');
  online = true;
  pool.present((await pool.next()).question!);
  pool.setLanguage('zh-TW');
  assert.equal((await pool.next()).question?.id, 'two');
  assert.equal((await pool.next()).outcome, 'empty');
});
