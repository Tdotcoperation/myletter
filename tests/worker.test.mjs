
import test from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import worker from "../src/worker.js";

class FakeDB {
  constructor(){
    this.letters=new Map();this.assets=new Map();this.stickers=new Map();
    this.replies=new Map();this.sessions=new Map();this.attempts=new Map();this.schemaReady=false;this.schemaInitCount=0;
  }
  prepare(sql){
    let args=[];
    const first=async()=>{
      if(sql.startsWith("SELECT name FROM sqlite_master"))return this.schemaReady?{name:"letters"}:null;
      if(sql.startsWith("SELECT * FROM letters"))return this.letters.get(args[0])??null;
      if(sql.startsWith("SELECT 1 AS ok FROM access_sessions")) {
        const v=this.sessions.get(args[0]);return v?.letter_id===args[1]&&v?.expires_at>args[2]?{ok:1}:null;
      }
      if(sql.startsWith("SELECT count,reset_at FROM login_attempts"))return this.attempts.get(args[0])??null;
      if(sql.startsWith("SELECT COUNT(*) AS n FROM replies"))return {n:[...this.replies.values()].filter(x=>x.letter_id===args[0]).length};
      if(sql.startsWith("SELECT author_hash,letter_id FROM replies"))return this.replies.get(args[0])??null;
      if(sql.startsWith("SELECT r2_key,mime FROM assets")) {
        const a=this.assets.get(args[0]);return a?.letter_id===args[1]?a:null;
      }
      throw new Error("Unmocked first: "+sql);
    };
    const all=async()=>{
      if(sql.startsWith("SELECT name FROM sqlite_master")){
        return {results:this.schemaReady?["letters","assets","stickers","replies","access_sessions","login_attempts"].map(name=>({name})):[]};
      }
      if(sql.startsWith("SELECT id,asset_id,x,y,w,z FROM stickers")){
        return {results:[...this.stickers.values()].filter(s=>s.letter_id===args[0]).sort((a,b)=>a.z-b.z)};
      }
      if(sql.startsWith("SELECT id,body,x,y,color,created_at FROM replies")){
        return {results:[...this.replies.values()].filter(s=>s.letter_id===args[0]).sort((a,b)=>a.created_at.localeCompare(b.created_at))};
      }
      if(sql.startsWith("SELECT r2_key FROM assets"))return {results:[...this.assets.values()].filter(s=>s.letter_id===args[0])};
      throw new Error("Unmocked all: "+sql);
    };
    const run=async()=>{
      if(sql.startsWith("CREATE TABLE IF NOT EXISTS ") || sql.startsWith("CREATE INDEX IF NOT EXISTS ")){
        if(sql.startsWith("CREATE TABLE IF NOT EXISTS login_attempts")){this.schemaReady=true;this.schemaInitCount++;}
        return {};
      }
      if(sql.startsWith("INSERT INTO letters")){
        const [id,sender,recipient,title,body,font,paper,bg_asset,password_salt,password_hash,available_at,allow_reply,manage_hash]=args;
        this.letters.set(id,{id,sender,recipient,title,body,font,paper,bg_asset,password_salt,password_hash,available_at,allow_reply,manage_hash,views:0});return {};
      }
      if(sql.startsWith("INSERT INTO assets")){
        const [id,letter_id,r2_key,mime,bytes]=args;this.assets.set(id,{id,letter_id,r2_key,mime,bytes});return {};
      }
      if(sql.startsWith("INSERT INTO stickers")){
        const [id,letter_id,asset_id,x,y,w,z]=args;this.stickers.set(id,{id,letter_id,asset_id,x,y,w,z});return {};
      }
      if(sql.startsWith("UPDATE letters SET views")){this.letters.get(args[0]).views++;return {};}
      if(sql.startsWith("INSERT INTO access_sessions")){
        const [token_hash,letter_id,expires_at]=args;this.sessions.set(token_hash,{letter_id,expires_at});return {};
      }
      if(sql.startsWith("INSERT INTO replies")){
        const [id,letter_id,body,x,y,color,author_hash]=args;
        this.replies.set(id,{id,letter_id,body,x,y,color,author_hash,created_at:new Date().toISOString()});return {};
      }
      if(sql.startsWith("UPDATE replies SET")){const r=this.replies.get(args[2]);r.x=args[0];r.y=args[1];return {};}
      if(sql.startsWith("DELETE FROM letters")){
        this.letters.delete(args[0]);
        for(const [id,a]of this.assets)if(a.letter_id===args[0])this.assets.delete(id);
        for(const [id,a]of this.stickers)if(a.letter_id===args[0])this.stickers.delete(id);
        for(const [id,a]of this.replies)if(a.letter_id===args[0])this.replies.delete(id);
        return {};
      }
      if(sql.startsWith("INSERT INTO login_attempts")){this.attempts.set(args[0],{count:1,reset_at:args[1]});return {};}
      if(sql.startsWith("UPDATE login_attempts")){this.attempts.get(args[0]).count++;return {};}
      if(sql.startsWith("DELETE FROM login_attempts")){this.attempts.delete(args[0]);return {};}
      throw new Error("Unmocked run: "+sql);
    };
    return {bind(...v){args=v;return this;},first,all,run};
  }
  async exec(sql){assert.match(sql,/CREATE TABLE IF NOT EXISTS letters/);assert.match(sql,/CREATE TABLE IF NOT EXISTS replies/);this.schemaReady=true;this.schemaInitCount++;return {count:1};}
  async batch(stmts){return Promise.all(stmts.reduce((p,s)=>[...p,s],[]).map(s=>s.run()));}
}
class FakeR2{
  constructor(){this.blobs=new Map();}
  async put(key,blob){this.blobs.set(key,blob);}
  async get(key){const blob=this.blobs.get(key);return blob?{body:blob.stream()}:null;}
  async delete(key){this.blobs.delete(key);}
}
const makeEnv=()=>({DB:new FakeDB(),BUCKET:new FakeR2(),ASSETS:{fetch:()=>new Response("HTML")}});
const URL_BASE="https://letter.example";
const imageFile=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])],"pic.png",{type:"image/png"});
async function req(env,path,method="GET",body=null,headers={}){
 return worker.fetch(new Request(URL_BASE+path,{method,headers,body}),env);
}
async function issue(env,options={}){
 const id="sticker_abc123",data={
  sender:"서연",recipient:"친구",title:"안녕!",body:"반가워\n고마워",
  font:"wanted",paper:"vintage",allow_reply:true,
  stickers:[{id,x:.2,y:.3,w:.22}],...options
 };
 const form=new FormData();
 form.set("data",JSON.stringify(data));
 form.set("background",imageFile());
 form.set("sticker_"+id,imageFile());
 const res=await req(env,"/api/letters","POST",form);
 assert.equal(res.status,201,await res.clone().text());
 return res.json();
}
test("issue, share, view and move an author's sticky-note reply",async()=>{
 const env=makeEnv(),created=await issue(env);
 assert.match(created.url,/\/l\/[a-f0-9]{24}$/);
 const id=created.id;
 let r=await req(env,"/api/letters/"+id+"/status");
 assert.equal((await r.json()).sender,"서연");
 r=await req(env,"/api/letters/"+id);
 const letter=await r.json();
 assert.equal(letter.body,"반가워\n고마워");
 assert.equal(letter.stickers.length,1);
 assert.ok(letter.background);
 r=await req(env,letter.background);
 assert.equal(r.status,200);
 r=await req(env,"/api/letters/"+id+"/replies","POST",JSON.stringify({body:"나도 고마워!",color:"pink",x:.5,y:.7}),{"Content-Type":"application/json"});
 assert.equal(r.status,201);
 const {reply,editorToken}=await r.json();
 r=await req(env,"/api/replies/"+reply.id,"PATCH",JSON.stringify({x:.3,y:.4}),{"Content-Type":"application/json","Authorization":"Bearer incorrect"});
 assert.equal(r.status,403);
 r=await req(env,"/api/replies/"+reply.id,"PATCH",JSON.stringify({x:.3,y:.4}),{"Content-Type":"application/json","Authorization":"Bearer "+editorToken});
 assert.equal(r.status,200);
 r=await req(env,"/api/letters/"+id);
 const updated=await r.json();
 assert.equal(updated.replies[0].body,"나도 고마워!");
 assert.equal(updated.replies[0].x,.3);
 const token=created.manageUrl.split("/").pop();
 r=await req(env,"/api/letters/"+id,"DELETE",null,{"Authorization":"Bearer "+token});
 assert.equal(r.status,200);
 r=await req(env,"/api/letters/"+id);
 assert.equal(r.status,404);
});
test("password-gated text and R2 images remain private until unlock",async()=>{
 const env=makeEnv(),{id}=await issue(env,{password:"secure-password"});
 let r=await req(env,"/api/letters/"+id);
 assert.equal(r.status,401);
 const asset=[...env.assets||[]];
 const a=[...env.DB.assets.values()].find(x=>x.letter_id===id);
 r=await req(env,"/media/"+id+"/"+a.id);
 assert.equal(r.status,401);
 r=await req(env,"/api/letters/"+id+"/unlock","POST",JSON.stringify({password:"wrong"}),{"Content-Type":"application/json"});
 assert.equal(r.status,401);
 r=await req(env,"/api/letters/"+id+"/unlock","POST",JSON.stringify({password:"secure-password"}),{"Content-Type":"application/json"});
 assert.equal(r.status,200,await r.clone().text());
 const cookie=r.headers.get("set-cookie").split(";")[0];
 r=await req(env,"/api/letters/"+id,"GET",null,{"Cookie":cookie});
 assert.equal(r.status,200);
 r=await req(env,"/media/"+id+"/"+a.id,"GET",null,{"Cookie":cookie});
 assert.equal(r.status,200);
});
test("future-dated letter is locked by the server",async()=>{
 const env=makeEnv(),future=new Date(Date.now()+86400000).toISOString();
 const {id}=await issue(env,{available_at:future});
 let r=await req(env,"/api/letters/"+id+"/status");
 assert.equal((await r.json()).available,false);
 r=await req(env,"/api/letters/"+id);
 assert.equal(r.status,425);
 r=await req(env,"/api/letters/"+id+"/unlock","POST",JSON.stringify({password:"any"}),{"Content-Type":"application/json"});
 assert.equal(r.status,425);
});

test("fresh D1 database initializes schema only once per Worker instance",async()=>{
 const env=makeEnv();
 let r=await req(env,"/api/health");
 assert.equal(r.status,200);
 assert.equal(env.DB.schemaInitCount,1);
 r=await req(env,"/api/health");
 assert.equal(r.status,200);
 assert.equal(env.DB.schemaInitCount,1);
});

// The production Workers runtime rejects PBKDF2 deriveBits iterations > 100_000.
// Local Wrangler and Node crypto do not enforce this ceiling.
test("production PBKDF2 iteration budget stays within the Cloudflare limit",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
 const match=source.match(/const PBKDF2_ITERATIONS = (\d+);/);
 assert.ok(match,"PBKDF2 iteration policy must be explicit");
 assert.ok(Number(match[1])<=100000,"Workers rejects more than 100000 PBKDF2 iterations");
 assert.match(source,/iterations:PBKDF2_ITERATIONS/);
});
