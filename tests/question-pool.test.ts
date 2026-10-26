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
