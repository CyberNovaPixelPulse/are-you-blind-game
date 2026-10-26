import assert from 'node:assert/strict';
import test from 'node:test';

test('cleanup worker rejects anonymous requests and consumes its durable queue without a browser session', async t => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  process.env.CRON_SECRET = 'fixture-cron-secret';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-anon';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://cleanup-fixture.invalid';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    assert(String(input).endsWith('/rest/v1/rpc/publication_cleanup_claim'));
    calls++;return Response.json({scanned:0,resources:[]});
  });
  const { GET } = await import('../src/app/api/cron/publication-cleanup/route');
  assert.equal((await GET(new Request('http://game/api/cron/publication-cleanup'))).status,401);
  assert.equal(calls,0);
  const response=await GET(new Request('http://game/api/cron/publication-cleanup',{headers:{Authorization:'Bearer fixture-cron-secret'}}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{removed:0,failed:0});
  assert.equal(calls,1);
});
