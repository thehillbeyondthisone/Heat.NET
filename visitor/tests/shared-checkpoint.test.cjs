'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {createGodotAuthority}=require('../godot-authority.cjs');
test('protocol-2 authority upgrades and rolls back a frozen v1 isolated world without changing checkpoint schema or losing construction/inventory',{timeout:25000},async()=>{
 const root=path.resolve(__dirname,'../../../..'),profile='local-'+ 'a'.repeat(32);
 const legacy=()=>createGodotAuthority({gameRoot:root,spawnAuthority:(exe,args,options)=>{const modified=args.slice();modified[modified.indexOf('--script')+1]='tests/fixtures/authority-v1.gd';return spawn(exe,modified,options);}});
 let old=legacy(),modern,rollback;
 try{
  await old.start();await old.command({profile_id:profile,action:{type:'claim',camp:701,corporation:'bruteforce'}});
  await old.command({profile_id:profile,action:{type:'build',camp:701,kind:'nc',x:10,z:34,facility:0}});
  const saved=structuredClone(old.read().checkpoint),nc=saved.camps['701'].entities.find(x=>x.kind==='nc');
  assert.ok(nc);const itemIds=saved.camps['701'].items.map(x=>x.id);old.close();old=null;
  modern=createGodotAuthority({gameRoot:root});await modern.start(saved);
  assert.equal(modern.read().view.client_protocol,2);
  const upgraded=structuredClone(modern.read().checkpoint);
  assert.deepEqual(Object.keys(upgraded).sort(),Object.keys(saved).sort());assert.equal(upgraded.world.version,saved.world.version);
  assert.deepEqual(upgraded.world.claims,saved.world.claims);assert.equal(upgraded.camps['701'].version,saved.camps['701'].version);
  assert.equal(upgraded.camps['701'].entities.find(x=>x.id===nc.id).kind,'nc');assert.deepEqual(upgraded.camps['701'].items.map(x=>x.id),itemIds);
  modern.close();modern=null;
  rollback=legacy();await rollback.start(upgraded);
  const restored=rollback.read().checkpoint;
  assert.deepEqual(restored.world.claims,saved.world.claims);assert.deepEqual(restored.camps['701'].items.map(x=>x.id),itemIds);
  assert.ok(restored.camps['701'].entities.some(x=>x.id===nc.id&&x.kind==='nc'));
 }finally{old?.close();modern?.close();rollback?.close();}
});
