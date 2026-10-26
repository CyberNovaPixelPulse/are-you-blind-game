import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { createPublicationService } from '../src/lib/publication-service';
import { createPublicationCleanup } from '../src/lib/publication-cleanup';

const owner = '10000000-0000-0000-0000-000000000001';
const image = Buffer.from('cancel fixture');
const digest = createHash('sha256').update(image).digest('hex');
const snapshot = { authorName: '作者', language: 'zh-TW', cropArea: {x:0,y:0,width:1,height:1}, crop: {sha256:digest,contentType:'image/webp',bytes:image.length}, original: {sha256:digest,contentType:'image/webp',bytes:image.length}, options: [1,2,3,4].map(n=>({text:`選項${n}`,is_correct:n===1,taunt:'再試一次'})) };

test('durable cancellation serializes commit, retries failed cleanup, and protects current and future references', async () => {
  const dir=await mkdtemp(join(tmpdir(),'quiz-cancel-pg-'));
  const socket=createServer(); await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=(socket.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
  const pg=new EmbeddedPostgres({databaseDir:dir,port,user:'postgres',password:'local-fixture',persistent:false,onLog:()=>{},onError:()=>{}});
  await pg.initialise();await pg.start();
  const a=pg.getPgClient(), b=pg.getPgClient();await a.connect();await b.connect();
  const stored=new Map<string,Uint8Array>();
  const removals:string[]=[];
  const failingPaths=new Set<string>();
  let failOriginal=true;
  let lostUpload=false;
  const call=(client:typeof a)=>(async(name:string,args:Record<string,unknown>)=>{
    const r=await client.query(`select public.${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')}) as value`,Object.values(args));return r.rows[0].value;
  });
  const service=(client:typeof a)=>createPublicationService({owner,call:call(client),images:{put:async(bucket,path,bytes)=>{stored.set(`${bucket}/${path}`,bytes);if(lostUpload)throw Error("lost upload response");},get:async(bucket,path)=>{if(lostUpload)throw Error("read unavailable");const value=stored.get(`${bucket}/${path}`);if(!value)throw Error('missing');return value;},publicUrl:path=>`https://fixture.invalid/storage/v1/object/public/quiz-images/${path}`},verify:proof=>({userId:owner,questionId:String(proof),answer:'選項1',distractors:snapshot.options.slice(1).map(({text,taunt})=>({text,taunt})),imageSha256:digest,qualityScore:70,scoreBreakdown:{},expiresAt:Date.now()+60000})});
  const api=service(a), other=service(b);
  const cleaner=createPublicationCleanup({call:call(a),remove:async(bucket,path)=>{
    removals.push(`${bucket}/${path}`);
    if(failingPaths.has(path))throw Error('permanent fixture storage failure');
    if(bucket==='quiz-originals'&&failOriginal)throw Error('storage unavailable');
    stored.delete(`${bucket}/${path}`);
  }});
  const id=(n:number)=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const upload=async(n:number)=>{await api.begin(id(n),snapshot);await api.upload(id(n),'crop',image,'image/webp');await api.upload(id(n),'original',image,'image/webp');};
  try {
    await a.query(`create role anon;create role authenticated;create role service_role bypassrls;
      create table questions(id uuid primary key,crop_image_path text,original_image_path text,author_id uuid,author_name text,difficulty text,status text,language text,quality_score integer,score_breakdown jsonb,options jsonb);
      create table question_answer_keys(question_id uuid primary key,original_image_path text);`);
    await a.query(await readFile('supabase/migrations/20261026110107_question_publication_lifecycle.sql','utf8'));
    await a.query(await readFile('supabase/migrations/20261026132427_publication_cancellation_cleanup.sql','utf8'));
    await a.query('grant select,insert,update on questions,question_answer_keys to service_role;set role service_role');await b.query('set role service_role');
    await upload(1);
    // Commit wins the held database row lock; cancellation waits then returns published.
    await a.query('begin');await a.query('select 1 from question_publications where id=$1 for update',[id(1)]);
    const lateCancel=other.cancel(id(1),snapshot);
    assert.equal((await api.commit(id(1),snapshot,id(1))).state,'published');
    await a.query('commit');
    assert.equal((await lateCancel).state,'published');
    assert.deepEqual(await cleaner.run(),{removed:0,failed:0});
    assert.equal(stored.size,2);
    // Cancellation wins; independent late commit cannot insert a question.
    await upload(2);
    await a.query('begin');await a.query('select 1 from question_publications where id=$1 for update',[id(2)]);
    assert.equal((await api.cancel(id(2),snapshot)).state,'cancelled');
    const lateCommit=other.commit(id(2),snapshot,id(2));
    await a.query('commit');
    assert.equal((await lateCommit).state,'cancelled');
    const directLate=await call(b)('publication_commit',{p_owner:owner,p_id:id(2),p_snapshot:snapshot,p_question:{quality_score:70,options:snapshot.options}});
    assert.equal(directLate.state,'cancelled');
    assert.equal((await a.query('select count(*)::int as n from questions where id=$1',[id(2)])).rows[0].n,0);
    assert.deepEqual(await cleaner.run(),{removed:1,failed:1});
    assert.equal((await api.query(id(2))).cleanupPending,true);
    failOriginal=false;
    await a.query("update question_publication_images set cleanup_due_at=now() where publication_id=$1 and cleanup_pending",[id(2)]);
    assert.deepEqual(await cleaner.run(),{removed:1,failed:0});
    assert.equal((await api.query(id(2))).cleanupPending,false);
    assert(removals.some(path=>path.startsWith('quiz-images/')));assert(removals.some(path=>path.startsWith('quiz-originals/')));
    // A late storage write remains discoverable even after a successful cleanup response.
    const latePath=`${owner}/${id(2)}/crop.webp`;stored.set(`quiz-images/${latePath}`,image);
    await a.query('update question_publication_images set cleanup_due_at=now() where publication_id=$1',[id(2)]);
    assert.deepEqual(await cleaner.run(),{removed:2,failed:0});
    assert.equal(stored.has(`quiz-images/${latePath}`),false);
    // A private answer-key reference must protect an original even if public columns are empty.
    await upload(3);
    const privatePath=`${owner}/${id(3)}/original.webp`;
    await a.query('insert into question_answer_keys values($1,$2)',[id(50),privatePath]);
    await api.cancel(id(3),snapshot);
    assert.deepEqual(await cleaner.run(),{removed:1,failed:0});
    assert.equal(stored.has(`quiz-originals/${privatePath}`),true);
    await a.query('update question_answer_keys set original_image_path=original_image_path where question_id=$1',[id(50)]);
    await assert.rejects(a.query('insert into questions(id,crop_image_path) values($1,$2)',[id(51),`https://fixture.invalid/storage/v1/object/public/quiz-images/${owner}/${id(3)}/crop.webp`]));
    // Cancellation before begin is permanent; it also survives a new service instance.
    await api.cancel(id(4),snapshot);
    assert.equal((await other.begin(id(4),snapshot)).state,'cancelled');
    await assert.rejects(other.upload(id(4),'crop',image,'image/webp'));
    // Partial upload accepted by storage, but both its reply and read-back are unavailable.
    await api.begin(id(5),snapshot);lostUpload=true;
    await assert.rejects(api.upload(id(5),'crop',image,'image/webp'));lostUpload=false;
    await api.cancel(id(5),snapshot);
    assert.deepEqual(await cleaner.run(),{removed:1,failed:0});
    assert.equal(stored.has(`quiz-images/${owner}/${id(5)}/crop.webp`),false);
    await upload(6);await api.cancel(id(6),snapshot);
    const claims=await Promise.all([call(a)('publication_cleanup_claim',{p_limit:50}),call(b)('publication_cleanup_claim',{p_limit:50})]);
    const paths=claims.flatMap(claim=>claim.resources).map(resource=>resource.bucket+'/'+resource.path);
    assert.equal(paths.length,2);assert.equal(new Set(paths).size,2);
    // A full protected batch must not falsely signal an exhausted deletion queue.
    for(let n=100;n<155;n++){
      await api.begin(id(n),snapshot);await api.upload(id(n),'crop',image,'image/webp');
      await a.query('insert into questions(id,crop_image_path) values($1,$2)',[id(n+1000),`https://fixture.invalid/storage/v1/object/public/quiz-images/${owner}/${id(n)}/crop.webp`]);
      await api.cancel(id(n),snapshot);
    }
    await api.begin(id(200),snapshot);await api.upload(id(200),'crop',image,'image/webp');await api.cancel(id(200),snapshot);
    assert.deepEqual(await cleaner.run(),{removed:1,failed:0});
    assert.equal(stored.has(`quiz-images/${owner}/${id(200)}/crop.webp`),false);
    // Persistent failures may use the full budget, but must not starve a new healthy item.
    const failingIds:string[]=[];
    for(let n=300;n<551;n++){
      failingIds.push(id(n));failingPaths.add(`${owner}/${id(n)}/crop.webp`);
      await api.begin(id(n),snapshot);await api.upload(id(n),'crop',image,'image/webp');await api.cancel(id(n),snapshot);
    }
    assert.deepEqual(await cleaner.run(),{removed:0,failed:250});
    // Model the next invocation after all retry deadlines have passed.
    await a.query('update question_publication_images set cleanup_due_at=now() where publication_id=any($1::uuid[])',[failingIds]);
    await api.begin(id(600),snapshot);await api.upload(id(600),'crop',image,'image/webp');await api.cancel(id(600),snapshot);
    await cleaner.run();
    assert.equal(stored.has(`quiz-images/${owner}/${id(600)}/crop.webp`),false);
    await b.query('reset role;set role anon');await assert.rejects(other.cancel(id(1),snapshot));
  } finally {await a.query('rollback').catch(()=>{});await a.end();await b.end();await pg.stop();}
});
