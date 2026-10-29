
const ORIGIN="https://myletter.imtdot.kr";
const data={sender:"MyLetter Test",recipient:"자동 점검",title:"발급 API 점검",body:"자동 검사에서 생성되고 즉시 삭제되는 편지입니다.",font:"pretendard",paper:"classic",allow_reply:false,stickers:[]};
async function issue({withPhoto=false,withSticker=false,withPassword=false,withDate=false,largePhoto=false}={}){
 const form=new FormData();
 const payload={...data};
 if(withPassword)payload.password="a-secret-test-password";
 if(withDate)payload.available_at=new Date(Date.now()+3600000).toISOString();
 if(withSticker)payload.stickers=[{id:"sticker-ci-12345678",x:0.2,y:0.25,w:0.2}];
 form.set("data",JSON.stringify(payload));
 if(withPhoto){
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9buKd7sAAAAASUVORK5CYII=","base64");
  const contents=largePhoto?Buffer.concat([png,Buffer.alloc(4*1024*1024)]):png;
  form.set("background",new File([contents],"small.png",{type:"image/png"}));
 }
 if(withSticker){
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9buKd7sAAAAASUVORK5CYII=","base64");
  form.set("sticker_sticker-ci-12345678",new File([png],"sticker.png",{type:"image/png"}));
 }
 let id=null,token=null,passed=false;
 try{
  const r=await fetch(ORIGIN+"/api/letters",{method:"POST",body:form,signal:AbortSignal.timeout(25000)});
  const j=await r.json().catch(()=>({}));
  console.log("LIVE ISSUE "+JSON.stringify({withPhoto,withSticker,withPassword,withDate,largePhoto})+" -> HTTP "+r.status+" "+JSON.stringify({error:j.error,code:j.code}));
  if(r.status===201&&j.id&&j.manageUrl){
    id=j.id;token=j.manageUrl.split("/").pop();passed=true;
  }
  return passed;
 }catch(e){console.error("LIVE ISSUE NETWORK FAILED:",e.message);return false;}
 finally{
  if(id&&token)try{
    const r=await fetch(ORIGIN+"/api/letters/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(25000)});
    console.log("LIVE CLEANUP -> HTTP "+r.status);
  }catch(e){console.error("LIVE CLEANUP FAILED:",e.message);}
 }
}
const results=[
 await issue(),
 await issue({withPhoto:true}),
 await issue({withPhoto:true,withSticker:true}),
 await issue({withPassword:true}),
 await issue({withDate:true}),
 await issue({withPhoto:true,largePhoto:true})
];
if(results.some(v=>!v))process.exitCode=1;
