
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin="http://127.0.0.1:8787";
const id="aaaaaaaaaaaaaaaaaaaaaaaa";
const letter={
  id,sender:"하치",recipient:"친구",title:"편지가 도착했어요",
  body:"오늘 하루도 좋은 하루 보내!\n고마워.",
  font:"pretendard",paper:"classic",allowReply:true,
  background:null,stickers:[{id:"decor-1",url:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9buKd7sAAAAASUVORK5CYII=",x:0.12,y:0.12,w:0.16,z:1}],replies:[]
};
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try {
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.route("**/api/**",async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      let response,code=200;
      if(path==="/api/letters/"+id+"/status"){
        response={id,sender:letter.sender,recipient:letter.recipient,available:true,locked:false,allowReply:true,availableAt:null};
      } else if(path==="/api/letters/"+id && req.method()==="GET"){
        response={...letter,replies:[]};
      } else if(path==="/api/letters/"+id+"/replies" && req.method()==="POST"){
        const input=JSON.parse(req.postData());
        response={reply:{id:"bbbbbbbbbbbbbbbbbbbbbbbb",body:input.body,x:.5,y:.68,color:input.color,created_at:new Date().toISOString()},editorToken:"a".repeat(64)};
        code=201;
      }else{
        response={error:"Browser test unexpected API route "+path};
        code=404;
      }
      await route.fulfill({status:code,contentType:"application/json",body:JSON.stringify(response)});
    });
    await page.goto(origin+"/l/"+id,{waitUntil:"domcontentloaded"});
    await page.locator("#openEnvelope").waitFor();
    const envelope=page.locator("#openEnvelope");
    assert.equal(await envelope.locator(".env-flap").count(),1,"envelope flap must exist");
    assert.equal(await envelope.locator(".env-letter").count(),1,"folded paper should be in the envelope");
    assert.equal(await envelope.locator(".env-pocket").count(),1,"paper must be behind envelope pocket");
    const layers=await page.evaluate(()=>{
      const z=selector=>parseInt(getComputedStyle(document.querySelector(selector)).zIndex);
      return {paper:z(".env-letter"),pocket:z(".env-pocket"),front:z(".env-front")};
    });
    assert.ok(layers.paper<layers.pocket&&layers.paper<layers.front,"letter must not pass through front face");
    const bounds=await page.evaluate(()=>{
      const envelope=document.querySelector(".envelope").getBoundingClientRect();
      const folded=document.querySelector(".env-letter").getBoundingClientRect();
      return {bottom:folded.bottom,envelopeBottom:envelope.bottom};
    });
    assert.ok(bounds.bottom<=bounds.envelopeBottom-1,"folded sheet must not stick out BELOW the sealed envelope");
    const styles=await page.evaluate(()=>({
      intro:getComputedStyle(document.querySelector(".arrival-caption")).backgroundColor,
      fold:getComputedStyle(document.querySelector(".free-letter-bottom")).transform
    }));
    assert.match(styles.intro,/rgba?\(/);
    // The folded paper itself must be landscape 4:3 inside an opaque envelope.
    const folded=await envelope.locator(".env-letter").boundingBox();
    assert.ok(Math.abs(folded.width/folded.height-4/3)<.03,"folded page must be 4:3");
    await envelope.click();
    await page.locator(".arrival.opening").waitFor();
    await page.waitForTimeout(160);
    const opacity=await envelope.evaluate(el=>getComputedStyle(el).opacity);
    assert.equal(opacity,"1","click must NOT fade the envelope via disabled opacity");
    assert.equal(await envelope.isDisabled(),false,"opening should not disable the button");
    await page.waitForTimeout(3180);
    const foldRect=await page.locator(".free-letter-top").boundingBox();
    assert.ok(Math.abs(foldRect.width/foldRect.height-4/3)<.1,"released folded page should be 4:3 before unfolding");
    await page.waitForTimeout(1390);
    const openRatio=await page.evaluate(()=>{
      const first=document.querySelector(".free-letter-top").getBoundingClientRect();
      const second=document.querySelector(".free-letter-bottom").getBoundingClientRect();
      return first.width/(first.height+second.height);
    });
    assert.ok(Math.abs(openRatio-.75)<.07,"unfolded sheet should be portrait 3:4; got "+openRatio);
    await page.locator(".reading #addReply").waitFor({timeout:14000});
    const animation=await page.locator(".reading").evaluate(el=>getComputedStyle(el).animationName);
    assert.equal(animation,"reading-grow","reading must enlarge, never flip like a card");
    const initialContent=await page.locator(".reading .paper-content").evaluate(el=>parseFloat(getComputedStyle(el).opacity));
    assert.ok(initialContent<.25,"text must be hidden while paper is growing");
    await page.locator(".reading.content-visible").waitFor({timeout:5000});
    await page.waitForTimeout(850);
    const final=await page.evaluate(()=>{
      const letter=document.querySelector(".reading .paper").getBoundingClientRect();
      return {
        ratio:letter.width/letter.height,
        text:parseFloat(getComputedStyle(document.querySelector(".reading .paper-content")).opacity),
        sticker:parseFloat(getComputedStyle(document.querySelector(".reading .decal-layer")).opacity)
      };
    });
    assert.ok(Math.abs(final.ratio-.75)<.07,"expanded reading paper should be 3:4; got "+final.ratio);
    assert.ok(final.text>.95&&final.sticker>.95,"text and stickers should fade in after expanding");
    await page.locator("#addReply").click({timeout:5000});
    await page.locator("#replyBody").waitFor();
    await page.locator("#replyBody").fill("이건 댓글이 아닌 포스트잇 답장이야!");
    await page.locator("#sendReply").click();
    await page.locator('.postit[data-reply="bbbbbbbbbbbbbbbbbbbbbbbb"]').waitFor();
    assert.equal(await page.locator("#replyModal").count(),0);
    assert.equal(errors.length,0,"Page errors: "+errors.join(" | "));
    console.log("PASS: "+viewport.width+"px opaque envelope, 4:3 fold, 3:4 unfold, zoom, ink/sticker fade and post-it reply");

    // Secret management link: unchanged letter content, existing sticker can be
    // repositioned/removed and new stickers added through the same editor.
    const managerToken="a".repeat(64),assetId="c".repeat(24);
    const managerSticker={id:"existing-sticker-123",asset_id:assetId,x:.3,y:.25,w:.22,z:1,
      url:"/api/manage/"+id+"/media/"+assetId};
    let savedMetadata="",seenOwnerAuth=false;
    await page.route("**/api/manage/**",async route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      if(req.headers()["authorization"]!=="Bearer "+managerToken){
        await route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:"Forbidden"})});
        return;
      }
      seenOwnerAuth=true;
      if(path==="/api/manage/"+id&&req.method()==="GET"){
        await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({...letter,stickers:[managerSticker],background:null})});
      }else if(path==="/api/manage/"+id+"/media/"+assetId){
        const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9buKd7sAAAAASUVORK5CYII=","base64");
        await route.fulfill({status:200,contentType:"image/png",body:png});
      }else if(path==="/api/manage/"+id+"/stickers"&&req.method()==="PUT"){
        savedMetadata=req.postData()||"";
        await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,count:1,added:0,removed:0})});
      }else{
        await route.fulfill({status:404,body:"Not Found"});
      }
    });
    await page.goto(origin+"/manage/"+id+"/"+managerToken,{waitUntil:"domcontentloaded"});
    await page.locator("#saveDecoration").waitFor();
    assert.equal(await page.locator("#letterPaper .letter-body").innerText(),letter.body);
    assert.equal(await page.locator('#letterPaper .decal').count(),1);
    assert.equal(await page.locator('textarea').count(),0,"manager cannot edit letter body");
    assert.equal(await page.locator('input[type="text"]').count(),0,"manager cannot edit title or sender");
    await page.locator("#saveDecoration").click();
    await page.locator("#saveDecoration").waitFor();
    assert.ok(seenOwnerAuth,"management API must use owner authorization");
    assert.match(savedMetadata,/existing-sticker-123/,"sticker arrangement should be sent");
    assert.equal(errors.length,0,"Manager errors: "+errors.join(" | "));
    console.log("PASS: "+viewport.width+"px read-only letter and authorized sticker management");

    await page.close();
  }
}finally{
 await browser.close();
}
