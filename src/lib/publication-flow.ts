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
  state: 'pending' | 'published' | 'unknown' | 'needs-review' | 'rejected' | 'cancelled';
  cleanupPending?: boolean;
  result?: PublicationResult;
  message?: string;
};
export type PublicationPhase = 'moderating' | 'uploading' | 'saving' | 'confirming' | 'cancelling';
export type PublicationGateway = {
  begin(id: string, snapshot: PublicationSnapshot): Promise<PublicationStatus>;
  review(id: string, snapshot: PublicationSnapshot): Promise<string>;
  upload(role: 'crop' | 'original', id: string): Promise<string>;
  commit(id: string, snapshot: PublicationSnapshot, proof: string): Promise<PublicationStatus>;
  query(id: string): Promise<PublicationStatus>;
  cancel(id: string, snapshot: PublicationSnapshot): Promise<PublicationStatus>;
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
  let terminal: PublicationStatus | undefined;
  let flight: Promise<PublicationStatus> | undefined;
  let cancelFlight: Promise<PublicationStatus> | undefined;
  let cancellationRequested = false;
  const remember = (status: PublicationStatus) => {
    if (terminal) return terminal;
    if (status.state === 'published' || status.state === 'cancelled') terminal = status;
    return status;
  };

  async function confirm(): Promise<PublicationStatus> {
    if (terminal) return terminal;
    config.onPhase?.('confirming');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await config.gateway.query(config.id);
        return remember(result);
      } catch { /* A failed lookup does not establish that publishing failed. */ }
    }
    return terminal ?? { state: 'unknown', message: '尚無法確認發布結果，請再次確認' };
  }

  async function execute(): Promise<PublicationStatus> {
    if (terminal) return terminal;
    try {
      const existing = await config.gateway.begin(config.id, snapshot);
      remember(existing);
      if (terminal) return terminal;
      if (cancellationRequested) return cancelFlight ?? confirm();
      if (existing.state !== 'pending') return existing;
      if (!proof) {
        config.onPhase?.('moderating');
        proof = await config.gateway.review(config.id, snapshot);
        if (terminal) return terminal;
        if (cancellationRequested) return cancelFlight ?? confirm();
      }
      config.onPhase?.('uploading');
      crop ??= await config.gateway.upload('crop', config.id);
      if (cancellationRequested) return cancelFlight ?? confirm();
      original ??= await config.gateway.upload('original', config.id);
      if (terminal) return terminal;
      if (cancellationRequested) return cancelFlight ?? confirm();
      config.onPhase?.('saving');
      const result = await config.gateway.commit(config.id, snapshot, proof);
      return remember(result);
    } catch (error) {
      if (terminal) return terminal;
      if (cancellationRequested) return cancelFlight ?? confirm();
      if (error instanceof PublicationFailure) return { state: error.state, message: error.message };
      return confirm();
    }
  }

  return {
    cancel() {
      if (terminal) return Promise.resolve(terminal);
      if (cancelFlight) return cancelFlight;
      cancellationRequested = true;
      const task = (async () => {
        try {
          config.onPhase?.('cancelling');
          const known = await config.gateway.query(config.id);
          remember(known);
          if (terminal) return terminal;
          if (known.state !== 'pending') return known;
          return remember(await config.gateway.cancel(config.id, snapshot));
        } catch { return confirm(); }
      })();
      cancelFlight = task;
      void task.finally(() => { if (cancelFlight === task) cancelFlight = undefined; });
      return task;
    },
    run() {
      if (terminal) return Promise.resolve(terminal);
      if (cancellationRequested) return cancelFlight ?? confirm();
      if (flight) return flight;
      const task = execute();
      flight = task;
      void task.finally(() => { if (flight === task) flight = undefined; });
      return task;
    },
    confirm,
  };
}
