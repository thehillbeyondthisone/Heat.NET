'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),M=require('../model.cjs');
test('state read-back corruption or schema failure leaves the prior file intact and cleans the temporary file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heat-checked-json-')),file=path.join(dir,'state.json'),before=fs.readSync;
 try{M.atomicJSON(file,{value:1},d=>assert.ok(d.value>0));
  fs.readSync=function(fd,buffer,...args){const count=before.call(this,fd,buffer,...args);if(count)buffer[0]^=1;return count;};
  assert.throws(()=>M.atomicJSON(file,{value:2}),/read-back differs/);fs.readSync=before;assert.deepEqual(JSON.parse(fs.readFileSync(file)),{value:1});assert.deepEqual(fs.readdirSync(dir),['state.json']);
  assert.throws(()=>M.atomicJSON(file,{value:-1},d=>assert.ok(d.value>0)));assert.deepEqual(JSON.parse(fs.readFileSync(file)),{value:1});assert.deepEqual(fs.readdirSync(dir),['state.json']);
  M.atomicJSON(file,{value:2});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{value:2});assert.deepEqual(JSON.parse(fs.readFileSync(file+'.bak')),{value:1});
 }finally{fs.readSync=before;const safe=fs.realpathSync(dir);assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(safe).startsWith('heat-checked-json-'));fs.rmSync(safe,{recursive:true,force:true});}
});
