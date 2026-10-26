import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnsweredHistory } from '../src/lib/answered-history';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
test('adopted answers stay local and deduplicate while storage retries at most twice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: string[] = [];
  const history = createAnsweredHistory({ write: async (user, question) => { writes.push(`${user}:${question}`); throw Error('offline'); } });
  history.setPlayer('u1');
  history.record('q1');
  history.record('q1');
  assert.equal(history.isAnswered('q1'), true);
  await flush();
  assert.deepEqual(writes, ['u1:q1']);
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(2000); await flush();
  assert.equal(writes.length, 3);
  assert.equal(history.getUnsyncedCount(), 1);
  t.mock.timers.tick(60000); await flush();
  history.record('q1');
  assert.equal(writes.length, 3);
});

test('switching accounts cancels queued retries and isolates late failures', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: string[] = [];
  const rejects: (() => void)[] = [];
  const history = createAnsweredHistory({ write: async (user, question, signal) => {
    writes.push(`${user}:${question}`);
    await new Promise<void>((_, reject) => { rejects.push(() => reject(Error('offline'))); signal.addEventListener('abort', () => reject(Error('aborted'))); });
  } });
  history.setPlayer('u1'); history.record('q1');
  history.setPlayer('u2'); history.record('q1');
  rejects[0](); await flush();
  assert.equal(history.getUnsyncedCount(), 0);
  history.setPlayer(null); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.deepEqual(writes, ['u1:q1', 'u2:q1']);
  assert.equal(history.getUnsyncedCount(), 0);
});

test('successful retry stops, and recording later questions preserves pending writes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: string[] = [];
  const history = createAnsweredHistory({ write: async (_, id) => { writes.push(id); if (writes.length === 1) throw Error('offline'); } });
  history.setPlayer('u1'); history.record('q1'); await flush();
  history.record('q2'); await flush();
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.deepEqual(writes, ['q1', 'q2', 'q1']);
  assert.equal(history.isAnswered('q1'), true);
  assert.equal(history.getUnsyncedCount(), 0);
  history.dispose();
});

test('a recorder captured before grading cannot write that verdict to a later account', () => {
  const writes: string[] = [];
  const history = createAnsweredHistory({ write: async (user, id) => { writes.push(`${user}:${id}`); } });
  history.setPlayer('u1');
  const recordOldVerdict = history.capture();
  history.setPlayer('u2');
  recordOldVerdict('q1');
  assert.deepEqual(writes, []);
  assert.equal(history.isAnswered('q1'), false);
  history.capture()('q2');
  assert.deepEqual(writes, ['u2:q2']);
  history.setPlayer('u1');
  recordOldVerdict('q3');
  assert.deepEqual(writes, ['u2:q2']);
});
