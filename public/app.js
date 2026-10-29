
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const app=$("#app");
const fontList=[
  {id:"pretendard",name:"Pretendard",desc:"단정하고 편안한 서체"},
  {id:"wanted",name:"Wanted Sans",desc:"부드럽고 현대적인 서체"},
  {id:"seoyun",name:"흥국생명 이서윤체",desc:"다정한 손글씨 느낌"},
  {id:"hippie",name:"AI올컷 히피체",desc:"재미있고 자유로운 느낌"}
];
const defaults={recipient:"",title:"",body:"",sender:"",font:"pretendard",paper:"classic",passwordEnabled:false,password:"",dateEnabled:false,availableLocal:"",allowReply:true};
function restore(){
 try{return {...defaults,...JSON.parse(localStorage.getItem("myletter.draft")||"{}")};}catch{return {...defaults};}
}
let draft=restore(),step=1,bgFile=null,bgPreview="",stickers=[],chosenSticker=null;
let receipt=null,currentLetter=null,currentLetterId="",issuing=false,toastTimeout=null;
const safe=(s)=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const lines=s=>safe(s).replace(/\r?\n/g,"<br>");
const cssFont=id=>["pretendard","wanted","seoyun","hippie"].includes(id)?id:"pretendard";
const cssPaper=id=>id==="vintage"?"vintage":"classic";
const store=()=>{
 try{const copy={...draft,password:""};localStorage.setItem("myletter.draft",JSON.stringify(copy));}catch{}
};
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove("show"),3500);}
async function api(path,opts={}){
 const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts});
 const data=await response.json().catch(()=>({error:"서버 응답을 처리할 수 없어요."}));
 if(!response.ok)throw new Error(data.error||"문제가 발생했어요.");
 return data;
}
function brand(){return '<header class="topbar"><a class="brand" href="/"><span class="brand-icon">✉</span> MyLetter</a><span class="top-note">마음을 전하는 작은 편지</span></header>';}
function paperHTML(d,decor=false){
 const className="paper "+cssPaper(d.paper)+" font-"+cssFont(d.font);
 let overlays="";
 if(decor&&stickers.length){
   overlays='<div class="decal-layer">'+stickers.map(s=>'<img class="decal" tabindex="0" draggable="false" data-sticker="'+safe(s.id)+'" alt="꾸미기 스티커" src="'+safe(s.preview)+'" style="left:'+(s.x*100)+'%;top:'+(s.y*100)+'%;width:'+(s.w*100)+'%;z-index:'+(s.z||1)+'">').join("")+'</div>';
 }else if(d.stickers?.length){
   overlays='<div class="decal-layer">'+d.stickers.map(s=>'<img class="decal" draggable="false" alt="편지 스티커" src="'+safe(s.url)+'" style="left:'+(s.x*100)+'%;top:'+(s.y*100)+'%;width:'+(s.w*100)+'%;z-index:'+(s.z||1)+';pointer-events:none">').join("")+'</div>';
 }
 const replyButton=d.allowReply && d.id?'<div class="reply-button-wrap"><button class="glass-btn" id="addReply">＋ 답장 쓰기</button></div>':"";
 const replies=d.replies?.length?'<div class="replies-layer">'+d.replies.map(replyHTML).join("")+'</div>':"";
 return '<article class="'+className+'" id="letterPaper"><div class="paper-content"><p class="letter-head">To. '+safe(d.recipient||"소중한 친구")+'</p><h2 class="letter-title">'+safe(d.title||"전하고 싶은 이야기")+'</h2><div class="letter-body">'+safe(d.body||"여기에 마음을 담아 편지를 써 보세요.")+'</div><p class="letter-sign">From. '+safe(d.sender||"보내는 사람")+'</p>'+replyButton+'</div>'+overlays+replies+'</article>';
}
function sidePreview(){
 return '<aside class="preview-side"><div class="preview-label"><span>✦ 실시간 편지 미리보기</span><span>MY LETTER</span></div><div class="paper-frame">'+paperHTML(draft,true)+'</div><p class="footer-note">화면에 따라 편지지 크기는 자동으로 조절돼요.</p></aside>';
}
function wizardFrame(body,subtitle){
 return '<div class="shell">'+brand()+'<section class="hero"><span class="eyebrow">A LETTER FROM THE HEART</span><h1>마음을 담아, 편지를 써 보세요.</h1><p>글씨 하나, 작은 장식 하나까지 직접 골라 전하는 나만의 편지.</p></section><div class="wizard"><section class="panel"><div class="progress">'+[1,2,3,4].map(n=>'<span class="'+(n<=step?"active":"")+'"></span>').join("")+'</div><div class="smallcaps">STEP '+String(step).padStart(2,"0")+' / 04</div><h2 style="margin-top:10px">'+["","편지 작성하기","편지 스타일 고르기","편지 옵션과 꾸미기","마지막으로, 이름을 알려주세요"][step]+'</h2><p class="muted">'+subtitle+'</p>'+body+'</section>'+sidePreview()+'</div></div>';
}
function actions(nextText="다음 단계"){
 return '<div class="actions">'+(step>1?'<button class="btn btn-ghost" id="prevStep">← 이전</button>':'<span></span>')+'<button class="btn btn-primary" id="nextStep">'+nextText+' →</button></div>';
}
function renderCompose(){
 const body='<div class="field-row"><div class="field"><label for="recipient">받는 사람</label><input id="recipient" maxlength="60" placeholder="누구에게 보내나요?" value="'+safe(draft.recipient)+'"></div><div class="field"><label for="title">편지 제목</label><input id="title" maxlength="150" placeholder="편지 제목을 적어 주세요" value="'+safe(draft.title)+'"></div></div><div class="field"><label for="body">편지 내용</label><textarea id="body" maxlength="10000" placeholder="조금은 쑥스러운 마음도 편지로 전해 보세요…">'+safe(draft.body)+'</textarea><p class="hint" id="bodyCount">'+draft.body.length+' / 10,000자</p></div>'+actions("작성 완료");
 app.innerHTML=wizardFrame(body,"편지를 받는 친구를 떠올리며 천천히 적어 주세요.");
 for(const key of ["recipient","title","body"])$("#"+key).addEventListener("input",e=>{
   draft[key]=e.target.value;store();
   if(key==="body")$("#bodyCount").textContent=draft.body.length+" / 10,000자";
   const preview=$(".preview-side .paper-frame");if(preview)preview.innerHTML=paperHTML(draft);
 });
 bindSteps();
}
function renderStyle(){
 const choices=fontList.map(f=>'<button class="choice '+(draft.font===f.id?"active":"")+'" data-font="'+f.id+'" aria-pressed="'+(draft.font===f.id)+'"><div class="choice-preview font-'+f.id+'">마음을 전해요</div><strong>'+safe(f.name)+'</strong><span>'+safe(f.desc)+'</span></button>').join("");
 const papers=[{id:"classic",name:"기본 편지지",desc:"부드러운 크림색 종이"},{id:"vintage",name:"빈티지 편지",desc:"빛바랜 오래된 종이"}].map(p=>'<button class="choice '+(draft.paper===p.id?"active":"")+'" data-paper="'+p.id+'"><div class="paper-swatch '+p.id+'"></div><strong style="margin-top:8px">'+p.name+'</strong><span>'+p.desc+'</span></button>').join("");
 app.innerHTML=wizardFrame('<p class="group-label">글꼴 선택</p><div class="choice-grid">'+choices+'</div><p class="hint">교보 손글씨 이유빈체는 별도 사용 권한을 확인한 뒤 추가하는 글꼴입니다.</p><p class="group-label" style="margin-top:28px">편지지 테마</p><div class="choice-grid">'+papers+'</div>'+actions(),"글꼴과 종이 질감으로 편지의 분위기를 정해 보세요.");
 $$("[data-font]").forEach(el=>el.addEventListener("click",()=>{draft.font=el.dataset.font;store();renderStyle();}));
 $$("[data-paper]").forEach(el=>el.addEventListener("click",()=>{draft.paper=el.dataset.paper;store();renderStyle();}));
 bindSteps();
}
function renderOptions(){
 const backgroundBlock=bgFile?'<img class="upload-preview" src="'+safe(bgPreview)+'" alt="업로드된 배경"><p class="hint">'+safe(bgFile.name)+'</p><button class="btn btn-small btn-ghost" id="removeBg">배경 제거</button>':"";
 const body='<div class="option-card"><h3>🖼️ 받는 사람 화면 배경</h3><p class="muted">선택한 사진이 수신 화면 전체에 적용돼요. 화면 비율이 달라도 중앙을 기준으로 꽉 채워 보여 줍니다.</p><label class="file-box">＋<b>배경 이미지 선택</b><span>JPG, PNG, WebP, GIF / 최대 5MB</span><input type="file" id="backgroundFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>'+backgroundBlock+'</div>'+
 '<div class="option-card"><h3>✂️ 스티커로 편지 꾸미기</h3><p class="muted">사진을 스티커로 붙이고 원하는 위치로 옮겨 보세요. PC에서는 선택 후 D 키로 삭제할 수 있어요.</p><button class="btn btn-small" id="openDecorator">＋ 스티커 꾸미기 <span class="muted">('+stickers.length+'개)</span></button></div>'+
 '<div class="option-card"><div class="switch-line"><div><h3>🔐 비밀번호로 열기</h3><p class="hint">암호를 아는 사람만 편지를 읽을 수 있어요.</p></div><input type="checkbox" id="passwordEnabled" '+(draft.passwordEnabled?"checked":"")+'></div><div class="field" id="pwdWrap" '+(!draft.passwordEnabled?"hidden":"")+'><label for="password">비밀번호 (4자 이상)</label><input id="password" type="password" minlength="4" maxlength="80" autocomplete="new-password" placeholder="비밀번호 입력" value="'+safe(draft.password)+'"></div></div>'+
 '<div class="option-card"><div class="switch-line"><div><h3>📅 지정 날짜 이후 공개</h3><p class="hint">약속한 시간이 되기 전에는 내용을 볼 수 없어요.</p></div><input type="checkbox" id="dateEnabled" '+(draft.dateEnabled?"checked":"")+'></div><div class="field" id="dateWrap" '+(!draft.dateEnabled?"hidden":"")+'><label for="availableLocal">열람 시작 날짜와 시간</label><input id="availableLocal" type="datetime-local" value="'+safe(draft.availableLocal)+'"></div></div>'+
 '<div class="option-card"><div class="switch-line"><div><h3>📝 포스트잇 답장 허용</h3><p class="hint">답장은 편지 위에 스티커처럼 붙고, 링크로 열람할 수 있는 모두에게 보여요.</p></div><input type="checkbox" id="allowReply" '+(draft.allowReply?"checked":"")+'></div></div>'+actions("최종 단계");
 app.innerHTML=wizardFrame(body,"사진을 올리거나 스티커를 붙이고, 필요하면 보안을 설정해 보세요.");
 $("#backgroundFile").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file)return;if(!validImage(file,5*1024*1024))return; if(bgPreview)URL.revokeObjectURL(bgPreview);bgFile=file;bgPreview=URL.createObjectURL(file);renderOptions();});
 $("#removeBg")?.addEventListener("click",()=>{if(bgPreview)URL.revokeObjectURL(bgPreview);bgFile=null;bgPreview="";renderOptions();});
 $("#openDecorator").addEventListener("click",renderDecorator);
 for(const key of ["passwordEnabled","dateEnabled","allowReply"]){
   $("#"+key).addEventListener("change",e=>{draft[key]=e.target.checked;store();if(key==="passwordEnabled")$("#pwdWrap").hidden=!draft[key];if(key==="dateEnabled")$("#dateWrap").hidden=!draft[key];});
 }
 $("#password").addEventListener("input",e=>draft.password=e.target.value);
 $("#availableLocal").addEventListener("input",e=>{draft.availableLocal=e.target.value;store();});
 bindSteps();
}
function renderFinal(){
 const body='<div class="final-banner"><div class="final-icon">✉</div><p class="muted">이제 거의 다 왔어요. 마지막으로 이름을 남겨 주세요.</p></div>'+
 '<div class="field"><label for="sender">보내는 사람 이름 또는 닉네임</label><input id="sender" maxlength="60" placeholder="예: 승우, 익명의 친구" value="'+safe(draft.sender)+'"><p class="hint">이 이름은 첫 화면과 편지 하단에 표시돼요.</p></div>'+
 '<div class="option-card"><div class="smallcaps">PREVIEW</div><p style="margin:12px 0 5px;text-align:center" id="senderPreview">'+safe(draft.sender||"보내는 사람")+particle(draft.sender||"보내는 사람")+' 편지를 보냈어요.</p><p class="muted" style="text-align:center;margin:0">발급한 편지는 고유 링크로 공유할 수 있어요.</p></div>'+
 '<div class="actions"><button class="btn btn-ghost" id="prevStep">← 이전</button><button class="btn btn-primary" id="issueLetter">✉ 발급하기</button></div>';
 app.innerHTML=wizardFrame(body,"발급하기를 누르면 편지 내용과 이미지가 서버에 저장되고 공유 링크가 만들어져요.");
 $("#sender").addEventListener("input",e=>{draft.sender=e.target.value;store();$("#senderPreview").textContent=draft.sender?draft.sender+particle(draft.sender)+" 편지를 보냈어요.":"보내는 사람이 편지를 보냈어요.";$(".preview-side .paper-frame").innerHTML=paperHTML(draft);});
 $("#prevStep").addEventListener("click",()=>{step--;renderWizard();});
 $("#issueLetter").addEventListener("click",issueLetter);
}
function renderWizard(){
 window.scrollTo({top:0,behavior:"instant"});
 if(step===1)renderCompose();
 else if(step===2)renderStyle();
 else if(step===3)renderOptions();
 else renderFinal();
}
function bindSteps(){
 $("#prevStep")?.addEventListener("click",()=>{step=Math.max(1,step-1);renderWizard();});
 $("#nextStep")?.addEventListener("click",()=>{
   if(step===1&&(!draft.recipient.trim()||!draft.title.trim()||!draft.body.trim()))return toast("받는 사람, 제목과 편지 내용을 모두 적어 주세요.");
   if(step===3&&draft.passwordEnabled&&draft.password.length<4)return toast("비밀번호는 4자 이상이어야 해요.");
   if(step===3&&draft.dateEnabled&&(!draft.availableLocal||!Number.isFinite(new Date(draft.availableLocal).getTime())))return toast("열람 날짜를 올바르게 설정해 주세요.");
   step=Math.min(4,step+1);renderWizard();
 });
}
function validImage(file,max){
 if(!file.type.startsWith("image/")||!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type))return toast("JPG, PNG, GIF, WebP 이미지만 사용할 수 있어요."),false;
 if(file.size>max||file.size<1)return toast("이미지 크기가 제한을 넘었어요."),false;
 return true;
}
function addStickerFiles(files){
 let changed=false;
 for(const file of Array.from(files)){
   if(stickers.length>=20){toast("스티커는 최대 20개까지 붙일 수 있어요.");break;}
   if(!validImage(file,2*1024*1024))continue;
   const id=crypto.randomUUID().replace(/-/g,"");
   stickers.push({id,file,preview:URL.createObjectURL(file),x:0.18+(stickers.length%4)*0.17,y:0.2+(stickers.length%4)*0.13,w:0.22,z:stickers.length+1});changed=true;
 }
 if(changed)renderDecorator();
}
function renderDecorator(){
 app.innerHTML='<div class="decor-shell">'+brand()+'<div class="decor-bar"><div><div class="smallcaps">DECORATE YOUR LETTER</div><h1 style="margin:9px 0 2px">내 편지 꾸미기</h1></div><div class="decor-controls"><label class="btn btn-small">＋ 스티커 업로드 <input type="file" id="stickerFiles" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></label><button class="btn btn-small btn-ghost" id="deleteSticker">선택 삭제</button><button class="btn btn-primary btn-small" id="saveDecoration">완료 ✓</button></div></div><p class="decor-help">이미지를 드래그 앤 드롭으로 편지지에 올리거나 업로드해 보세요. 스티커를 누른 채로 움직이고, PC에서는 선택 후 D 키로 삭제할 수 있어요. 모바일에서는 선택 삭제 버튼을 사용해요.</p><div class="decor-stage"><div class="paper-frame">'+paperHTML(draft,true)+'</div></div><p class="footer-note">완료를 누르면 배치한 스티커의 위치가 발급할 편지에 적용돼요.</p></div>';
 $("#stickerFiles").addEventListener("change",e=>{addStickerFiles(e.target.files);e.target.value="";});
 $("#saveDecoration").addEventListener("click",()=>{chosenSticker=null;renderOptions();});
 $("#deleteSticker").addEventListener("click",deleteChosenSticker);
 const paper=$("#letterPaper");
 paper.addEventListener("dragover",e=>{e.preventDefault();paper.classList.add("drag-target");});
 paper.addEventListener("dragleave",()=>paper.classList.remove("drag-target"));
 paper.addEventListener("drop",e=>{e.preventDefault();paper.classList.remove("drag-target");addStickerFiles(e.dataTransfer.files);});
 paper.addEventListener("click",e=>{if(!e.target.closest(".decal")){chosenSticker=null;$$(".decal.selected").forEach(x=>x.classList.remove("selected"));}});
 $$(".decal",paper).forEach(el=>attachDrag(el,stickers.find(s=>s.id===el.dataset.sticker),paper,false));
}
function deleteChosenSticker(){
 if(!chosenSticker)return toast("삭제할 스티커를 먼저 선택해 주세요.");
 const index=stickers.findIndex(s=>s.id===chosenSticker);if(index<0)return;
 URL.revokeObjectURL(stickers[index].preview);stickers.splice(index,1);chosenSticker=null;renderDecorator();
}
document.addEventListener("keydown",e=>{
 if((e.key==="d"||e.key==="D")&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)&&$("#deleteSticker")){
   e.preventDefault();deleteChosenSticker();
 }
});
function attachDrag(el,obj,paper,isReply){
 if(!obj)return;
 if(isReply && !ownedReplyToken(obj.id))return;
 el.addEventListener("pointerdown",e=>{
   if(e.button!==0&&e.pointerType==="mouse")return;
   if(!isReply){chosenSticker=obj.id;$$(".decal.selected").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");}
   e.preventDefault();
   const rect=paper.getBoundingClientRect(),startX=e.clientX,startY=e.clientY,originalX=obj.x,originalY=obj.y;
   el.setPointerCapture(e.pointerId);
   let moved=false;
   const move=ev=>{
     if(ev.pointerId!==e.pointerId)return;
     const dx=(ev.clientX-startX)/rect.width,dy=(ev.clientY-startY)/rect.height;
     if(Math.abs(dx)+Math.abs(dy)>.005)moved=true;
     const minX=-Math.min(.12,el.offsetWidth/rect.width*.25),maxX=Math.max(0,1-el.offsetWidth/rect.width+.09);obj.x=Math.max(minX,Math.min(maxX,originalX+dx));obj.y=Math.max(-.15,Math.min(1.02,originalY+dy));
     el.style.left=(obj.x*100)+"%";el.style.top=(obj.y*100)+"%";
   };
   const end=async ev=>{
     if(ev.pointerId!==e.pointerId)return;
     el.removeEventListener("pointermove",move);
     el.removeEventListener("pointerup",end);
     el.removeEventListener("pointercancel",end);
     if(isReply&&moved){
       try{await api("/api/replies/"+obj.id,{method:"PATCH",headers:{"Content-Type":"application/json","Authorization":"Bearer "+ownedReplyToken(obj.id)},body:JSON.stringify({x:obj.x,y:obj.y})});}
       catch(err){toast(err.message);}
     }
   };
   el.addEventListener("pointermove",move);
   el.addEventListener("pointerup",end);
   el.addEventListener("pointercancel",end);
 });
}
async function issueLetter(){
 if(issuing)return;
 if(!draft.sender.trim())return toast("보내는 사람의 이름이나 닉네임을 입력해 주세요.");
 if(!draft.recipient.trim()||!draft.title.trim()||!draft.body.trim())return toast("편지 내용이 비어 있어요.");
 if(draft.passwordEnabled&&draft.password.length<4)return toast("비밀번호를 다시 입력해 주세요.");
 const button=$("#issueLetter");issuing=true;button.disabled=true;button.textContent="편지를 발급하고 있어요…";
 const data={sender:draft.sender,recipient:draft.recipient,title:draft.title,body:draft.body,font:draft.font,paper:draft.paper,password:draft.passwordEnabled?draft.password:null,available_at:draft.dateEnabled?new Date(draft.availableLocal).toISOString():null,allow_reply:draft.allowReply,stickers:stickers.map(s=>({id:s.id,x:s.x,y:s.y,w:s.w}))};
 const form=new FormData();form.append("data",JSON.stringify(data));
 if(bgFile)form.append("background",bgFile,bgFile.name);
 for(const s of stickers)form.append("sticker_"+s.id,s.file,s.file.name);
 try{
   receipt=await api("/api/letters",{method:"POST",body:form});
   localStorage.removeItem("myletter.draft");draft={...defaults};bgFile=null;stickers=[];renderSuccess();
 }catch(err){toast("발급 실패: "+err.message);button.disabled=false;button.textContent="✉ 발급하기";}
 finally{issuing=false;}
}
function renderSuccess(){
 app.innerHTML='<div class="shell">'+brand()+'<section class="panel success-card"><div class="final-icon">✓</div><div class="smallcaps">YOUR LETTER IS READY</div><h1 style="margin-top:10px">편지가 완성되었어요!</h1><p class="muted">아래 링크를 복사해서 소중한 사람에게 보내 주세요.</p><div class="field"><label>편지 공유 링크</label><div class="link-field" id="shareLink">'+safe(receipt.url)+'</div></div><div class="success-buttons"><button class="btn btn-primary" id="copyLink">🔗 편지 링크 복사</button><button class="btn" id="shareLinkButton">공유하기</button><a class="btn" href="'+safe(receipt.url)+'">편지 미리 열기</a></div><hr><div class="field"><label>비밀 관리 링크 (잃어버리지 마세요)</label><div class="link-field" id="manageLink">'+safe(receipt.manageUrl)+'</div><p class="hint">관리 링크를 아는 사람은 편지를 삭제할 수 있어요. 수신자에게 보내지 마세요.</p><button class="btn btn-small btn-ghost" id="copyManage">관리 링크 복사</button></div><div class="actions"><span></span><a class="btn btn-ghost" href="/">새 편지 쓰기 →</a></div></section></div>';
 $("#copyLink").onclick=()=>copy(receipt.url);
 $("#copyManage").onclick=()=>copy(receipt.manageUrl);
 $("#shareLinkButton").onclick=async()=>{
  if(navigator.share){try{await navigator.share({title:"당신에게 편지가 도착했어요",url:receipt.url});}catch{}}
  else copy(receipt.url);
 };
}
async function copy(s){
 try{await navigator.clipboard.writeText(s);toast("링크를 복사했어요!");}
 catch{window.prompt("아래 링크를 복사해 주세요.",s);}
}
function particle(name){
 const c=String(name).trim().slice(-1),n=c.charCodeAt(0)-0xac00;
 return n>=0&&n<=11171?(n%28?"이":"가"):"이(가)";
}
function niceDate(iso){return new Intl.DateTimeFormat("ko-KR",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Seoul"}).format(new Date(iso));}
function setViewerBg(){
 const v=$(".viewer");if(!v)return;
 if(currentLetter?.background)v.style.backgroundImage="url("+JSON.stringify(currentLetter.background)+")";
}
async function startRecipient(id){
 currentLetterId=id;
 app.innerHTML='<div class="loading-screen"><span class="logo-mark">✉</span><p>편지를 찾고 있어요…</p></div>';
 try{
   const status=await api("/api/letters/"+id+"/status");
   if(!status.available)return showGate(status,"date");
   if(status.locked)return showGate(status,"password");
   await fetchRecipientLetter();
 }catch(err){showError(err.message);}
}
function showError(msg){
 app.innerHTML='<div class="shell">'+brand()+'<div class="panel success-card"><div class="final-icon">✉</div><h1>편지를 열 수 없어요.</h1><p class="muted">'+safe(msg)+'</p><a href="/" class="btn">처음으로 돌아가기</a></div></div>';
}
function showGate(status,kind){
 const locked=kind==="password";
 app.innerHTML='<main class="viewer"><div class="gate-box"><div class="final-icon">'+(locked?"🔒":"⏳")+'</div><h1>'+safe(status.sender)+particle(status.sender)+' 편지를 보냈어요.</h1><p>'+(locked?"편지에는 비밀번호가 설정되어 있어요.":"이 편지는 아직 열람할 수 없어요.")+'</p>'+(locked?'<form id="unlockForm"><input class="password-input" type="password" maxlength="80" autocomplete="off" placeholder="편지 비밀번호" required><button class="btn btn-primary btn-wide" type="submit">편지 열기</button></form>':'<p><strong>'+safe(niceDate(status.availableAt))+'</strong> 이후 열 수 있어요.</p>')+'<p class="hint">MyLetter — 소중한 마음을 전하는 편지</p></div></main>';
 if(locked)$("#unlockForm").addEventListener("submit",async e=>{
   e.preventDefault();const btn=$("#unlockForm button");btn.disabled=true;
   try{await api("/api/letters/"+currentLetterId+"/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("#unlockForm input").value})});await fetchRecipientLetter();}
   catch(err){toast(err.message);btn.disabled=false;}
 });
}
async function fetchRecipientLetter(){
 try{currentLetter=await api("/api/letters/"+currentLetterId);renderArrival();}
 catch(err){showError(err.message);}
}
function envelopeHTML(){
 return '<div class="envelope" aria-hidden="true"><div class="env-back"></div><div class="env-fold"></div><div class="env-pocket"></div><div class="env-front"></div><div class="env-flap"></div></div>';
}
function renderArrival(){
 const name=safe(currentLetter.sender);
 app.innerHTML='<main class="viewer"><div class="arrival" id="arrival"><div class="arrival-caption"><h1>'+name+particle(currentLetter.sender)+' 편지를 보냈어요.</h1><p>아래 편지를 눌러 열어보세요.</p></div><button class="envelope-button" id="openEnvelope" aria-label="편지봉투 열기">'+envelopeHTML()+'</button><p style="font-size:11px;letter-spacing:2px;color:#766458;font-weight:800">A LETTER FOR YOU</p></div></main>';
 setViewerBg();
 $("#openEnvelope").addEventListener("click",()=>{
   if($("#arrival").classList.contains("opening"))return;
   $("#arrival").classList.add("opening");
   const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   setTimeout(()=>{const viewer=$(".viewer");if(!viewer)return;viewer.innerHTML=renderReadingHTML();attachReading();window.scrollTo(0,0);},reduced?100:3380);
 });
}
function replyHTML(r){
 const x=Number(r.x),y=Number(r.y);
 const c=["yellow","pink","mint","blue"].includes(r.color)?r.color:"yellow";
 const own=Boolean(ownedReplyToken(r.id));
 return '<div class="postit '+(own?"":"readonly")+'" tabindex="'+(own?"0":"-1")+'" role="note" data-reply="'+safe(r.id)+'" data-color="'+c+'" style="left:'+(Math.max(-.15,Math.min(.97,x))*100)+'%;top:'+(Math.max(-.3,Math.min(1.3,y))*100)+'%"><span>'+safe(r.body)+'</span></div>';
}
function storedTokens(){
 try{return JSON.parse(localStorage.getItem("myletter.reply.tokens")||"{}");}catch{return {};}
}
function ownedReplyToken(id){return storedTokens()[id]||"";}
function setOwnedReplyToken(id,token){
 const tokens=storedTokens();tokens[id]=token;
 try{localStorage.setItem("myletter.reply.tokens",JSON.stringify(tokens));}catch{}
}
function renderReadingHTML(){return '<section class="reading"><div class="paper-frame">'+paperHTML(currentLetter)+'</div><p class="footer-note" style="color:#54483e">MY LETTER · 마음을 전하는 편지</p></section>';}
function attachReading(){
 $("#addReply")?.addEventListener("click",openReplyModal);
 const paper=$("#letterPaper");
 if(!paper)return;
 $$(".postit[data-reply]",paper).forEach(el=>attachDrag(el,currentLetter.replies.find(r=>r.id===el.dataset.reply),paper,true));
}
function openReplyModal(){
 if($("#replyModal"))return;
 document.body.insertAdjacentHTML("beforeend",'<div class="modal-wrap" id="replyModal" role="dialog" aria-modal="true" aria-label="포스트잇 답장 작성"><div class="modal-card"><h2>포스트잇에 답장을 적어 주세요.</h2><p class="muted">작성 완료 후 편지지 위에서 위치를 옮길 수 있어요.</p><div class="note-compose" id="noteEditor"><div class="smallcaps">A LITTLE REPLY</div><textarea id="replyBody" maxlength="800" placeholder="답장하고 싶은 이야기를 적어 보세요…"></textarea><div class="note-colors"><button style="background:#fff0a2" class="active" data-color="yellow" aria-label="노란 메모지"></button><button style="background:#ffd3dd" data-color="pink" aria-label="분홍 메모지"></button><button style="background:#c9edda" data-color="mint" aria-label="민트 메모지"></button><button style="background:#cde4f8" data-color="blue" aria-label="하늘색 메모지"></button></div><button class="btn btn-primary btn-wide" id="sendReply">작성 완료</button></div><button class="btn btn-small btn-ghost" style="margin-top:14px" id="closeReply">취소</button></div></div>');
 let color="yellow";
 $$("#noteEditor [data-color]").forEach(el=>el.addEventListener("click",()=>{color=el.dataset.color;$$("#noteEditor [data-color]").forEach(x=>x.classList.toggle("active",x===el));}));
 $("#closeReply").onclick=()=>$("#replyModal").remove();
 $("#replyModal").addEventListener("pointerdown",e=>{if(e.target.id==="replyModal")$("#replyModal").remove();});
 $("#replyBody").focus();
 $("#sendReply").addEventListener("click",async()=>{
   const body=$("#replyBody").value.trim();
   if(!body)return toast("답장 내용을 적어 주세요.");
   const btn=$("#sendReply");btn.disabled=true;btn.textContent="메모지를 붙이고 있어요…";
   try{
     const res=await api("/api/letters/"+currentLetterId+"/replies",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body,color,x:0.5,y:0.68})});
     setOwnedReplyToken(res.reply.id,res.editorToken);
     currentLetter.replies.push(res.reply);
     $("#replyModal").remove();
     const scroll=window.scrollY;
     $(".viewer").innerHTML=renderReadingHTML();
     attachReading();window.scrollTo(0,scroll);toast("포스트잇을 붙였어요! 길게 눌러 옮겨 보세요.");
   }catch(err){toast(err.message);btn.disabled=false;btn.textContent="작성 완료";}
 });
}
async function renderManage(id,token){
 app.innerHTML='<div class="shell">'+brand()+'<div class="panel success-card"><div class="final-icon">⚙</div><h1>편지 관리</h1><p class="muted">이 링크를 가진 사람은 편지를 삭제할 수 있어요. 외부에 공개하지 마세요.</p><button class="btn btn-danger" id="deleteLetter">편지 영구 삭제</button><p class="hint">삭제된 편지와 업로드 이미지는 복구할 수 없어요.</p></div></div>';
 $("#deleteLetter").addEventListener("click",async()=>{
   if(!confirm("정말 이 편지를 삭제할까요?"))return;
   if(!confirm("모든 메모지와 이미지도 삭제됩니다. 계속할까요?"))return;
   try{await api("/api/letters/"+id,{method:"DELETE",headers:{"Authorization":"Bearer "+token}});toast("편지를 삭제했어요.");location.replace("/");}
   catch(err){toast(err.message);}
 });
}
function boot(){
 const path=location.pathname;
 const read=path.match(/^\/l\/([a-f0-9]{24})\/?$/);
 const manage=path.match(/^\/manage\/([a-f0-9]{24})\/([a-f0-9]{64})\/?$/);
 if(read)return startRecipient(read[1]);
 if(manage)return renderManage(manage[1],manage[2]);
 renderWizard();
}
boot();
