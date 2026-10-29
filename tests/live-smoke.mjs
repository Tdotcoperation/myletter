
const ORIGIN="https://myletter.imtdot.kr";
const data={sender:"MyLetter Test",recipient:"자동 점검",title:"발급 API 점검",body:"자동 검사에서 생성되고 즉시 삭제되는 편지입니다.",font:"pretendard",paper:"classic",allow_reply:false,stickers:[]};
async function issue({withPhoto=false}={}){
 const form=new FormData();
 form.set("data",JSON.stringify(data));
 if(withPhoto){
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9buKd7sAAAAASUVORK5CYII=","base64");
  form.set("background",new File([png],"small.png",{type:"image/png"}));
 }
 let id=null,token=null,passed=false;
 try{
  const r=await fetch(ORIGIN+"/api/letters",{method:"POST",body:form,signal:AbortSignal.timeout(25000)});
  const j=await r.json().catch(()=>({}));
  console.log("LIVE ISSUE "+(withPhoto?"WITH IMAGE":"TEXT ONLY")+" -> HTTP "+r.status+" "+JSON.stringify({error:j.error,code:j.code}));
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
const results=[await issue(),await issue({withPhoto:true})];
if(results.some(v=>!v))process.exitCode=1;
