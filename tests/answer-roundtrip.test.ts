import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerRoundtrip } from '../src/lib/answer-roundtrip';

const question = { id: 'q1', optionIds: ['a', 'b'] };
const reply = (optionId = 'a') => ({ questionId: 'q1', optionId, correctOptionId: 'a', isCorrect: optionId === 'a' });

test('one presentation adopts a verified verdict once despite repeated clicks', async () => {
  let calls = 0;
  let release!: (value: Response) => void;
  const flow = createAnswerRoundtrip({ request: async () => { calls++; return new Promise<Response>(r => { release = r; }); } });
  flow.present(question);
  const pending = flow.submit('a');
  assert.equal((await flow.submit('b')).kind, 'ignored');
  release(Response.json(reply()));
  const result = await pending;
  assert.equal(result.kind, 'verdict');
  assert.equal((await flow.submit('a')).kind, 'ignored');
  assert.equal(calls, 1);
});

test('timeout covers response body, locks retries and preserves first submission time', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let time = 100;
  const flow = createAnswerRoundtrip({ now: () => time, request: async () => {
    calls++;
    if (calls === 1) return { json: () => new Promise(() => {}) } as Response;
    return Response.json(reply());
  } });
  flow.present(question);
  const pending = flow.submit('a');
  t.mock.timers.tick(10000);
  assert.equal((await pending).kind, 'retryable');
  assert.equal((await flow.submit('b')).kind, 'ignored');
  time = 500;
  const retried = await flow.submit('a');
  assert.equal(retried.kind, 'verdict');
  if (retried.kind === 'verdict') assert.equal(retried.submittedAt, 100);
});

test('unavailable questions stop retries while malformed verdicts remain retryable', async () => {
  for (const data of [{ ...reply(), questionId: 'other' }, { ...reply(), correctOptionId: 'outside' }, { ...reply(), isCorrect: false }, { isCorrect: true }]) {
    const flow = createAnswerRoundtrip({ request: async () => Response.json(data) });
    flow.present(question);
    assert.equal((await flow.submit('a')).kind, 'retryable');
  }
  const flow = createAnswerRoundtrip({ request: async () => Response.json({ code: 'question_unavailable', error: '題目無法判定' }, { status: 404 }) });
  flow.present(question);
  assert.equal((await flow.submit('a')).kind, 'unavailable');
  assert.equal((await flow.submit('a')).kind, 'ignored');
});

test('old responses cannot adopt or unlock a newer presentation, even for the same question', async () => {
  const releases: ((r: Response) => void)[] = [];
  const flow = createAnswerRoundtrip({ request: async () => new Promise<Response>(r => releases.push(r)) });
  flow.present(question);
  const old = flow.submit('a');
  flow.present(question);
  const fresh = flow.submit('b');
  releases[0](Response.json(reply()));
  assert.equal((await old).kind, 'ignored');
  assert.equal((await flow.submit('a')).kind, 'ignored');
  releases[1](Response.json(reply('b')));
  const result = await fresh;
  assert.equal(result.kind, 'verdict');
  if (result.kind === 'verdict') {
    assert.equal(result.verdict.isCorrect, false);
    assert.equal(result.verdict.originalImageUrl, '');
  }
  flow.present(question);
  const leaving = flow.submit('a');
  flow.invalidate();
  releases[2](Response.json(reply()));
  assert.equal((await leaving).kind, 'ignored');
});

test('real answer endpoint feeds verified verdicts through the shared interface', async t => {
  const previous = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'http://answer-fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service' });
  t.after(() => { process.env = previous; });
  const id = '00000000-0000-0000-0000-000000000001';
  let key: object | null = { correct_option_id: 'a', correct_answer: 'duplicate', original_image_path: 'private.png' };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('consume_api_rate_limit')) return Response.json(true);
    if (url.includes('/rest/v1/questions?')) return Response.json({ options: [{ id: 'a', text: 'duplicate' }, { id: 'b', text: 'duplicate' }] });
    if (url.includes('/rest/v1/question_answer_keys?')) return Response.json(key);
    if (url.includes('/storage/')) return Response.json({ message: 'missing image' }, { status: 400 });
    throw Error('Unexpected external request');
  });
  const { POST } = await import('../src/app/api/questions/answer/route');
  const flow = createAnswerRoundtrip({ request: (questionId, optionId) => POST(new Request('http://game/api/questions/answer', { method: 'POST', body: JSON.stringify({ questionId, optionId }) })) });
  flow.present({ id, optionIds: ['a', 'b'] });
  const wrong = await flow.submit('b');
  assert.equal(wrong.kind, 'verdict');
  if (wrong.kind === 'verdict') {
    assert.equal(wrong.verdict.correctOptionId, 'a');
    assert.equal(wrong.verdict.isCorrect, false);
    assert.equal(wrong.verdict.originalImageUrl, '');
  }
  key = null;
  flow.present({ id, optionIds: ['a', 'b'] });
  assert.equal((await flow.submit('a')).kind, 'unavailable');
});
