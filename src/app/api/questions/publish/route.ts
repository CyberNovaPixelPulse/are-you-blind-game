import { publicationForRequest, publicationError } from '@/lib/publication-runtime';
import { readJsonLimited } from '@/lib/api-protection';
import type { PublicationSnapshot } from '@/lib/publication-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const context=await publicationForRequest(request);
  if(context.error) return context.error;
  const body=await readJsonLimited<{questionId:string;snapshot:PublicationSnapshot;attestation:string}>(request,24000);
  if(!body || typeof body.questionId!=='string') return Response.json({message:'發布資料不完整'},{status:400});
  try {return Response.json(await context.service.commit(body.questionId,body.snapshot,body.attestation),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return publicationError(error);}
}
