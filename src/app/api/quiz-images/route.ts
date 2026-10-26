import { publicationForRequest, publicationError } from '@/lib/publication-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const context=await publicationForRequest(request);
  if(context.error) return context.error;
  const length=Number(request.headers.get('content-length')??0);
  if(length>320*1024) return Response.json({message:'圖片太大'},{status:413});
  try {
    const form=await request.formData();
    const id=form.get('questionId');const role=form.get('role');const file=form.get('file');
    if(typeof id!=='string'||(role!=='crop'&&role!=='original')||!(file instanceof File)) return Response.json({message:'圖片上傳資料不完整'},{status:400});
    const path=await context.service.upload(id,role,new Uint8Array(await file.arrayBuffer()),file.type);
    return Response.json({objectPath:path});
  } catch(error){return publicationError(error);}
}
