import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { createPublicationService } from '../src/lib/publication-service';
import { createPublicationFlow } from '../src/lib/publication-flow';

const owner = '10000000-0000-0000-0000-000000000001';
const id = '20000000-0000-0000-0000-000000000001';

test('independent publishers use PostgreSQL to commit exactly one question and reject changed content after reconnect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quiz-publication-pg-'));
  const socket=createServer(); await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=(socket.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
  const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'postgres', password: 'local-fixture', persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start();
  const a = pg.getPgClient(); const b = pg.getPgClient();
  await a.connect(); await b.connect();
  try {
    await a.query(`create role anon; create role authenticated; create role service_role bypassrls;
      create table questions(id uuid primary key, crop_image_path text, original_image_path text, author_id uuid, author_name text, difficulty text, status text, language text, quality_score integer, score_breakdown jsonb, options jsonb);`);
    await a.query(await readFile('supabase/migrations/20261026110107_question_publication_lifecycle.sql', 'utf8'));
    await a.query(await readFile('supabase/migrations/20261026132427_publication_cancellation_cleanup.sql', 'utf8'));
    await a.query(await readFile('supabase/migrations/20261026140058_publication_review_expiry.sql','utf8'));
    await a.query('grant select,insert on questions to service_role; set role service_role');
    await b.query('set role service_role');
    const image = Buffer.from('immutable image');
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(image).digest('hex');
    const snapshot = { authorName: '作者', language: 'zh-TW', cropArea: {x:0,y:0,width:1,height:1},
      crop: { sha256: digest, contentType: 'image/webp', bytes: image.length }, original: { sha256: digest, contentType: 'image/webp', bytes: image.length },
      options: [1,2,3,4].map(n => ({ text: `選項${n}`, is_correct: n===1, taunt: '再試一次' })) };
    const stored = new Map<string, Buffer>();
    const service = (client: typeof a) => createPublicationService({
      owner,
      call: async (name, args) => {
        const values = Object.values(args); const keys = Object.keys(args);
        const r = await client.query(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`, values);
        return r.rows[0].value;
      },
      images: { put: async (bucket, path, bytes) => { stored.set(`${bucket}/${path}`, Buffer.from(bytes)); },
        get: async (bucket,path) => { const bytes=stored.get(`${bucket}/${path}`); if (!bytes) throw new Error('missing'); return bytes; },
        publicUrl: path => `https://fixture.invalid/${path}` },
      verify: proof => ({ userId: owner, questionId: String(proof), answer: '選項1', distractors: snapshot.options.slice(1).map(({text,taunt})=>({text,taunt})), imageSha256:digest, qualityScore:70, scoreBreakdown:{}, expiresAt:Date.now()+60000 }),
    });
    const flows = [service(a),service(b)].map(api => createPublicationFlow({ id, snapshot, gateway: {
      begin: api.begin, query: api.query, cancel: api.cancel, approveReview: api.reviewed, review: async id => id,
      upload: async role => api.upload(id,role,image,'image/webp'),
      commit: async (id,snapshot,proof) => api.commit(id,snapshot,proof),
    }}));
    const results = await Promise.all(flows.map(flow=>flow.run()));
    assert.deepEqual(results.map(r=>r.state),['published','published']);
    await a.end();
    const reopened = pg.getPgClient(); await reopened.connect(); await reopened.query('set role service_role');
    try {
      const restored = service(reopened);
      assert.equal((await restored.query(id)).state,'published');
      assert.equal((await restored.begin(id,snapshot)).result?.id,id);
      await assert.rejects(restored.begin(id,{...snapshot,authorName:'不同作者'}));
      const second='20000000-0000-0000-0000-000000000002';
      // Simulate storage accepting bytes while its success reply is lost.
      const recovering=createPublicationService({owner,call:async(name,args)=>{
        const result=await reopened.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`,Object.values(args));return result.rows[0].value;
      },images:{put:async(bucket,path,bytes)=>{stored.set(`${bucket}/${path}`,Buffer.from(bytes));throw new Error('lost storage response');},get:async(bucket,path)=>stored.get(`${bucket}/${path}`)!,publicUrl:path=>`https://fixture.invalid/${path}`},
      verify:proof=>({userId:owner,questionId:String(proof),answer:'選項1',distractors:snapshot.options.slice(1).map(({text,taunt})=>({text,taunt})),imageSha256:digest,qualityScore:70,scoreBreakdown:{},expiresAt:Date.now()+60000})});
      const recovered=createPublicationFlow({id:second,snapshot,gateway:{begin:recovering.begin,query:recovering.query,cancel:recovering.cancel,approveReview:recovering.reviewed,review:async id=>id,
        upload:async role=>recovering.upload(second,role,image,'image/webp'),commit:(id,snapshot,proof)=>recovering.commit(id,snapshot,proof)}});
      assert.equal((await recovered.run()).state,'published');
      await assert.rejects(restored.upload(second,'crop',Buffer.from('different bytes'),'image/webp'));
      const third='20000000-0000-0000-0000-000000000003';
      await b.query(`reset role; create function fail_result_save() returns trigger language plpgsql as $$ begin
        if new.state='published' and new.id='${third}' then raise exception 'fixture result save failed'; end if; return new; end $$;
        create trigger fail_result_save before update on public.question_publications for each row execute function fail_result_save(); set role service_role;`);
      const rollbackApi=service(reopened);
      const rollbackFlow=createPublicationFlow({id:third,snapshot,gateway:{begin:rollbackApi.begin,query:rollbackApi.query,cancel:rollbackApi.cancel,approveReview:rollbackApi.reviewed,review:async id=>id,
        upload:async role=>rollbackApi.upload(third,role,image,'image/webp'),commit:(id,snapshot,proof)=>rollbackApi.commit(id,snapshot,proof)}});
      assert.equal((await rollbackFlow.run()).state,'pending');
      await b.query('reset role; drop trigger fail_result_save on public.question_publications; set role service_role');
      assert.equal((await rollbackFlow.run()).state,'published');
      // Neither public role may read manifests or invoke the service-only operations.
      await reopened.query('reset role; set role anon');
      await assert.rejects(restored.query(id));
      await assert.rejects(reopened.query('select snapshot from public.question_publications'));
      await reopened.query('reset role; set role service_role');
    } finally { await reopened.end(); }
  } finally { await b.end(); await a.end().catch(()=>{}); await pg.stop(); }
});
