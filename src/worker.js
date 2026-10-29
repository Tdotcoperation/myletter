
const FONTS = new Set(["pretendard","wanted","seoyun","hippie"]);
const PAPERS = new Set(["classic","vintage"]);
const COLORS = new Set(["yellow","pink","mint","blue"]);
const MAX_BODY = 10000;
const MAX_FILES = 21;
const SECURITY_HEADERS = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const encode = (s)=>new TextEncoder().encode(s);
const bytesToHex = (buf)=>Array.from(new Uint8Array(buf), b=>b.toString(16).padStart(2,"0")).join("");
const rand = (n=24)=>Array.from(crypto.getRandomValues(new Uint8Array(n)), b=>b.toString(16).padStart(2,"0")).join("");
const digest = async (s)=>bytesToHex(await crypto.subtle.digest("SHA-256",encode(s)));
const json = (o,status=200,extra={})=>Response.json(o,{status,headers:{...SECURITY_HEADERS,...extra}});
const error = (message,status=400)=>json({error:message},status);
const safeText = (v,max)=>typeof v==="string" && v.trim().length>0 && v.trim().length<=max ? v.trim() : null;
const limitedNum = (v,min,max)=>typeof v==="number" && Number.isFinite(v) && v>=min && v<=max;
const equal = (a,b)=>{if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const cookieValue = (req,name)=>{
  const part=(req.headers.get("Cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
  return part?part.slice(name.length+1):null;
};
function allowedOrigin(req){
  const origin=req.headers.get("Origin");
  return !origin || origin===new URL(req.url).origin;
}
function dbReady(env){return env.DB && env.BUCKET;}
async function passwordHash(password,saltHex){
  const salt=new Uint8Array((saltHex.match(/../g)||[]).map(x=>parseInt(x,16)));
  const key=await crypto.subtle.importKey("raw",encode(password),"PBKDF2",false,["deriveBits"]);
  return bytesToHex(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},key,256));
}
function validateFile(file,max){
  if(!(file instanceof File) || file.size<1 || file.size>max)throw new Error("이미지 크기를 확인해 주세요.");
  if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type))throw new Error("PNG, JPG, WebP, GIF만 업로드할 수 있어요.");
}
async function sniff(file){
  const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const m=file.type;
  const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;
  const jpg=b[0]===255&&b[1]===216&&b[2]===255;
  const gif=b[0]===71&&b[1]===73&&b[2]===70&&b[3]===56;
  const webp=b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
  if(!((m==="image/png"&&png)||(m==="image/jpeg"&&jpg)||(m==="image/gif"&&gif)||(m==="image/webp"&&webp)))throw new Error("이미지 파일 형식이 올바르지 않아요.");
}
const getLetter=(env,id)=>env.DB.prepare("SELECT * FROM letters WHERE id=?").bind(id).first();
function released(letter){return !letter.available_at || Date.now()>=Date.parse(letter.available_at);}
async function hasAccess(req,env,letter){
  if(!released(letter))return false;
  if(!letter.password_hash)return true;
  const token=cookieValue(req,"ml_"+letter.id);
  if(!token||!(/^[a-f0-9]{64}$/.test(token)))return false;
  const hash=await digest(token);
  const row=await env.DB.prepare("SELECT 1 AS ok FROM access_sessions WHERE token_hash=? AND letter_id=? AND expires_at>?").bind(hash,letter.id,Date.now()).first();
  return Boolean(row);
}
function locationFromUrl(req,id){return new URL(req.url).origin+"/l/"+id;}
async function createLetter(req,env){
  const size=Number(req.headers.get("Content-Length")||0);
  if(size>20*1024*1024)return error("전체 업로드 용량이 너무 커요.",413);
  const form=await req.formData();
  let data;
  try{data=JSON.parse(form.get("data"));}catch{return error("편지 데이터가 올바르지 않아요.");}
  if(!data||typeof data!=="object")return error("편지 정보가 없어요.");
  const sender=safeText(data.sender,60),recipient=safeText(data.recipient,60),title=safeText(data.title,150),body=safeText(data.body,MAX_BODY);
  if(!sender||!recipient||!title||!body)return error("받는 사람, 보내는 사람, 제목과 내용을 확인해 주세요.");
  if(!FONTS.has(data.font)||!PAPERS.has(data.paper))return error("선택한 편지 스타일이 올바르지 않아요.");
  if(data.password && (typeof data.password!=="string"||data.password.length<4||data.password.length>80))return error("비밀번호는 4~80자로 입력해 주세요.");
  let available=null;
  if(data.available_at){
    const d=Date.parse(data.available_at);
    if(!Number.isFinite(d)||d>Date.now()+5*365*86400000)return error("공개 날짜를 다시 확인해 주세요.");
    available=new Date(d).toISOString();
  }
  const stickers=Array.isArray(data.stickers)?data.stickers:[];
  if(stickers.length>20)return error("스티커는 20개까지 등록할 수 있어요.");
  const ids=new Set();
  for(const st of stickers){
    if(!st||typeof st.id!=="string"||!(/^[a-zA-Z0-9_-]{6,80}$/.test(st.id))||ids.has(st.id)||!limitedNum(st.x,-0.3,1.3)||!limitedNum(st.y,-0.3,1.3)||!limitedNum(st.w,0.05,0.8))return error("스티커 위치 정보가 올바르지 않아요.");
    ids.add(st.id);
  }
  const uploaded=Array.from(form.values()).filter(v=>v instanceof File);
  if(uploaded.length>MAX_FILES)return error("업로드 가능한 이미지 수를 초과했어요.");
  const background=form.get("background");
  if(background && !(background instanceof File))return error("배경 이미지가 올바르지 않아요.");
  if(background){validateFile(background,5*1024*1024);await sniff(background);}
  let total=background?background.size:0;
  for(const st of stickers){
    const file=form.get("sticker_"+st.id);
    if(!(file instanceof File))return error("스티커 이미지가 누락되었어요.");
    validateFile(file,2*1024*1024);await sniff(file);
    total+=file.size;
  }
  if(total>16*1024*1024)return error("이미지 전체 용량은 16MB 이하여야 해요.",413);
  if(uploaded.length!==(stickers.length+(background?1:0)))return error("알 수 없는 첨부 파일이 있어요.");
  const id=rand(12), manageToken=rand(32);
  const salt=data.password?rand(16):null;
  const pwdHash=salt?await passwordHash(data.password,salt):null;
  const keys=[], assetEntries=[], stickerEntries=[];
  async function store(file,assetId){
    const key="letters/"+id+"/"+assetId;
    await env.BUCKET.put(key,file,{httpMetadata:{contentType:file.type}});
    keys.push(key);
    assetEntries.push({id:assetId,key,mime:file.type,bytes:file.size});
    return assetId;
  }
  try{
    let bg=null;
    if(background)bg=await store(background,rand(12));
    for(let i=0;i<stickers.length;i++){
      const st=stickers[i];const aid=await store(form.get("sticker_"+st.id),rand(12));
      stickerEntries.push({id:st.id,assetId:aid,x:st.x,y:st.y,w:st.w,z:i+1});
    }
    const stmts=[env.DB.prepare("INSERT INTO letters (id,sender,recipient,title,body,font,paper,bg_asset,password_salt,password_hash,available_at,allow_reply,manage_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,sender,recipient,title,body,data.font,data.paper,bg,salt,pwdHash,available,data.allow_reply===false?0:1,await digest(manageToken))];
    for(const a of assetEntries)stmts.push(env.DB.prepare("INSERT INTO assets (id,letter_id,r2_key,mime,bytes) VALUES (?,?,?,?,?)").bind(a.id,id,a.key,a.mime,a.bytes));
    for(const s of stickerEntries)stmts.push(env.DB.prepare("INSERT INTO stickers (id,letter_id,asset_id,x,y,w,z) VALUES (?,?,?,?,?,?,?)").bind(s.id,id,s.assetId,s.x,s.y,s.w,s.z));
    await env.DB.batch(stmts);
    return json({id,url:locationFromUrl(req,id),manageUrl:new URL(req.url).origin+"/manage/"+id+"/"+manageToken},201);
  }catch(e){
    await Promise.allSettled(keys.map(key=>env.BUCKET.delete(key)));
    throw e;
  }
}
async function issueStatus(env,id){
  const letter=await getLetter(env,id);
  if(!letter)return error("편지를 찾을 수 없어요.",404);
  return json({id,sender:letter.sender,recipient:letter.recipient,availableAt:letter.available_at,locked:!!letter.password_hash,allowReply:!!letter.allow_reply,available:released(letter)});
}
async function unlock(req,env,id){
  const letter=await getLetter(env,id);
  if(!letter)return error("편지를 찾을 수 없어요.",404);
  if(!released(letter))return error("아직 열람할 수 없는 편지예요.",425);
  if(!letter.password_hash)return json({ok:true});
  const ip=(req.headers.get("CF-Connecting-IP")||"unknown").slice(0,100);
  const key=await digest(id+"|"+ip);
  const now=Date.now();
  const rate=await env.DB.prepare("SELECT count,reset_at FROM login_attempts WHERE key=?").bind(key).first();
  if(rate&&rate.reset_at>now&&rate.count>=7)return error("비밀번호 입력 횟수를 초과했어요. 잠시 후 다시 시도해 주세요.",429);
  const input=await req.json().catch(()=>({}));
  if(typeof input.password!=="string"||input.password.length>80)return error("비밀번호를 입력해 주세요.");
  const hash=await passwordHash(input.password,letter.password_salt);
  if(!equal(hash,letter.password_hash)){
    if(rate&&rate.reset_at>now)await env.DB.prepare("UPDATE login_attempts SET count=count+1 WHERE key=?").bind(key).run();
    else await env.DB.prepare("INSERT INTO login_attempts(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,reset_at=excluded.reset_at").bind(key,now+15*60000).run();
    return error("비밀번호가 올바르지 않아요.",401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE key=?").bind(key).run();
  const token=rand(32);
  await env.DB.prepare("INSERT INTO access_sessions(token_hash,letter_id,expires_at) VALUES (?,?,?)").bind(await digest(token),id,now+12*3600000).run();
  return json({ok:true},200,{"Set-Cookie":"ml_"+id+"="+token+"; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax"});
}
async function readLetter(req,env,id){
  const letter=await getLetter(env,id);
  if(!letter)return error("편지를 찾을 수 없어요.",404);
  if(!released(letter))return error("아직 편지를 열 수 없어요.",425);
  if(!(await hasAccess(req,env,letter)))return error("비밀번호를 먼저 확인해 주세요.",401);
  const [stickers,replies]=await Promise.all([
    env.DB.prepare("SELECT id,asset_id,x,y,w,z FROM stickers WHERE letter_id=? ORDER BY z ASC").bind(id).all(),
    env.DB.prepare("SELECT id,body,x,y,color,created_at FROM replies WHERE letter_id=? ORDER BY created_at ASC").bind(id).all()
  ]);
  await env.DB.prepare("UPDATE letters SET views=views+1 WHERE id=?").bind(id).run();
  return json({id,sender:letter.sender,recipient:letter.recipient,title:letter.title,body:letter.body,font:letter.font,paper:letter.paper,background:letter.bg_asset?"/media/"+id+"/"+letter.bg_asset:null,allowReply:!!letter.allow_reply,stickers:stickers.results.map(s=>({...s,url:"/media/"+id+"/"+s.asset_id})),replies:replies.results});
}
async function getMedia(req,env,id,assetId){
  const letter=await getLetter(env,id);
  if(!letter||!released(letter))return error("찾을 수 없는 이미지예요.",404);
  if(!(await hasAccess(req,env,letter)))return error("이미지에 접근할 수 없어요.",401);
  const a=await env.DB.prepare("SELECT r2_key,mime FROM assets WHERE id=? AND letter_id=?").bind(assetId,id).first();
  if(!a)return error("이미지를 찾을 수 없어요.",404);
  const object=await env.BUCKET.get(a.r2_key);
  if(!object)return error("이미지를 찾을 수 없어요.",404);
  return new Response(object.body,{headers:{"Content-Type":a.mime,"Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'none'; sandbox"}});
}
async function createReply(req,env,id){
  const letter=await getLetter(env,id);
  if(!letter)return error("편지를 찾을 수 없어요.",404);
  if(!released(letter)||!(await hasAccess(req,env,letter)))return error("편지에 접근할 수 없어요.",401);
  if(!letter.allow_reply)return error("답장이 허용되지 않은 편지예요.",403);
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM replies WHERE letter_id=?").bind(id).first();
  if(count.n>=100)return error("답장은 최대 100개까지 붙일 수 있어요.",409);
  const input=await req.json().catch(()=>({}));
  const body=safeText(input.body,800);
  if(!body)return error("메모지 내용을 입력해 주세요.");
  const color=COLORS.has(input.color)?input.color:"yellow";
  const x=limitedNum(input.x,-0.3,1.3)?input.x:0.55,y=limitedNum(input.y,-0.3,1.3)?input.y:0.7;
  const token=rand(32),idReply=rand(12);
  await env.DB.prepare("INSERT INTO replies (id,letter_id,body,x,y,color,author_hash) VALUES (?,?,?,?,?,?,?)").bind(idReply,id,body,x,y,color,await digest(token)).run();
  return json({reply:{id:idReply,body,x,y,color,created_at:new Date().toISOString()},editorToken:token},201);
}
async function moveReply(req,env,id){
  const input=await req.json().catch(()=>({}));
  if(!limitedNum(input.x,-0.3,1.3)||!limitedNum(input.y,-0.3,1.3))return error("메모지 위치가 올바르지 않아요.");
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!(/^[a-f0-9]{64}$/.test(token)))return error("수정 권한이 없어요.",403);
  const reply=await env.DB.prepare("SELECT author_hash,letter_id FROM replies WHERE id=?").bind(id).first();
  if(!reply)return error("메모지를 찾을 수 없어요.",404);
  if(!equal(await digest(token),reply.author_hash))return error("본인이 작성한 메모지만 움직일 수 있어요.",403);
  const letter=await getLetter(env,reply.letter_id);
  if(!letter||!(await hasAccess(req,env,letter)))return error("편지를 먼저 열어 주세요.",401);
  await env.DB.prepare("UPDATE replies SET x=?,y=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(input.x,input.y,id).run();
  return json({ok:true});
}
async function deleteLetter(req,env,id){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!(/^[a-f0-9]{64}$/.test(token)))return error("관리 권한이 없어요.",403);
  const letter=await getLetter(env,id);
  if(!letter)return error("편지를 찾을 수 없어요.",404);
  if(!equal(await digest(token),letter.manage_hash))return error("관리 권한이 없어요.",403);
  const assets=await env.DB.prepare("SELECT r2_key FROM assets WHERE letter_id=?").bind(id).all();
  // DB records are removed after best-effort R2 cleanup.
  await Promise.allSettled(assets.results.map(a=>env.BUCKET.delete(a.r2_key)));
  await env.DB.prepare("DELETE FROM letters WHERE id=?").bind(id).run();
  return json({ok:true});
}
export default {
  async fetch(req,env){
    const url=new URL(req.url),path=url.pathname,method=req.method;
    if(!path.startsWith("/api/")&&!path.startsWith("/media/"))return env.ASSETS.fetch(req);
    if(!dbReady(env))return error("D1 또는 R2 바인딩이 설정되지 않았어요.",503);
    if(!allowedOrigin(req)&&method!=="GET")return error("허용되지 않은 요청 출처예요.",403);
    try{
      if(path==="/api/health"&&method==="GET")return json({ok:true,service:"MyLetter"});
      if(path==="/api/letters"&&method==="POST")return await createLetter(req,env);
      const status=path.match(/^\/api\/letters\/([a-f0-9]{24})\/status$/);
      if(status&&method==="GET")return await issueStatus(env,status[1]);
      const unlockMatch=path.match(/^\/api\/letters\/([a-f0-9]{24})\/unlock$/);
      if(unlockMatch&&method==="POST")return await unlock(req,env,unlockMatch[1]);
      const letterMatch=path.match(/^\/api\/letters\/([a-f0-9]{24})$/);
      if(letterMatch&&method==="GET")return await readLetter(req,env,letterMatch[1]);
      if(letterMatch&&method==="DELETE")return await deleteLetter(req,env,letterMatch[1]);
      const replyMatch=path.match(/^\/api\/letters\/([a-f0-9]{24})\/replies$/);
      if(replyMatch&&method==="POST")return await createReply(req,env,replyMatch[1]);
      const moveMatch=path.match(/^\/api\/replies\/([a-f0-9]{24})$/);
      if(moveMatch&&method==="PATCH")return await moveReply(req,env,moveMatch[1]);
      const media=path.match(/^\/media\/([a-f0-9]{24})\/([a-f0-9]{24})$/);
      if(media&&method==="GET")return await getMedia(req,env,media[1],media[2]);
      return error("지원하지 않는 요청이에요.",404);
    }catch(e){
      console.error("MyLetter API:",e);
      if(e instanceof SyntaxError)return error("요청 형식이 올바르지 않아요.");
      if(e?.message?.includes("이미지")||e?.message?.includes("업로드"))return error(e.message,400);
      return error("서버 처리 중 문제가 발생했어요. 다시 시도해 주세요.",500);
    }
  }
};
