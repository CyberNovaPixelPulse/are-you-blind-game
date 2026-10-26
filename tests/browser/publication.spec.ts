import { test,expect } from '@playwright/test';
import sharp from 'sharp';

const userId='10000000-0000-0000-0000-000000000001';
const breakdown={blind_guess:{score:30,max:40,detail:'fixture',guesses:['甲','乙','丙'],level:'normal'},visual_richness:{score:25,max:25,detail:'fixture'},distractor_deception:{score:20,max:20,detail:'fixture'},safety:{score:15,max:15,detail:'fixture',violated:false},ai_guesses:['甲','乙','丙'],suggestion:''};

for(const mode of ['success','lost','unknown']) test(`manual publication ${mode} without deleting images`,async({page})=>{
  let publicationId='';let snapshot:unknown;let published=false;let submissions=0;let deleted=false;let queryOnline=mode!=='unknown';
  const user={id:userId,email:'fixture@example.test',user_metadata:{name:'作者'},aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'};
  const token=['e30',Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await page.addInitScript(({user,token})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})),{user,token});
  await page.route('**/*',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(request.method()==='DELETE')deleted=true;
    if(url.pathname==='/auth/v1/user')await route.fulfill({json:user});
    else if(url.pathname.startsWith('/rest/v1/'))await route.fulfill({json:[]});
    else if(url.pathname==='/api/questions/publication'){
      if(request.method()==='POST'){
        const body=request.postDataJSON();publicationId=body.id;snapshot=body.snapshot;
      }
      if(request.method()==='GET'&&!queryOnline){await route.abort();return;}
      await route.fulfill({json:published?{state:'published',result:{id:publicationId,quality_score:90}}:{state:'pending'}});
    }else if(url.pathname==='/api/moderate-quiz')await route.fulfill({json:{passed:true,quality_score:90,score_breakdown:breakdown,guesses:breakdown.ai_guesses,attestation:'fixture-proof'}});
    else if(url.pathname==='/api/quiz-images')await route.fulfill({json:{objectPath:'fixture/image.webp'}});
    else if(url.pathname==='/api/questions/publish'){
      submissions++;published=true;
      if(mode!=='success')await route.abort();
      else await route.fulfill({json:{state:'published',result:{id:publicationId,quality_score:90}}});
    }else if(url.origin!=='http://127.0.0.1:3103')await route.abort();
    else await route.continue();
  });
  await page.goto('/create');
  const image=await sharp({create:{width:400,height:400,channels:3,background:'#47966b'}}).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:image});
  await page.getByRole('textbox',{name:'作者名稱',exact:true}).fill('作者');
  for(let index=0;index<4;index++){
    await page.getByLabel('選項文字',{exact:true}).nth(index).fill(`選項${index+1}`);
    await page.getByLabel('專屬毒舌評語',{exact:true}).nth(index).fill('再試一次');
  }
  await page.getByRole('button',{name:'發布題目',exact:true}).click();
  if(mode==='unknown'){
    await expect(page.getByRole('status').filter({hasText:'正在確認發布結果'})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'作者名稱',exact:true})).toBeDisabled();
    queryOnline=true;await page.getByRole('button',{name:'再次確認',exact:true}).click();
  }
  await expect(page.getByRole('status').filter({hasText:'題目已發布'})).toBeVisible();
  expect(submissions).toBe(1);expect(deleted).toBe(false);
  expect(publicationId).toMatch(/^[a-f0-9-]{36}$/);
  expect(snapshot).toMatchObject({authorName:'作者',language:'zh-TW'});
});
