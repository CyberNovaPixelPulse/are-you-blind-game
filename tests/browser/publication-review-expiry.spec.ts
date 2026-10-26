import { test,expect } from '@playwright/test';
import sharp from 'sharp';
const userId='10000000-0000-0000-0000-000000000001';
const breakdown={blind_guess:{score:30,max:40,detail:'fixture',guesses:['甲','乙','丙'],level:'normal'},visual_richness:{score:25,max:25,detail:'fixture'},distractor_deception:{score:20,max:20,detail:'fixture'},safety:{score:15,max:15,detail:'fixture',violated:false},ai_guesses:['甲','乙','丙'],suggestion:''};

for(const scenario of ['review','edit','expired','repair'])test(`publication ${scenario} preserves identity and requires explicit user action`,async({page})=>{
  const states=new Map<string,string>(),snapshots=new Map<string,{authorName:string;language:string}>();
  let reviews=0,uploads=0,commits=0;
  const user={id:userId,email:'fixture@example.test',user_metadata:{name:'作者'},aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'};
  const token=['e30',Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await page.addInitScript(({user,token})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})),{user,token});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/auth/v1/user')await route.fulfill({json:user});
    else if(url.pathname.startsWith('/rest/v1/'))await route.fulfill({json:[]});
    else if(url.pathname==='/api/questions/publication'){
      const body=request.method()==='POST'?request.postDataJSON():null;
      const id=body?.id??url.searchParams.get('id')!;
      if(body){if(!states.has(id))states.set(id,'pending');snapshots.set(id,body.snapshot);if(body.action==='cancel')states.set(id,'cancelled');}
      await route.fulfill({json:{state:states.get(id)??'pending'}});
    }else if(url.pathname==='/api/moderate-quiz'){
      reviews++;await route.fulfill({json:{passed:true,quality_score:90,score_breakdown:breakdown,guesses:breakdown.ai_guesses,attestation:'proof-'+reviews}});
    }else if(url.pathname==='/api/quiz-images'){
      uploads++;await route.fulfill({json:{objectPath:'fixture/image.webp'}});
    }else if(url.pathname==='/api/questions/publish'){
      commits++;const id=request.postDataJSON().questionId;
      if(commits===1){
        if(scenario==='expired'){states.set(id,'expired');await route.fulfill({json:{state:'expired'}});}
        else await route.fulfill({status:409,json:{state:scenario==='repair'?'needs-upload':'needs-review',role:'crop',message:'請重新確認發布內容'}});
      }else{states.set(id,'published');await route.fulfill({json:{state:'published',result:{id,quality_score:90}}});}
    }else if(url.origin!=='http://127.0.0.1:3103')await route.abort();else await route.continue();
  });
  await page.goto('/create');
  const image=await sharp({create:{width:400,height:400,channels:3,background:'#47966b'}}).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:image});
  await page.getByRole('textbox',{name:'作者名稱',exact:true}).fill('作者');
  for(let i=0;i<4;i++){await page.getByLabel('選項文字',{exact:true}).nth(i).fill(`選項${i+1}`);await page.getByLabel('專屬毒舌評語',{exact:true}).nth(i).fill('再試一次');}
  await page.getByRole('button',{name:'發布題目',exact:true}).click();
  if(scenario==='review'){
    await expect(page.getByRole('button',{name:'重新審核並繼續',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'再次確認',exact:true}).click();
    expect(reviews).toBe(1);
    await page.evaluate(()=>{localStorage.setItem('guess-meme-language','en');window.dispatchEvent(new Event('guess-meme-language'));});
    await page.getByRole('button',{name:'重新審核並繼續',exact:true}).click();
  }else if(scenario==='repair'){
    await page.getByRole('button',{name:'重新上傳並繼續',exact:true}).click();
  }else{
    await page.getByRole('button',{name:scenario==='expired'?'以目前內容建立新發布':'修改內容並建立新發布',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'作者名稱',exact:true})).toBeEnabled();
    await page.getByRole('textbox',{name:'作者名稱',exact:true}).fill('作者新版');
    await page.getByRole('button',{name:'發布題目',exact:true}).click();
  }
  await expect(page.getByRole('region',{name:'發布狀態'}).getByRole('status')).toContainText('題目已發布');
  expect(reviews).toBe(scenario==='repair'?1:2);
  expect(uploads).toBe(scenario==='review'?2:scenario==='repair'?3:4);
  expect(snapshots.size).toBe(['edit','expired'].includes(scenario)?2:1);
  expect([...snapshots.values()].every(snapshot=>snapshot.language==='zh-TW')).toBe(true);
  if(scenario==='edit')expect([...states.values()]).toContain('cancelled');
  if(scenario==='expired')expect([...states.values()]).toContain('expired');
});
