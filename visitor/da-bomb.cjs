'use strict';
// HEAT stages the match. FTE owns the direct UDP gameplay path; room presence earns no credit.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),dgram=require('node:dgram');
const {spawn}=require('node:child_process'),M=require('./model.cjs'),R=require('./client-rooms.cjs');
const ID='da-bomb',MAP='h2m1';
function files(gameRoot){const work=path.join(gameRoot||'', 'recovery/da-bomb');return{work,game:path.join(work,'game'),engine:path.join(work,'engine/fteqw64.exe'),serverEngine:path.join(work,'engine/fteqwsv64.exe')};}
function installed(gameRoot){if(!gameRoot)return false;const f=files(gameRoot);return[f.engine,path.join(f.game,'id1/pak0.pak'),path.join(f.game,'bombsqd/PROGS.DAT'),path.join(f.game,'bombsqd/maps/h2m1.bsp'),path.join(f.game,'bombsqd/da-bomb-modern.cfg')].every(p=>{try{return fs.statSync(p).isFile();}catch{return false;}});}
function endpoint(address){const m=/^(\d+\.\d+\.\d+\.\d+):(\d+)$/.exec(address||'');M.assert(m&&net.isIPv4(m[1])&&Number(m[2])>=1024&&Number(m[2])<=65535,'Use the prepared Da Bomb IPv4 address and port.');return{host:m[1],port:Number(m[2])};}
function common(gameRoot){const f=files(gameRoot);return['-nohome','-quake','-basedir',f.game,'-game','bombsqd','+set','cfg_save_auto','0','+set','sv_public','0','+set','net_enable_dtls','0'];}
function launchNative({gameRoot,descriptor,name,spawnGame=spawn,extraArgs=[]}){
 M.assert(installed(gameRoot),'Da Bomb files are unavailable. Run the existing Da Bomb file check.');
 M.assert(M.plain(descriptor)&&Object.keys(descriptor).sort().join(',')==='address,game_id,generation,map'&&descriptor.game_id===ID&&descriptor.map===MAP&&M.integer(descriptor.generation,1),'Invalid Da Bomb launch.');endpoint(descriptor.address);
 const f=files(gameRoot),alias=String(name).replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,24)||'HEAT player';
 return spawnGame(f.engine,[...common(gameRoot),'-window','-width','1280','-height','720','+exec','da-bomb-modern.cfg',
  '+set','cl_nopred','0','+set','cl_netfps','128','+set','cl_idlefps','128','+set','cl_maxfps','250','+set','vid_vsync','0','+set','rate','50000','+name',alias,
  '+in','1','connect',descriptor.address,...extraArgs],{cwd:f.work,shell:false,windowsHide:false,stdio:'ignore'});
}
function probe(address,timeout=750){const {host,port}=endpoint(address);return new Promise((resolve,reject)=>{
 const socket=dgram.createSocket('udp4'),start=performance.now();let done=false;
 const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket.close();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(new Error('Da Bomb server did not answer.')),timeout);
 socket.on('error',error=>finish(error));socket.on('message',(packet,remote)=>{if(packet.length<5||remote.address!==host||remote.port!==port||packet.readUInt32BE(0)!==0xffffffff)return;const text=packet.subarray(4).toString('latin1');if(!/^n\\/.test(text))return;finish(null,{round_trip_ms:Math.round((performance.now()-start)*100)/100,text:text.slice(1)});});
 socket.send(Buffer.concat([Buffer.from([255,255,255,255]),Buffer.from('status\n')]),port,host);
});}
function createDaBomb({gameRoot,stateDir,now,active,name,otherGame,spawnGame=spawn,config={}}){
 const bind=config.bind||'127.0.0.1',port=config.port||26060,address=config.address||bind+':'+port;
 endpoint(bind+':'+port);endpoint(address);M.assert(bind!=='0.0.0.0'&&endpoint(address).host===bind,'Bind Da Bomb to its explicit local IPv4 address.');
 const games=new Map(),admissions=new Map(),launching=new Map();let server=null,starting=null,lastError='',latency=null,checkedAt=-Infinity;
 async function check(){if(latency&&now()-checkedAt<5)return latency;latency=await probe(address);checkedAt=now();return latency;}
 const liveAdmission=id=>{const a=admissions.get(id);if(a&&(!active(a.key)||a.until<=now())){admissions.delete(id);room.returned(id,a.key);return false;}return Boolean(a);};
 const room=R.createClientRooms({stateDir,now,active,name,worldId:'da-bomb-h2m1',roomId:ID,title:'Quake / Da Bomb',capacity:8,
  inGame:id=>games.has(id)||otherGame(id)||liveAdmission(id),playing:id=>games.has(id)});
 const available=()=>installed(gameRoot);
 const view=(id,key)=>room.view(id,key);
 const game=id=>({id:ID,title:'Quake / Da Bomb',subtitle:'Novosibirsk Base',supported:true,installed:available(),running:games.has(id),kind:'match',
  reason:'Join the opposing teams to play Da Bomb. Gameplay connects directly to the Quake server.',latency:latency&&{round_trip_ms:latency.round_trip_ms},server_running:Boolean(server),error:lastError});
 async function startServer(){
  if(starting)return starting;
  if(server){await check();return;}
  starting=(async()=>{
   M.assert(available(),'Da Bomb files are unavailable. Run the existing Da Bomb file check.');
   // Refuse to adopt or stop another host on this port.
   const reservation=dgram.createSocket('udp4');try{await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.bind(port,bind,resolve);});}finally{reservation.close();}
   const f=files(gameRoot),child=spawnGame(fs.existsSync(f.serverEngine)?f.serverEngine:f.engine,[...common(gameRoot),'-dedicated','+set','sv_port',address,'+set','sv_playerslots','8',
    '+set','sv_mintic','0.0078125','+set','sv_maxtic','0.0078125','+serverinfo','maxfps','128',
    '+set','hostname','HEAT_Da_Bomb','+set','deathmatch','1','+set','teamplay','1','+set','skill','2','+set','timelimit','20','+set','fraglimit','0','+map',MAP],
    {cwd:f.work,shell:false,windowsHide:true,stdio:['pipe','ignore','ignore']});server=child;
   let failed='';const clear=()=>{if(server===child){server=null;for(const a of admissions.values())room.returned(a.id,a.key);admissions.clear();}};
   child.once('error',()=>{failed='The Da Bomb server could not open.';lastError=failed;clear();});child.once('exit',()=>{failed='The Da Bomb server stopped.';clear();});
   try{for(let i=0;i<20;i++){if(failed)throw new Error(failed);try{latency=await probe(address,250);M.assert(latency.text.includes('\\map\\'+MAP),'The Da Bomb server loaded the wrong map.');checkedAt=now();return;}catch(error){if(i===19)throw error;}}}
   catch(error){if(server===child){server=null;child.kill();}throw error;}
  })();try{await starting;lastError='';}finally{starting=null;}
 }
 function descriptor(id,key,generation){room.permit(id,key,generation);M.assert(server,'Start the ready group first.');const old=admissions.get(id);if(old){M.assert(old.key===key&&old.descriptor.generation===generation,'Another Da Bomb launch owns this account.');return old.descriptor;}
  const value={game_id:ID,generation,address,map:MAP};admissions.set(id,{id,key,descriptor:value,until:now()+45});room.launched(id,key,generation);return value;}
 function returned(id,key){if(admissions.get(id)?.key===key)admissions.delete(id);room.returned(id,key);}
 async function action(id,key,action,input,remote=false){
  M.assert(active(key),'Sign in to HEAT first.');const exact=keys=>M.plain(input)&&Object.keys(input).sort().join(',')===keys.sort().join(',');
  if(action==='join'){M.assert(exact([])&&!otherGame(id),'Close your other game before joining Da Bomb.');room.join(id,key);}
  else if(action==='heartbeat'){M.assert(exact([]),'Heartbeat has no player fields.');room.heartbeat(id,key);if(admissions.get(id)?.key===key)admissions.get(id).until=now()+45;}
  else if(action==='leave'){M.assert(exact([]),'Leave uses your signed-in identity.');room.leave(id,key);returned(id,key);}
  else if(action==='ready'){M.assert(exact(['ready']),'Use the ready flag.');room.ready(id,key,input.ready);}
  else if(action==='chat')return room.send(id,key,input);
  else if(action==='check'){M.assert(exact([]),'Check has no player fields.');M.assert(server,'The room host must launch the ready group.');return{ok:true,round_trip_ms:(await check()).round_trip_ms};}
  else if(action==='start'){
   M.assert(exact([])&&view(id,key).host_id===id,'Only the room host can start Da Bomb.');
   M.assert(view(id,key).members.every(m=>m.ready&&m.status==='in_room'),'Everyone must be ready and out of the game.');await startServer();return{ok:true,generation:room.begin(id,key)};
  }else if(action==='admission'||action==='play'){
   M.assert(exact(['generation'])&&M.integer(input.generation,1),'Use the current Da Bomb generation.');M.assert(!otherGame(id),'Close your other game first.');
   if(remote){M.assert(action==='admission','Use your local native launcher.');M.assert(!bind.startsWith('127.'),'This Da Bomb room is loopback only. Configure its LAN address before using another PC.');return descriptor(id,key,input.generation);}
   M.assert(action==='play','Use the local native launch.');if(games.has(id)){room.permit(id,key,input.generation);return{ok:true,running:true};}if(launching.has(id))return launching.get(id);
   const work=(async()=>{const d=descriptor(id,key,input.generation);try{const child=launchNative({gameRoot,descriptor:d,name:name(id),spawnGame});games.set(id,child);
    const clear=()=>{if(games.get(id)===child){games.delete(id);returned(id,key);}};child.once('exit',clear);child.once('error',()=>{lastError='Da Bomb could not open. Check its files and ready up again.';clear();});return{ok:true,running:true};
   }catch(error){returned(id,key);throw error;}})();launching.set(id,work);try{return await work;}finally{launching.delete(id);}
  }else if(action==='return'){M.assert(remote&&exact([])&&!games.has(id),'Close the local Da Bomb game before returning.');returned(id,key);}
  else throw new Error('Unknown Da Bomb room action.');return{ok:true,room:view(id,key)};
 }
 return{game,view,action,installed:available,running:id=>games.has(id),busy:id=>games.has(id)||liveAdmission(id),profiles:()=>[...new Set([...games.keys(),...[...admissions.keys()].filter(liveAdmission)])],forget(key){room.forget(key);for(const[id,a]of admissions)if(a.key===key)admissions.delete(id);},close(){for(const c of games.values())c.kill();games.clear();server?.kill();server=null;}};
}
module.exports={ID,installed,launchNative,probe,createDaBomb};
