import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('real scrolls over the EXP HUD are read without filling catalogue values', {skip:process.platform!=='darwin'},async()=>{
 const {OptionReader}=await import('../scripts/scan-tools/mega-options.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gms-tooltip-test-')),ocr=path.join(dir,'ocr');
 let reader;
 try {
  await promisify(execFile)('swiftc',['-O',new URL('../scripts/scan-tools/maple-ocr.swift',import.meta.url).pathname,'-o',ocr]);
  reader=new OptionReader({ocr,catalog:[]});
  for(const [fixture,en,chance,stats] of [
   ['mega-scroll-hud','Dagger Attack Scroll: Intermediate',60,{PAD:2}],
   ['mega-wand-scroll-hud','Wand Magic Attack Scroll: Greater',10,{MAD:8}]
  ]) {
   const load=s=>({width:340,height:156,data:gunzipSync(fs.readFileSync(new URL(`fixtures/${fixture}${s}.rgba.gz`,import.meta.url)))});
   const image=load(''),before=load('-before'),item={en,cat:'Use',inc:stats};
   const isolated=await reader.readColorPanel(image,before,item,{x:9,y:80});
   assert.ok(isolated,'the linked scroll box must be isolated');
   assert.deepEqual(await reader.readPanel(image,isolated.rows,isolated.panel,item,before),{scroll:{chance,stats}},en);
   assert.deepEqual(reader.lastMissing,[]);
  }
 } finally {
  await reader?.fallback?.then(w=>w.terminate());reader?.close();fs.rmSync(dir,{recursive:true,force:true});
 }
});
