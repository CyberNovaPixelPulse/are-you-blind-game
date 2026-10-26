import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const userId='10000000-0000-0000-0000-000000000001';
const breakdown={blind_guess:{score:30,max:40,detail:'fixture',guesses:['甲','乙','丙'],level:'normal'},visual_richness:{score:25,max:25,detail:'fixture'},distractor_deception:{score:20,max:20,detail:'fixture'},safety:{score:15,max:15,detail:'fixture',violated:false},ai_guesses:['甲','乙','丙'],suggestion:''};

for (const scenario of ['cancelled','published','unknown','rejected']) test(`publication cancellation resolves ${scenario} without browser deletion`, async ({page})=>{
  let publicationId='';let cancelled=false;let published=false;let cancels=0;let deletes=0;let online=scenario!=='unknown';
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  let entered!:()=>void;const reached=new Promise<void>(resolve=>{entered=resolve;});
  const user={id:userId,email:'fixture@example.test',user_metadata:{name:'作者'},aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'};
  const token=['e30',Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await page.addInitScript(({user,token})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})),{user,token});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='DELETE')deletes++;
    if(url.pathname==='/auth/v1/user')await route.fulfill({json:user});
    else if(url.pathname.startsWith('/rest/v1/'))await route.fulfill({json:[]});
    else if(url.pathname==='/api/questions/publication'){
      if(request.method()==='GET'&&!online){await route.abort();return;}
      if(request.method()==='POST'){
        const body=request.postDataJSON();publicationId=body.id;
        if(body.action==='cancel'){cancels++;cancelled=true;}
      }
      await route.fulfill({json:published?{state:'published',result:{id:publicationId,quality_score:90}}:cancelled?{state:'cancelled',cleanupPending:true}:{state:'pending'}});
    }else if(url.pathname==='/api/moderate-quiz')await route.fulfill({json:{passed:true,quality_score:90,score_breakdown:breakdown,guesses:breakdown.ai_guesses,attestation:'fixture-proof'}});
    else if(url.pathname==='/api/quiz-images'){
      if(scenario!=='published'&&scenario!=='rejected'){entered();await held;}
      await route.fulfill({json:{objectPath:'fixture/image.webp'}});
    }else if(url.pathname==='/api/questions/publish'){
      if(scenario==='rejected'){entered();await route.fulfill({status:409,json:{state:'rejected',message:'固定內容無效'}});return;}
      published=true;entered();await held;
      await route.fulfill({json:{state:'published',result:{id:publicationId,quality_score:90}}});
    }else if(url.origin!=='http://127.0.0.1:3103')await route.abort();else await route.continue();
  });
  await page.goto('/create');
  const image=await sharp({create:{width:400,height:400,channels:3,background:'#47966b'}}).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:image});
  await page.getByRole('textbox',{name:'作者名稱',exact:true}).fill('作者');
  for(let i=0;i<4;i++){
    await page.getByLabel('選項文字',{exact:true}).nth(i).fill(`選項${i+1}`);
    await page.getByLabel('專屬毒舌評語',{exact:true}).nth(i).fill('再試一次');
  }
  await page.getByRole('button',{name:'發布題目',exact:true}).click();await reached;
  if(scenario==='rejected'){
    await expect(page.getByText('固定內容無效',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'重新編輯',exact:true})).toHaveCount(0);
  }
  await page.getByRole('button',{name:'取消這次發布',exact:true}).click();
  if(scenario==='unknown'){
    await expect(page.getByRole('region',{name:'發布狀態'}).getByRole('status').filter({hasText:'正在確認發布結果'})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'作者名稱',exact:true})).toBeDisabled();
    expect(cancels).toBe(0);online=true;
    await page.getByRole('button',{name:'取消這次發布',exact:true}).click();
  }
  if(scenario==='published'){
    await expect(page.getByRole('status').filter({hasText:'題目已發布'})).toBeVisible();expect(cancels).toBe(0);
    release();
  }else{
    await expect(page.getByRole('status').filter({hasText:'已取消，暫存圖片將由系統清理。'})).toBeVisible();
    await page.getByRole('button',{name:'繼續出題',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'作者名稱',exact:true})).toBeEnabled();
    await page.getByRole('textbox',{name:'作者名稱',exact:true}).fill('另一題作者');
    release();
    await expect(page.getByRole('textbox',{name:'作者名稱',exact:true})).toHaveValue('另一題作者');
    expect(cancels).toBe(1);
  }
  expect(deletes).toBe(0);
});
