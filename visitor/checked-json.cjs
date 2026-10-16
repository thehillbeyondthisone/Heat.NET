'use strict';
const fs=require('node:fs');
// Verify the bytes and schema through the same exclusive temporary-file handle.
// Reopening every new file incurs substantial scanner/open latency on Windows.
function writeCheckedJSON(file,json,validator,maxBytes=16*1024*1024){
 const bytes=Buffer.from(json);if(bytes.length>maxBytes)throw new Error('State file exceeds its size limit.');
 const fd=fs.openSync(file,'wx+',0o600);
 try{
  fs.writeFileSync(fd,bytes);const actual=Buffer.alloc(bytes.length);let offset=0;
  while(offset<actual.length){const count=fs.readSync(fd,actual,offset,actual.length-offset,offset);if(!count)throw new Error('State file read-back was incomplete.');offset+=count;}
  if(fs.fstatSync(fd).size!==bytes.length||!actual.equals(bytes))throw new Error('State file read-back differs from its write.');
  const data=JSON.parse(actual.toString('utf8'));if(validator)validator(data);
 }finally{fs.closeSync(fd);}
}
module.exports={writeCheckedJSON};
