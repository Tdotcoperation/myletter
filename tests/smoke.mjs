
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
  const data={sender:"테스트",recipient:"친구",title:"마음",body:"실제 D1/R2 연동 테스트",font:"pretendard",paper:"classic",allow_reply:true,password:password||null,stickers:upload?[{id:"test-sticker-001",x:0.1,y:0.2,w:0.2}]:[]};
  const form=new FormData();
  form.set("data",JSON.stringify(data));
  if(upload){
    form.set("background",new File([png],"background.png",{type:"image/png"}));
    form.set("sticker_test-sticker-001",new File([png],"sticker.png",{type:"image/png"}));
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
