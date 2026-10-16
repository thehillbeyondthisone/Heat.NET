'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{spawnSync}=require('node:child_process');
const C=require('../authority-contract.cjs');
test('native jump and NC intents cannot carry identities, reward claims, transforms or sequence injection',()=>{
 for(const type of ['jump','enter','exit']){
  assert.doesNotThrow(()=>C.action({type,camp:701}));
  for(const extra of [{profile_id:'other'},{degrees:100},{trophy:'forged'},{x:0,z:0},{seq:999},{active_seconds:3600}])assert.throws(()=>C.action({type,camp:701,...extra}),/Only game intents/);
  for(const camp of [undefined,0,2501,-1,701.5,'701'])assert.throws(()=>C.action({type,camp}),/Invalid camp/);
 }
});
test('native building cannot inject balances, items, rotation or unsupported production',()=>{
 for(const extra of [{tu:10000},{items:[]},{rotation:1},{owner_id:'other'}])assert.throws(()=>C.action({type:'build',camp:701,kind:'nc',x:10,z:34,facility:0,...extra}));
 assert.throws(()=>C.action({type:'build',camp:701,kind:'grunt',x:10,z:34,facility:0}),/Unsupported construction/);
});
test('actual Godot transport blocks older or incomplete authorities before gameplay and attendance',{timeout:20000},()=>{
 const root=path.resolve(__dirname,'../../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'heat-shared-protocol-'));
 try{
  const report=path.join(temp,'report.json');
  const result=spawnSync(path.join(root,'recovery/runtime/Godot.exe'),['--headless','--path',path.join(root,'playable'),'--script','tests/shared_protocol_test.gd','--','--protocol-report='+report],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.doesNotMatch(result.stdout+result.stderr,/SCRIPT ERROR:|^ERROR:/m);
  const evidence=JSON.parse(fs.readFileSync(report));assert.equal(evidence.checks,14);assert.deepEqual(evidence.failures,[]);
 }finally{assert.ok(fs.realpathSync(temp).startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
});
