import { publicationForRequest, publicationError } from '@/lib/publication-runtime';
import { readJsonLimited } from '@/lib/api-protection';
import type { PublicationSnapshot } from '@/lib/publication-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const context=await publicationForRequest(request);
  if(context.error) return context.error;
  try { return Response.json(await context.service.query(new URL(request.url).searchParams.get('id') ?? ''),{headers:{'Cache-Control':'no-store'}}); }
  catch(error){return publicationError(error);}
}
export async function POST(request: Request) {
  const context=await publicationForRequest(request);
  if(context.error) return context.error;
  const body=await readJsonLimited<{id:string;snapshot:PublicationSnapshot}>(request,16000);
  if(!body || typeof body.id!=='string') return Response.json({message:'發布資料不完整'},{status:400});
  try {return Response.json(await context.service.begin(body.id,body.snapshot));}
  catch(error){return publicationError(error);}
}
