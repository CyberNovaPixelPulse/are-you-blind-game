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

test('publication expiry preserves valid activity, fences late work, repairs images and serializes with commit', async () => {
  const dir=await mkdtemp(join(tmpdir(),'quiz-cancel-pg-'));
  const socket=createServer(); await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=(socket.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
  const pg=new EmbeddedPostgres({databaseDir:dir,port,user:'postgres',password:'local-fixture',persistent:false,onLog:()=>{},onError:()=>{}});
  await pg.initialise();await pg.start();
  const a=pg.getPgClient(), b=pg.getPgClient();await a.connect();await b.connect();
  const stored=new Map<string,Uint8Array>();
  const removals:string[]=[];
  const failingPaths=new Set<string>();
  const failOriginal=false;
  let reviewDeadline: number | undefined;
  let slowRead=false;
  let lostUpload=false;
  const call=(client:typeof a)=>(async(name:string,args:Record<string,unknown>)=>{
    const r=await client.query(`select public.${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')}) as value`,Object.values(args));return r.rows[0].value;
  });
  const service=(client:typeof a)=>createPublicationService({owner,call:call(client),images:{put:async(bucket,path,bytes,_type,overwrite=false)=>{if(stored.has(`${bucket}/${path}`)&&!overwrite)throw Error('already exists');stored.set(`${bucket}/${path}`,bytes);if(lostUpload)throw Error("lost upload response");},get:async(bucket,path)=>{if(slowRead)await new Promise(resolve=>setTimeout(resolve,300));if(lostUpload)throw Error("read unavailable");const value=stored.get(`${bucket}/${path}`);if(!value)throw Error('missing');return value;},publicUrl:path=>`https://fixture.invalid/storage/v1/object/public/quiz-images/${path}`},verify:proof=>({userId:owner,questionId:String(proof),answer:'選項1',distractors:snapshot.options.slice(1).map(({text,taunt})=>({text,taunt})),imageSha256:digest,qualityScore:70,scoreBreakdown:{},expiresAt:reviewDeadline??(proof==='expired'?Date.now()-1:Date.now()+60000)})});
  const api=service(a);
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
    for(const migration of ['20261026110107_question_publication_lifecycle.sql','20261026132427_publication_cancellation_cleanup.sql','20261026140058_publication_review_expiry.sql'])await a.query(await readFile(`supabase/migrations/${migration}`,'utf8'));
    await a.query('grant select,insert,update on questions,question_answer_keys to service_role;set role service_role');await b.query('set role service_role');
    const activity=async(n:number)=>(await a.query('select last_active_at from question_publications where id=$1',[id(n)])).rows[0].last_active_at.getTime();
    const age=async(n:number,hours:number)=>a.query("update question_publications set last_active_at=clock_timestamp()-$2::double precision*interval '1 hour' where id=$1",[id(n),hours]);
    await api.begin(id(1),snapshot);await age(1,23);
    const before=await activity(1);
    assert.equal((await api.query(id(1))).state,'pending');
    await api.begin(id(1),snapshot);
    assert.equal(await activity(1),before); // queries and begin do not renew retention
    lostUpload=true;await assert.rejects(api.upload(id(1),'crop',image,'image/webp'));lostUpload=false;
    assert.equal(await activity(1),before); // intent and failed upload are not valid activity
    await api.upload(id(1),'crop',image,'image/webp');assert((await activity(1))>before);
    await age(1,23);const beforeReview=await activity(1);
    await assert.rejects(api.reviewed(id(1),snapshot,'expired'));assert.equal(await activity(1),beforeReview);
    await api.reviewed(id(1),snapshot,id(1));assert((await activity(1))>beforeReview);
    await age(1,24);
    assert.equal((await api.query(id(1))).state,'expired');
    assert.equal((await a.query('select snapshot from question_publications where id=$1',[id(1)])).rows[0].snapshot,null);
    assert.equal((await api.begin(id(1),{...snapshot,authorName:'different'})).state,'expired');
    await assert.rejects(api.upload(id(1),'original',image,'image/webp'));
    assert.equal((await api.commit(id(1),snapshot,id(1))).state,'expired');
    await upload(2);
    const crop=`quiz-images/${owner}/${id(2)}/crop.webp`;
    stored.set(crop,Buffer.from('corrupted'));
    await assert.rejects(api.commit(id(2),snapshot,id(2)),error=>(error as {state?:string}).state==='needs-upload');
    await api.upload(id(2),'crop',image,'image/webp');assert.deepEqual(stored.get(crop),image);
    stored.delete(`quiz-originals/${owner}/${id(2)}/original.webp`);
    await assert.rejects(api.commit(id(2),snapshot,id(2)),error=>(error as {role?:string}).role==='original');
    await api.upload(id(2),'original',image,'image/webp');
    assert.equal((await api.commit(id(2),snapshot,id(2))).state,'published');
    await assert.rejects(api.begin(id(2),{...snapshot,authorName:'different'}));
    // An accepted operation holds the publication lock while a scheduler observes an older deadline.
    await upload(3);await age(3,25);
    await a.query('begin');await a.query('update question_publications set last_active_at=clock_timestamp() where id=$1',[id(3)]);
    assert.equal(await call(b)('publication_expire_due',{p_limit:250}),0);
    assert.equal((await api.commit(id(3),snapshot,id(3))).state,'published');await a.query('commit');
    await upload(4);await age(4,25);
    assert.equal(await call(b)('publication_expire_due',{p_limit:250}),1);
    assert.equal((await api.commit(id(4),snapshot,id(4))).state,'expired');
    assert.equal((await call(b)('publication_commit',{p_owner:owner,p_id:id(4),p_snapshot:snapshot,p_question:{quality_score:70}})).state,'expired');
    assert.equal((await a.query('select count(*)::int as n from questions where id=$1',[id(4)])).rows[0].n,0);
    assert.deepEqual(await cleaner.run(),{removed:3,failed:0}); // id1 partial + id4 two images
    assert.equal((await api.query(id(4))).cleanupPending,false);
    assert.equal(stored.has(`quiz-images/${owner}/${id(2)}/crop.webp`),true); // published images protected
    // New identifier starts a separate reviewed publication after expiry.
    await upload(5);await api.reviewed(id(5),snapshot,id(5));assert.equal((await api.commit(id(5),snapshot,id(5))).state,'published');
    await upload(6);reviewDeadline=Date.now()+250;slowRead=true;
    assert.equal((await api.commit(id(6),snapshot,id(6))).state,'needs-review');
    reviewDeadline=undefined;slowRead=false;
    assert.equal((await a.query('select count(*)::int as n from questions where id=$1',[id(6)])).rows[0].n,0);
    await b.query('reset role;set role anon');await assert.rejects(call(b)('publication_expire_due',{p_limit:250}));
  } finally {await a.query('rollback').catch(()=>{});await a.end();await b.end();await pg.stop();}
});
