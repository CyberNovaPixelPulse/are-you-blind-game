type Resource = { publicationId: string; bucket: string; path: string };

/** Server-owned durable manifest; storage deletion is idempotent and never decided by the browser. */
export function createPublicationCleanup(config: {
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  remove(bucket: string, path: string, signal: AbortSignal): Promise<void>;
}) {
  return {
    async run() {
      const started = Date.now();
      let removed = 0;
      let failed = 0;
      // Bound each invocation; unprocessed resources remain eligible in PostgreSQL.
      for (let batch = 0; batch < 5; batch++) {
        if (Date.now() - started >= 45000) break;
        const { resources, scanned } = await config.call('publication_cleanup_claim', { p_limit: 50 }) as {resources: Resource[]; scanned: number};
        if (scanned === 0) break;
        for (const resource of resources) {
          if (Date.now() - started >= 45000) return { removed, failed };
          let success = false;
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              config.remove(resource.bucket, resource.path, controller.signal),
              new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Storage deadline exceeded')); }, 5000); }),
            ]);
            success = true;
          } catch { /* The durable manifest stays pending after storage failure. */ }
          finally { clearTimeout(timer); }
          await config.call('publication_cleanup_complete', {
            p_id: resource.publicationId, p_bucket: resource.bucket, p_path: resource.path, p_success: success,
          });
          if (success) removed++; else failed++;
        }
      }
      return { removed, failed };
    },
  };
}
