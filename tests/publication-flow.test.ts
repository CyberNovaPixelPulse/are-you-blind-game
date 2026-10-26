import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicationFlow, PublicationFailure, type PublicationSnapshot } from '../src/lib/publication-flow';

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
      approveReview:async()=>({state:'pending'}),
      cancel: async () => { throw Error('unexpected cancel'); },
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
    approveReview:async()=>({state:'pending'}),
    cancel: async () => { throw Error('unexpected cancel'); },
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
    approveReview:async()=>({state:'pending'}),
    cancel: async () => { throw Error('unexpected cancel'); },
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

test('cancellation stops further uploads and remains terminal even while an upload is in flight', async () => {
  let release!: () => void;
  let entered!: () => void;
  const uploading = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const uploaded: string[] = [];
  let cancelled = false;
  const flow = createPublicationFlow({ id: 'same', snapshot, gateway: {
      approveReview:async()=>({state:'pending'}),
    begin: async () => ({ state: 'pending' }), review: async () => 'proof',
    upload: async role => { uploaded.push(role); entered(); await held; return role; },
    commit: async () => { throw Error('must not commit after cancellation'); },
    query: async () => ({ state: cancelled ? 'cancelled' : 'pending' }),
    cancel: async () => { cancelled = true; return { state: 'cancelled', cleanupPending: true }; },
  } });
  const running = flow.run(); await uploading;
  assert.equal((await flow.cancel()).state, 'cancelled');
  release();
  assert.equal((await running).state, 'cancelled');
  assert.equal((await flow.run()).state, 'cancelled');
  assert.deepEqual(uploaded, ['crop']);
});

test('cancellation confirms a committed result and never deletes or cancels an already published question', async () => {
  let cancellations = 0;
  const flow = createPublicationFlow({ id: 'same', snapshot, gateway: {
      approveReview:async()=>({state:'pending'}),
    begin: async () => ({ state: 'pending' }), review: async () => 'proof', upload: async role => role,
    commit: async () => ({ state: 'published', result: { id: 'same', quality_score: 70 } }),
    query: async () => ({ state: 'published', result: { id: 'same', quality_score: 70 } }),
    cancel: async () => { cancellations++; return { state: 'cancelled' }; },
  } });
  assert.equal((await flow.cancel()).state, 'published');
  assert.equal((await flow.run()).state, 'published');
  assert.equal(cancellations, 0);
});

test('an offline cancellation remains unconfirmed and performs no destructive operation', async () => {
  let cancellations = 0;
  const flow = createPublicationFlow({ id: 'same', snapshot, gateway: {
      approveReview:async()=>({state:'pending'}),
    begin: async () => ({ state: 'pending' }), review: async () => 'proof', upload: async role => role,
    commit: async () => { throw Error('must not commit'); },
    query: async () => { throw Error('offline'); },
    cancel: async () => { cancellations++; return { state: 'cancelled' }; },
  } });
  assert.equal((await flow.cancel()).state, 'unknown');
  assert.equal((await flow.run()).state, 'unknown');
  assert.equal(cancellations, 0);
});

test('a query started before cancellation cannot replace its terminal verdict with stale pending', async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let queries = 0;
  const flow=createPublicationFlow({id:'same',snapshot,gateway:{
    approveReview:async()=>({state:'pending'}),
    begin:async()=>({state:'pending'}),review:async()=> 'proof',upload:async role=>role,
    commit:async()=>({state:'pending'}),
    query:async()=>{queries++;if(queries===1)await held;return {state:'pending'};},
    cancel:async()=>({state:'cancelled',cleanupPending:true}),
  }});
  const oldQuery=flow.confirm();
  assert.equal((await flow.cancel()).state,'cancelled');
  release();
  assert.equal((await oldQuery).state,'cancelled');
});

test('expired review requires explicit re-review, keeps fixed content and reuses complete images', async () => {
  let reviews=0, commits=0;const uploads:string[]=[];
  const flow=createPublicationFlow({id:'same',snapshot,gateway:{
    approveReview:async()=>({state:'pending'}),
    begin:async()=>({state:'pending'}),query:async()=>({state:'pending'}),cancel:async()=>({state:'cancelled'}),
    review:async()=>{reviews++;return `proof-${reviews}`;},upload:async role=>{uploads.push(role);return role;},
    commit:async()=>{commits++;if(commits===1)throw new PublicationFailure('審核已過期','needs-review');return {state:'published',result:{id:'same',quality_score:70}};},
  }});
  assert.equal((await flow.run()).state,'needs-review');
  assert.equal((await flow.run()).state,'needs-review');
  assert.equal(reviews,1);
  assert.equal((await flow.rereview()).state,'published');
  assert.equal(reviews,2);assert.deepEqual(uploads,['crop','original']);
});

test('a proof-expiry response first confirms already-published success without another review', async () => {
  let published=false,reviews=0;
  const flow=createPublicationFlow({id:'same',snapshot,gateway:{
    begin:async()=>({state:'pending'}),query:async()=>published?{state:'published',result:{id:'same',quality_score:70}}:{state:'pending'},
    cancel:async()=>({state:'cancelled'}),approveReview:async()=>({state:'pending'}),
    review:async()=>{reviews++;return 'proof';},upload:async role=>role,
    commit:async()=>{published=true;throw new PublicationFailure('proof expired','needs-review');},
  }});
  assert.equal((await flow.run()).state,'published');assert.equal((await flow.rereview()).state,'published');assert.equal(reviews,1);
});

test('lost review-registration response retries the same proof instead of buying another review', async () => {
  let reviews=0,registrations=0;
  const flow=createPublicationFlow({id:'same',snapshot,gateway:{
    begin:async()=>({state:'pending'}),query:async()=>({state:'pending'}),cancel:async()=>({state:'cancelled'}),
    approveReview:async()=>{registrations++;if(registrations===1)throw Error('lost');return {state:'pending'};},
    review:async()=>{reviews++;return 'proof';},upload:async role=>role,
    commit:async()=>({state:'published',result:{id:'same',quality_score:70}}),
  }});
  assert.equal((await flow.run()).state,'pending');assert.equal((await flow.run()).state,'published');assert.equal(reviews,1);
});
