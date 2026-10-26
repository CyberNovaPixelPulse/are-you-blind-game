import { createClient } from '@supabase/supabase-js';
import { adminDb, hasServiceRole } from './supabase-admin';
import { createPublicationService } from './publication-service';
import { verifyModerationAttestation } from './moderation-attestation';
import { PublicationFailure } from './publication-flow';

export async function publicationForRequest(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!token || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { error: Response.json({message:'請先登入'},{status:401}) };
  if (!hasServiceRole()) return { error: Response.json({message:'發布服務尚未設定'},{status:503}) };
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await auth.auth.getUser(token);
  if (error || !data.user) return {error:Response.json({message:'登入狀態已失效'},{status:401})};
  const db=adminDb();
  const service = createPublicationService({
    owner:data.user.id,
    call:async (name,args) => {
      const result=await db.rpc(name,args);
      if (result.error) {
        if (['22023','42501'].includes(result.error.code)) throw new PublicationFailure('發布識別、內容或圖片與原先紀錄不符','rejected');
        throw new Error('發布狀態暫時無法確認');
      }
      return result.data;
    },
    verify:verifyModerationAttestation,
    images:{
      put:async (bucket,path,bytes,contentType) => {
        const {error}=await db.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});
        if(error) throw new Error('圖片上傳結果尚未確認');
      },
      get:async (bucket,path) => {
        const {data,error}=await db.storage.from(bucket).download(path);
        if(error || !data) throw new Error('找不到完整圖片');
        return new Uint8Array(await data.arrayBuffer());
      },
      publicUrl:path=>db.storage.from('quiz-images').getPublicUrl(path).data.publicUrl,
    },
  });
  return {service};
}

export function publicationError(error: unknown) {
  if(error instanceof PublicationFailure) return Response.json({state:error.state,message:error.message},{status:409});
  return Response.json({state:'unknown',message:'發布結果尚未確認，請再次確認'},{status:503});
}
