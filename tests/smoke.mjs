
import assert from "node:assert/strict";

const ROOT="http://127.0.0.1:8787";
async function request(path,opts) {
  const res=await fetch(ROOT+path,opts);
  const json=await res.json().catch(()=>null);
  console.log((opts?.method||"GET")+" "+path+" => "+res.status,JSON.stringify(json).slice(0,300));
  return {res,json};
}
const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9buKd7sAAAAASUVORK5CYII=","base64"));
function postLetter({upload=false,password=""}={}){
  const stickerId="test-sticker-"+crypto.randomUUID().slice(0,8);
  const data={sender:"테스트",recipient:"친구",title:"마음",body:"실제 D1/R2 연동 테스트",font:"pretendard",paper:"classic",allow_reply:true,password:password||null,stickers:upload?[{id:stickerId,x:0.1,y:0.2,w:0.2}]:[]};
  const form=new FormData();
  form.set("data",JSON.stringify(data));
  if(upload){
    form.set("background",new File([png],"background.png",{type:"image/png"}));
    form.set("sticker_"+stickerId,new File([png],"sticker.png",{type:"image/png"}));
  }
  return request("/api/letters",{method:"POST",body:form});
}
let r=await request("/api/health");
assert.equal(r.res.status,200,"D1 schema initialization failed");
r=await postLetter();
assert.equal(r.res.status,201,"Issue without images failed");
assert.ok(r.json.id);
const plainId=r.json.id;
r=await request("/api/letters/"+plainId);
assert.equal(r.res.status,200);
r=await postLetter({upload:true});
assert.equal(r.res.status,201,"Issue with R2 images failed");
const uploaded=r.json.id;
r=await request("/api/letters/"+uploaded);
assert.equal(r.res.status,200);
assert.equal(r.json.stickers.length,1);
assert.ok(r.json.background);
r=await fetch(ROOT+r.json.background);
assert.equal(r.status,200,"R2 image fetch failed");
r=await postLetter({password:"secret123"});
assert.equal(r.res.status,201,"Issue with password failed");
console.log("Success: issue with/without media, read, R2 and password.");

const owner=await postLetter({upload:true});
assert.equal(owner.res.status,201);
const ownerId=owner.json.id;
const secret=owner.json.manageUrl.split("/").pop();
const headers={Authorization:"Bearer "+secret};
const unauthorized=await request("/api/manage/"+ownerId,{headers:{Authorization:"Bearer "+"0".repeat(64)}});
assert.equal(unauthorized.res.status,403,"public visitors must not edit issued letters");
let manage=await request("/api/manage/"+ownerId,{headers});
assert.equal(manage.res.status,200,"manage read should work without receiver password");
assert.equal(manage.json.stickers.length,1);
assert.equal(manage.json.body,"실제 D1/R2 연동 테스트","existing letter body must remain unchanged");
const original=manage.json.stickers[0];
const media=await fetch(ROOT+original.url,{headers});
assert.equal(media.status,200,"private sticker must be available for owner preview");
const newStickerId="new-sticker-owner-123";
const update=new FormData();
update.set("data",JSON.stringify({stickers:[
 {id:original.id,asset_id:original.asset_id,x:.4,y:.5,w:.22},
 {id:newStickerId,x:.3,y:.25,w:.25}
]}));
update.set("sticker_"+newStickerId,new File([png],"added.png",{type:"image/png"}));
let saved=await request("/api/manage/"+ownerId+"/stickers",{method:"PUT",headers,body:update});
assert.equal(saved.res.status,200,"add and move stickers should save to D1 and R2");
assert.equal(saved.json.added,1);
manage=await request("/api/manage/"+ownerId,{headers});
assert.equal(manage.json.stickers.length,2);
assert.equal(manage.json.stickers.find(s=>s.id===original.id).x,.4);
const keep=manage.json.stickers.find(s=>s.id===newStickerId);
const remove=new FormData();
remove.set("data",JSON.stringify({stickers:[{id:keep.id,asset_id:keep.asset_id,x:.6,y:.6,w:.25}]}));
saved=await request("/api/manage/"+ownerId+"/stickers",{method:"PUT",headers,body:remove});
assert.equal(saved.res.status,200);
assert.equal(saved.json.removed,1,"remove existing sticker");
manage=await request("/api/manage/"+ownerId,{headers});
assert.equal(manage.json.stickers.length,1);
assert.equal(manage.json.stickers[0].id,newStickerId);
assert.equal(manage.json.body,"실제 D1/R2 연동 테스트","editing stickers must never change text");
let publicResult=await request("/api/letters/"+ownerId);
assert.equal(publicResult.res.status,200);
assert.equal(publicResult.json.stickers[0].x,.6,"recipient should see persisted sticker placement");
const cleanup=await request("/api/letters/"+ownerId,{method:"DELETE",headers});
assert.equal(cleanup.res.status,200);
console.log("Success: authenticated owner manages image stickers without modifying letter content.");

