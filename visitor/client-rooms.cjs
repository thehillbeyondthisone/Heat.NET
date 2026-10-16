'use strict';
// HEAT identities own seats; readiness is transient and clears on service restart.
const path=require('node:path'),M=require('./model.cjs');
function validate(d){M.assert(M.plain(d)&&d.version===1&&M.integer(d.generation)&&M.integer(d.next,1)&&Array.isArray(d.messages)&&d.messages.length<=2000,'Client room history needs recovery.');let prev=0;const ids=new Set();for(const m of d.messages){M.assert(M.plain(m)&&M.integer(m.id,1)&&m.id>prev&&m.id<d.next&&M.PROFILE_ID.test(m.from)&&M.text(m.name,32)&&M.text(m.text,1000)&&m.text.trim()&&/^[a-f0-9-]{36}$/.test(m.request)&&M.number(m.unix)&&!ids.has(m.from+':'+m.request),'Invalid room message.');prev=m.id;ids.add(m.from+':'+m.request);}return d;}
function createClientRooms({stateDir,now,active,inGame,playing=inGame,name,worldId,roomId='visitor',title='Planet Visitor',capacity=16}){
M.assert(/^[a-z0-9-]+$/.test(roomId),'Invalid room ID.');
const file=path.join(stateDir,roomId==='visitor'?'client-rooms.json':'client-room-'+roomId+'.json'),seats=new Map(),rates=new Map();let data,error='';
try{data=M.readJSON(file,validate)||{version:1,generation:0,next:1,messages:[]};}catch{error='The Visitor room history needs recovery. Its file was retained.';}
const guard=()=>M.assert(!error,error),save=n=>{M.atomicJSON(file,n,validate);data=n;};
function prune(){for(const[id,s]of seats)if(!active(s.key)||s.until<=now()&&!inGame(id))seats.delete(id);}
const host=()=>[...seats.values()].sort((a,b)=>a.joined-b.joined||a.id.localeCompare(b.id))[0]?.id||'';
function seat(id,key){guard();prune();const s=seats.get(id);M.assert(s&&s.key===key,'Join the Visitor room first.');return s;}
function join(id,key){guard();prune();M.assert(active(key),'Sign in again.');const p=seats.get(id);if(p?.key===key){p.until=now()+45;return;}M.assert(!p||!inGame(id),'This account is already playing in another client.');M.assert(p||seats.size<capacity,'The game room is full.');seats.set(id,{id,key,joined:now(),until:now()+45,ready:false,generation:0,launched:false});}
function heartbeat(id,key){seat(id,key).until=now()+45;}
function leave(id,key){const s=seat(id,key);M.assert(!inGame(id),'Close 10Six before leaving the room.');seats.delete(s.id);}
function forget(key){for(const[id,s]of seats)if(s.key===key)seats.delete(id);}
function ready(id,key,v){const s=seat(id,key);M.assert(typeof v==='boolean'&&!inGame(id),'Close 10Six before changing readiness.');s.ready=v;s.generation=0;s.launched=false;s.until=now()+45;}
function begin(id,key){seat(id,key);M.assert(host()===id,'Only the room host can launch the ready group.');M.assert([...seats.values()].every(s=>s.ready&&!inGame(s.id)),'Everyone in this group must be ready and out of the game.');if(data.generation>0&&[...seats.values()].every(s=>s.generation===data.generation))return data.generation;const n=structuredClone(data);n.generation++;save(n);for(const s of seats.values()){s.generation=data.generation;s.launched=false;}return data.generation;}
function permit(id,key,g){const s=seat(id,key);M.assert(M.integer(g,1)&&s.ready&&s.generation===g&&g===data.generation,'This group launch is no longer current. Ready up again.');return s;}
function launched(id,key,g){permit(id,key,g).launched=true;}
function returned(id,key){const s=seats.get(id);if(s&&(!key||s.key===key)){s.ready=false;s.launched=false;s.generation=0;s.until=now()+45;}}
function send(id,key,input){seat(id,key);M.assert(M.plain(input)&&Object.keys(input).sort().join(',')==='request_id,text'&&M.text(input.text,1000)&&input.text.trim()&&/^[a-f0-9-]{36}$/.test(input.request_id||''),'Use a room message of 1-1000 characters.');const old=data.messages.find(m=>m.from===id&&m.request===input.request_id);if(old){M.assert(old.text===input.text,'That request belongs to another message.');return{ok:true,duplicate:true,id:old.id};}const r=rates.get(id)||{until:now()+30,count:0};if(r.until<=now()){r.until=now()+30;r.count=0;}M.assert(r.count<20,'Wait a moment before sending more room messages.');r.count++;rates.set(id,r);const n=structuredClone(data),m={id:n.next++,from:id,name:name(id),text:input.text,request:input.request_id,unix:now()};n.messages.push(m);n.messages=n.messages.slice(-2000);save(n);return{ok:true,id:m.id};}
function view(id,key){prune();const own=seats.get(id),joined=Boolean(own&&own.key===key),canRead=Boolean(id&&active(key));return{id:roomId,title,world_id:worldId,kind:roomId==='visitor'?'persistent_world':'match',capacity,error,host_id:canRead?host():'',joined:Boolean(joined),members:canRead?[...seats.values()].map(s=>({profile_id:s.id,display_name:name(s.id),ready:s.ready,status:playing(s.id)?'in_game':s.launched||inGame(s.id)?'opening':'in_room'})):[],launch_generation:joined&&own.ready&&!own.launched?own.generation:0,current_generation:joined&&own.ready?own.generation:0,messages:joined&&!error?data.messages.slice(-100).map(({request,...m})=>m):[]};}
return{join,heartbeat,leave,forget,ready,begin,permit,launched,returned,send,view,get error(){return error;}};
}
module.exports={createClientRooms,validate};
