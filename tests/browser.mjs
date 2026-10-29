
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin="http://127.0.0.1:8787";
const id="aaaaaaaaaaaaaaaaaaaaaaaa";
const letter={
  id,sender:"하치",recipient:"친구",title:"편지가 도착했어요",
  body:"오늘 하루도 좋은 하루 보내!\n고마워.",
  font:"pretendard",paper:"classic",allowReply:true,
  background:null,stickers:[],replies:[]
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
    const styles=await page.evaluate(()=>({
      intro:getComputedStyle(document.querySelector(".arrival-caption")).backgroundColor,
      fold:getComputedStyle(document.querySelector(".free-letter-bottom")).transform
    }));
    assert.match(styles.intro,/rgba?\(/);
    await envelope.click();
    await page.locator(".arrival.opening").waitFor();
    await page.locator(".reading #addReply").waitFor({timeout:14000});
    const animation=await page.locator(".reading").evaluate(el=>getComputedStyle(el).animationName);
    assert.equal(animation,"reading-fade-in","reading must not flip the entire card");
    await page.locator("#addReply").click({timeout:5000});
    await page.locator("#replyBody").waitFor();
    await page.locator("#replyBody").fill("이건 댓글이 아닌 포스트잇 답장이야!");
    await page.locator("#sendReply").click();
    await page.locator('.postit[data-reply="bbbbbbbbbbbbbbbbbbbbbbbb"]').waitFor();
    assert.equal(await page.locator("#replyModal").count(),0);
    assert.equal(errors.length,0,"Page errors: "+errors.join(" | "));
    console.log("PASS: "+viewport.width+"px envelope layering, unfolded page and clickable reply/post-it");
    await page.close();
  }
}finally{
 await browser.close();
}
