import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicationCleanup } from '../src/lib/publication-cleanup';

test('a hanging storage deletion times out and does not block the next resource', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let claims=0;
  const deleted:string[]=[];
  const cleaner=createPublicationCleanup({
    call:async name=>name==='publication_cleanup_claim'?(++claims===1?{scanned:2,resources:[{publicationId:'a',bucket:'quiz-images',path:'stuck'},{publicationId:'b',bucket:'quiz-originals',path:'next'}]}:{scanned:0,resources:[]}):null,
    remove:async(_,path)=>{if(path==='stuck')await new Promise(()=>{});deleted.push(path);},
  });
  const run=cleaner.run();
  for(let i=0;i<8;i++)await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.deepEqual(await run,{removed:1,failed:1});
  assert.deepEqual(deleted,['next']);
});
