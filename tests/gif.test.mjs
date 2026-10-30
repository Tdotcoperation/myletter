import test from "node:test";
import assert from "node:assert/strict";
import {File} from "node:buffer";
import {ensureGifInfiniteLoop,normalizeUploadedGif} from "../src/gif.js";

const input=Uint8Array.from(Buffer.from("R0lGODlhAwADAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwECAAAh+QQACAAAACwAAAAAAwADAAAIBwABCBw4MCAAIfkEAAgAAAAsAAAAAAMAAwCBAAD/AAAAAAAAAAAACAcAAQgcODAgADs=","base64"));
function loopCount(bytes){
  const marker=Buffer.from(bytes).indexOf(Buffer.from("NETSCAPE2.0"));
  if(marker<0)return null;
  assert.equal(bytes[marker+11],3);
  assert.equal(bytes[marker+12],1);
  return bytes[marker+13]+(bytes[marker+14]<<8);
}
test("finite animated GIF becomes infinitely looping without losing frames",()=>{
 const result=ensureGifInfiniteLoop(input);
 assert.equal(loopCount(input),2);
 assert.equal(loopCount(result),0);
 assert.equal(result.byteLength,input.byteLength);
 assert.deepEqual(Array.from(result.subarray(0,25)),Array.from(input.subarray(0,25)));
 assert.equal(Buffer.from(result).toString("base64").length,Buffer.from(input).toString("base64").length);
 assert.equal(ensureGifInfiniteLoop(result),result,"already infinite GIF can reuse the bytes");
});
test("missing NETSCAPE loop extension gets inserted",()=>{
 const i=Buffer.from(input).indexOf(Buffer.from([0x21,0xff,0x0b]));
 const noExtension=new Uint8Array(input.length-19);
 noExtension.set(input.subarray(0,i));
 noExtension.set(input.subarray(i+19),i);
 assert.equal(loopCount(noExtension),null);
 const result=ensureGifInfiniteLoop(noExtension);
 assert.equal(loopCount(result),0);
 assert.equal(result.length,input.length);
});
test("reject invalid GIF files and preserve GIF file content type",async()=>{
 assert.throws(()=>ensureGifInfiniteLoop(Uint8Array.of(0,1,2)));
 const file=new File([input],"animated.gif",{type:"image/gif"});
 const saved=await normalizeUploadedGif(file);
 assert.equal(saved.type,"image/gif");
 assert.equal(loopCount(new Uint8Array(await saved.arrayBuffer())),0);
 const png=new File([Uint8Array.of(137,80,78,71)],"still.png",{type:"image/png"});
 assert.equal(await normalizeUploadedGif(png),png);
});
