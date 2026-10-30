// Preserve GIF frame data and timing; make playback loop forever even when
// the uploaded GIF has a finite loop count (or lacks a loop extension).
export function ensureGifInfiniteLoop(input){
  const b=input instanceof Uint8Array?input:new Uint8Array(input);
  if(b.length<14||b[0]!==71||b[1]!==73||b[2]!==70||b[3]!==56||
    (b[4]!==55&&b[4]!==57)||b[5]!==97)
    throw Error("GIF 이미지 헤더가 올바르지 않아요.");
  const packed=b[10],palette=(packed&128)?3*(1<<((packed&7)+1)):0;
  const at=13+palette;
  if(at>=b.length)throw Error("GIF 이미지 팔레트가 손상되었어요.");
  function subblocks(start){
    let p=start;
    while(p<b.length){
      const count=b[p++];
      if(!count)return p;
      if(p+count>b.length)break;
      p+=count;
    }
    throw Error("GIF 이미지 데이터가 손상되었어요.");
  }
  let p=at,loop=-1,frames=0,trailer=false;
  while(p<b.length){
    const marker=b[p++];
    if(marker===0x3b){trailer=true;break;}
    if(marker===0x21){
      if(p>=b.length)break;
      const label=b[p++];
      if(label!==0xff){p=subblocks(p);continue;}
      if(p>=b.length)break;
      const length=b[p++];
      if(p+length>b.length)break;
      const app=String.fromCharCode(...b.subarray(p,p+length));
      const isLoop=app==="NETSCAPE2.0"||app==="ANIMEXTS1.0";
      p+=length;
      while(p<b.length){
        const n=b[p++];
        if(n===0)break;
        if(p+n>b.length)throw Error("GIF 이미지 확장 데이터가 손상되었어요.");
        if(isLoop&&n>=3&&b[p]===1)loop=p+1;
        p+=n;
      }
    }else if(marker===0x2c){
      if(p+9>b.length)break;
      const local=b[p+8];
      p+=9;
      if(local&128)p+=3*(1<<((local&7)+1));
      if(p>=b.length)break;
      p++; // LZW minimum code size
      p=subblocks(p);
      frames++;
    }else throw Error("GIF 이미지 프레임 데이터가 손상되었어요.");
  }
  if(!trailer||!frames)throw Error("GIF 이미지 프레임을 찾을 수 없어요.");
  if(loop>=0){
    if(b[loop]===0&&b[loop+1]===0)return b;
    const out=new Uint8Array(b);
    out[loop]=0;out[loop+1]=0;
    return out;
  }
  // NETSCAPE2.0 application extension, 0 loops means infinite looping.
  const ext=Uint8Array.from([0x21,0xff,0x0b,78,69,84,83,67,65,80,69,50,46,48,3,1,0,0,0]);
  const out=new Uint8Array(b.length+ext.length);
  out.set(b.subarray(0,at));out.set(ext,at);out.set(b.subarray(at),at+ext.length);
  out[4]=57; // upgrade GIF87a to GIF89a when adding an app extension
  return out;
}
export async function normalizeUploadedGif(file){
  if(file.type!=="image/gif")return file;
  const b=ensureGifInfiniteLoop(new Uint8Array(await file.arrayBuffer()));
  return new File([b],file.name,{type:"image/gif",lastModified:file.lastModified});
}
