export type PublicationImage = { sha256: string; contentType: string; bytes: number };
export type PublicationSnapshot = {
  authorName: string;
  language: string;
  crop: PublicationImage;
  original: PublicationImage;
  cropArea: { x: number; y: number; width: number; height: number };
  options: { text: string; is_correct: boolean; taunt: string }[];
};
export type PublicationResult = { id: string; quality_score: number };
export type PublicationStatus = {
  state: 'pending' | 'published' | 'unknown' | 'needs-review' | 'rejected';
  result?: PublicationResult;
  message?: string;
};
export type PublicationPhase = 'moderating' | 'uploading' | 'saving' | 'confirming';
export type PublicationGateway = {
  begin(id: string, snapshot: PublicationSnapshot): Promise<PublicationStatus>;
  review(id: string, snapshot: PublicationSnapshot): Promise<string>;
  upload(role: 'crop' | 'original', id: string): Promise<string>;
  commit(id: string, snapshot: PublicationSnapshot, proof: string): Promise<PublicationStatus>;
  query(id: string): Promise<PublicationStatus>;
};
export class PublicationFailure extends Error {
  constructor(message: string, readonly state: 'needs-review' | 'rejected') { super(message); }
}

/** One immutable publication, including all retries. No client-side deletion. */
export function createPublicationFlow(config: {
  id: string; snapshot: PublicationSnapshot; gateway: PublicationGateway;
  onPhase?: (phase: PublicationPhase) => void;
}) {
  const snapshot = structuredClone(config.snapshot);
  let proof: string | undefined;
  let crop: string | undefined;
  let original: string | undefined;
  let published: PublicationStatus | undefined;
  let flight: Promise<PublicationStatus> | undefined;

  async function confirm(): Promise<PublicationStatus> {
    if (published) return published;
    config.onPhase?.('confirming');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await config.gateway.query(config.id);
        if (result.state === 'published') published = result;
        return result;
      } catch { /* A failed lookup does not establish that publishing failed. */ }
    }
    return { state: 'unknown', message: '尚無法確認發布結果，請再次確認' };
  }

  async function execute(): Promise<PublicationStatus> {
    if (published) return published;
    try {
      const existing = await config.gateway.begin(config.id, snapshot);
      if (existing.state === 'published') { published = existing; return existing; }
      if (existing.state !== 'pending') return existing;
      if (!proof) {
        config.onPhase?.('moderating');
        proof = await config.gateway.review(config.id, snapshot);
      }
      config.onPhase?.('uploading');
      crop ??= await config.gateway.upload('crop', config.id);
      original ??= await config.gateway.upload('original', config.id);
      config.onPhase?.('saving');
      const result = await config.gateway.commit(config.id, snapshot, proof);
      if (result.state === 'published') published = result;
      return result;
    } catch (error) {
      if (error instanceof PublicationFailure) return { state: error.state, message: error.message };
      return confirm();
    }
  }

  return {
    run() {
      if (flight) return flight;
      const task = execute();
      flight = task;
      void task.finally(() => { if (flight === task) flight = undefined; });
      return task;
    },
    confirm,
  };
}
