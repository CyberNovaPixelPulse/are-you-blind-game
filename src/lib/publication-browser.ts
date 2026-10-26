import { createPublicationFlow, PublicationFailure, type PublicationSnapshot, type PublicationStatus, type PublicationPhase } from './publication-flow';

export function createBrowserPublication(config: {
  id:string; snapshot:PublicationSnapshot; crop:File; original:File;
  getToken():Promise<string>;
  review(id:string,snapshot:PublicationSnapshot):Promise<string>;
  onPhase(phase:PublicationPhase):void;
}) {
  async function request(url:string, body?:unknown):Promise<PublicationStatus> {
    const token=await config.getToken();
    const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
    const payload=await response.json();
    if (!response.ok) {
      if(payload.state==='rejected'||payload.state==='needs-review') throw new PublicationFailure(payload.message,payload.state);
      throw new Error('發布結果尚未確認');
    }
    if(!['pending','published','unknown','needs-review','rejected'].includes(payload.state)
      || (payload.state==='published' && (payload.result?.id!==config.id || typeof payload.result.quality_score!=='number'))) throw new Error('發布結果格式無效');
    return payload;
  }
  return createPublicationFlow({id:config.id,snapshot:config.snapshot,onPhase:config.onPhase,gateway:{
    begin:(id,snapshot)=>request('/api/questions/publication',{id,snapshot}),
    query:id=>request(`/api/questions/publication?id=${encodeURIComponent(id)}`),
    review:config.review,
    upload:async (role,id)=>{
      const body=new FormData();body.set('questionId',id);body.set('role',role);body.set('file',config[role]);
      const token=await config.getToken();
      const response=await fetch('/api/quiz-images',{method:'POST',headers:{Authorization:`Bearer ${token}`},body,signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok || typeof result.objectPath!=='string') throw new Error('圖片上傳結果尚未確認');
      return result.objectPath;
    },
    commit:(questionId,snapshot,attestation)=>request('/api/questions/publish',{questionId,snapshot,attestation}),
  }});
}

export async function publicationImage(file: File) {
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return {sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),contentType:file.type,bytes:file.size};
}
