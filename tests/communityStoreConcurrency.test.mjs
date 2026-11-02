import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";

const file=new URL("../src/services/communityStore.js",import.meta.url);
const source=readFileSync(file,"utf8")
  .replace('import { getData, setData, supa } from "../storage.js";','const supa={rpc:(...args)=>globalThis.__communityTestRpc(...args)};')
  .replace(/from "(\.[^"]+)"/g,(_,path)=>`from "${pathToFileURL(resolve(dirname(fileURLToPath(file)),path)).href}"`);
const store=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("private saves pass the exact read token and boards retain their existing payload",async()=>{
  const calls=[];
  globalThis.__communityTestRpc=async(name,args)=>{calls.push({name,args});return {data:"ok"};};
  await store.patchCommunityItem(store.PRIVATE_BRACKETS_KEY,"bracket",{graph:{winner:"a"}},{pin:"2468",expectedUpdatedAt:"server-token"});
  assert.equal(calls[0].args.p_payload._expectedUpdatedAt,"server-token");
  assert.deepEqual(calls[0].args.p_payload.graph,{winner:"a"});
  await store.patchCommunityItem(store.FREE_BOARD_KEY,"post",{title:"수정"},{pin:"2468"});
  assert.deepEqual(calls[1].args.p_payload,{title:"수정"});
});

test("an older private bracket with no token passes explicit null and stale saves give a refresh message",async()=>{
  let payload;
  globalThis.__communityTestRpc=async(name,args)=>{payload=args.p_payload;return {data:"stale"};};
  await assert.rejects(()=>store.patchCommunityItem(store.PRIVATE_BRACKETS_KEY,"old",{name:"기존"},{pin:"2468"}),/다른 기기.*최신 결과/);
  assert.ok(Object.hasOwn(payload,"_expectedUpdatedAt"));assert.equal(payload._expectedUpdatedAt,null);
});
