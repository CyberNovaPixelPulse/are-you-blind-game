import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicationFlow, type PublicationSnapshot } from '../src/lib/publication-flow';

export const snapshot: PublicationSnapshot = {
  authorName: '作者', language: 'zh-TW', crop: { sha256: 'a'.repeat(64), contentType: 'image/webp', bytes: 10 },
  original: { sha256: 'b'.repeat(64), contentType: 'image/webp', bytes: 20 },
  cropArea: { x: 1, y: 2, width: 3, height: 4 },
  options: [1,2,3,4].map(n => ({ text: `選項${n}`, is_correct: n === 1, taunt: '再試一次' })),
};

test('a lost commit response is confirmed without creating a second publication or deleting images', async () => {
  let published = false;
  const flow = createPublicationFlow({
    id: 'publication-one', snapshot,
    gateway: {
      begin: async () => ({ state: 'pending' }),
      review: async () => 'proof',
      upload: async role => `${role}.webp`,
      commit: async () => { published = true; throw new Error('response lost'); },
      query: async () => published ? { state: 'published', result: { id: 'publication-one', quality_score: 70 } } : { state: 'pending' },
    },
  });
  const result = await flow.run();
  assert.equal(result.state, 'published');
  assert.equal(result.result?.id, 'publication-one');
  assert.equal((await flow.run()).result?.id, 'publication-one');
});

test('unknown results keep the same publication and lookup never performs another review or upload', async () => {
  const flow=createPublicationFlow({id:'same',snapshot,gateway:{
    begin:async()=>{throw new Error('offline');},
    query:async()=>{throw new Error('offline');},
    review:async()=>{throw new Error('must not review');},
    upload:async()=>{throw new Error('must not upload');},
    commit:async()=>{throw new Error('must not commit');},
  }});
  assert.equal((await flow.run()).state,'unknown');
  assert.equal((await flow.confirm()).state,'unknown');
});

test('a failed upload resumes the fixed content even when the caller edits its draft', async () => {
  const draft=structuredClone(snapshot);
  let online=false;
  const seenAuthors:string[]=[];
  const flow=createPublicationFlow({id:'same',snapshot:draft,gateway:{
    begin:async(_id,fixed)=>{seenAuthors.push(fixed.authorName);return {state:'pending'};},
    review:async()=> 'proof',
    query:async()=>({state:'pending'}),
    upload:async role=>{if(!online)throw new Error('lost');return role;},
    commit:async()=>({state:'published',result:{id:'same',quality_score:70}}),
  }});
  assert.equal((await flow.run()).state,'pending');
  draft.authorName='另一份內容'; online=true;
  assert.equal((await flow.run()).state,'published');
  assert.deepEqual(seenAuthors,['作者','作者']);
});
