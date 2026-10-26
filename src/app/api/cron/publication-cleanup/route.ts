import { createClient } from '@supabase/supabase-js';
import { adminDb, hasServiceRole } from '@/lib/supabase-admin';
import { createPublicationCleanup } from '@/lib/publication-cleanup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasServiceRole() || !url || !serviceKey) return Response.json({ error: 'Cleanup service unavailable' }, { status: 503 });
  const db = adminDb();
  const cleanup = createPublicationCleanup({
    call: async (name, args) => {
      const result = await db.rpc(name, args).retry(false).abortSignal(AbortSignal.timeout(5000));
      if (result.error) throw new Error('Cleanup progress unavailable');
      return result.data;
    },
    remove: async (bucket, path, signal) => {
      const storage = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal }) },
      }).storage;
      const { error } = await storage.from(bucket).remove([path]);
      if (error && !(('statusCode' in error && String(error.statusCode) === '404') || ('status' in error && error.status === 404))) throw error;
    },
  });
  try { return Response.json(await cleanup.run(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Cleanup remains queued for retry' }, { status: 503 }); }
}
