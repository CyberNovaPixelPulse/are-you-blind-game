import { createHash } from 'node:crypto';
import { isLanguageCode } from './languages';
import { isQuestionId } from './seen-questions';
import { PublicationFailure, type PublicationSnapshot, type PublicationStatus } from './publication-flow';
import type { ModerationAttestation } from './moderation-attestation';

type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export function readPublicationSnapshot(value: unknown): PublicationSnapshot {
  const fail = () => { throw new PublicationFailure('發布內容不完整或格式錯誤', 'rejected'); };
  if (!value || typeof value !== 'object') return fail();
  const s = value as PublicationSnapshot;
  if (typeof s.authorName !== 'string' || !s.authorName.trim() || [...s.authorName].length > 40 || !isLanguageCode(s.language)) return fail();
  for (const role of ['crop','original'] as const) {
    const image = s[role];
    if (!image || typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256) || !['image/webp','image/png','image/jpeg'].includes(image.contentType)
      || !Number.isInteger(image.bytes) || image.bytes <= 0 || image.bytes > (role === 'crop' ? 150 : 300) * 1024) return fail();
  }
  const area = s.cropArea;
  if (!area || ![area.x,area.y,area.width,area.height].every(Number.isFinite) || area.x < 0 || area.y < 0 || area.width <= 0 || area.height <= 0) return fail();
  if (!Array.isArray(s.options) || s.options.length !== 4 || s.options.filter(o => o?.is_correct === true).length !== 1) return fail();
  for (const o of s.options) {
    if (!o || typeof o.text !== 'string' || !o.text.trim() || [...o.text].length > 120 || typeof o.taunt !== 'string'
      || !o.taunt.trim() || [...o.taunt].length > 280 || typeof o.is_correct !== 'boolean') return fail();
  }
  return { authorName: s.authorName, language: s.language, crop: { ...s.crop }, original: { ...s.original },
    cropArea: { ...area }, options: s.options.map(o=>({text:o.text,is_correct:o.is_correct,taunt:o.taunt})) };
}

export function createPublicationService(config: {
  owner: string; call: Call;
  images: {
    put(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
    get(bucket: string, path: string): Promise<Uint8Array>;
    publicUrl(path: string): string;
  };
  verify(proof: unknown): ModerationAttestation | null;
}) {
  const args = (id: string) => {
    if (!isQuestionId(id)) throw new PublicationFailure('發布識別無效', 'rejected');
    return { p_owner: config.owner, p_id: id };
  };
  const query = async (id: string) => await config.call('publication_query', args(id)) as PublicationStatus;
  const begin = async (id: string, value: PublicationSnapshot) => await config.call('publication_begin', { ...args(id), p_snapshot: readPublicationSnapshot(value) }) as PublicationStatus;

  return {
    begin, query,
    async upload(id: string, role: 'crop' | 'original', bytes: Uint8Array, contentType: string) {
      if (!['crop','original'].includes(role) || bytes.length > (role === 'crop' ? 150 : 300)*1024) throw new PublicationFailure('圖片資料無效','rejected');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      // Record intent before storage: a lost storage response is still discoverable.
      const resource = await config.call('publication_upload_intent', { ...args(id), p_role: role, p_sha256: sha256,
        p_content_type: contentType, p_bytes: bytes.length }) as { bucket: string; path: string };
      try { await config.images.put(resource.bucket,resource.path,bytes,contentType); }
      catch {
        // Deterministic, non-overwriting upload: accept an existing object only if identical.
        const existing = await config.images.get(resource.bucket,resource.path);
        if (createHash('sha256').update(existing).digest('hex') !== sha256) throw new PublicationFailure('已上傳圖片與固定內容不同','rejected');
      }
      await config.call('publication_upload_complete',{...args(id),p_role:role});
      return resource.path;
    },
    async commit(id: string, value: PublicationSnapshot, proof: unknown): Promise<PublicationStatus> {
      const snapshot = readPublicationSnapshot(value);
      const previous = await begin(id,snapshot);
      if (previous.state === 'published') return previous;
      const review = config.verify(proof);
      if (!review || review.expiresAt < Date.now()) throw new PublicationFailure('審核證明無效或已過期，請重新審核','needs-review');
      const correct = snapshot.options.find(o=>o.is_correct)!;
      const distractors = snapshot.options.filter(o=>!o.is_correct).map(({text,taunt})=>({text,taunt}));
      if (review.userId !== config.owner || review.questionId !== id || review.imageSha256 !== snapshot.crop.sha256
        || review.answer !== correct.text || JSON.stringify(review.distractors) !== JSON.stringify(distractors)) {
        throw new PublicationFailure('審核與固定內容不同','rejected');
      }
      const paths = {} as Record<'crop'|'original', string>;
      for (const role of ['crop','original'] as const) {
        const image = snapshot[role];
        const resource = await config.call('publication_upload_intent', { ...args(id), p_role: role, p_sha256:image.sha256,
          p_content_type:image.contentType,p_bytes:image.bytes }) as {bucket:string;path:string};
        const bytes = await config.images.get(resource.bucket,resource.path);
        if (bytes.length !== image.bytes || createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new PublicationFailure('圖片與固定內容不同','rejected');
        paths[role]=resource.path;
        await config.call('publication_upload_complete',{...args(id),p_role:role});
      }
      return await config.call('publication_commit',{...args(id),p_snapshot:snapshot,p_question:{
        crop_image_path:config.images.publicUrl(paths.crop),original_image_path:paths.original,
        quality_score:review.qualityScore,score_breakdown:review.scoreBreakdown,
        options:snapshot.options.map((o,i)=>({...o,id:i+1})),
      }}) as PublicationStatus;
    },
  };
}
