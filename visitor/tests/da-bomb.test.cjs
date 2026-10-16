'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),dgram=require('node:dgram'),{spawn}=require('node:child_process');
const {createVisitorServer}=require('../server.cjs'),Q=require('../da-bomb.cjs');
const root=path.resolve(__dirname,'../..'),gameRoot=path.resolve(root,'../..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function unusedPort(){const s=dgram.createSocket('udp4');await new Promise(r=>s.bind(0,'127.0.0.1',r));const port=s.address().port;s.close();return port;}
async function environment({mockNative=false}={}){
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'heat-da-bomb-')),children=[],port=await unusedPort();
 const app=createVisitorServer({root,gameRoot,stateDir:state,clientEnabled:true,daBomb:{port},spawnGame(exe,args,options){assert.equal(options.shell,false);if(mockNative&&!args.includes('-dedicated')){const child=new(require('node:events').EventEmitter)();child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);};children.push(child);return child;}const child=spawn(exe,args,{...options,stdio:['pipe','pipe','pipe']});let diagnostics='';for(const stream of[child.stdout,child.stderr])stream.on('data',c=>diagnostics=(diagnostics+c).slice(-4000));child.once('exit',code=>{if(code)console.log('FTE diagnostics: '+diagnostics);});children.push(child);return child;}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 async function api(route,input,cookie=''){const r=await fetch(base+'/api/visitor'+route,{method:input===undefined?'GET':'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
 async function account(name){const password=crypto.randomBytes(24).toString('hex'),a=await api('/auth/register',{username:name,display_name:name,password,adopt_local:false});assert.equal(a.status,200);return{...a,password};}
 return{app,state,children,api,account,port,async close(){for(const c of children)if(c.exitCode===null)c.kill();await new Promise(r=>app.server.close(r));const safe=fs.realpathSync(state);assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(safe).startsWith('heat-da-bomb-'));fs.rmSync(safe,{recursive:true,force:true});}};
}
test('Da Bomb uses HEAT identity and separate room history; forged launch/schema/identity and cross-game command injection fail',async()=>{
 const e=await environment();try{const a=await e.account('heat_room_alpha'),b=await e.account('heat_room_beta'),room=(a,action,data={})=>e.api('/client/da-bomb/'+action,data,a.cookie);
 assert.equal((await room(a,'join',{profile_id:b.data.account.profile_id})).status,400);
 assert.equal((await e.api('/client/da-bomb/join',{})).status,401);
 for(const p of[a,b])assert.equal((await room(p,'join')).status,200);
 assert.equal((await room(a,'play',{generation:1,address:'foreign.example'})).status,400);
 assert.equal((await room(a,'play',{generation:1})).status,400);
 assert.equal((await room(b,'start')).status,400);
 const message={request_id:crypto.randomUUID(),text:'Same HEAT identities, Quake room.'};assert.equal((await room(a,'chat',message)).status,200);assert.equal((await room(a,'chat',message)).data.duplicate,true);
 const home=(await e.api('/client',undefined,b.cookie)).data;assert.equal(home.rooms[Q.ID].members.length,2);assert.equal(home.rooms[Q.ID].messages.length,1);assert.equal(home.room.members.length,0);assert.equal(home.degrees.balance,0);
 assert.equal(e.children.length,0);assert.equal((await room(a,'leave')).status,200);assert.equal((await e.api('/client',undefined,b.cookie)).data.rooms[Q.ID].host_id,b.data.account.profile_id);
 }finally{await e.close();}
});
test('two browsers switch to the Quake room, exchange chat, launch the ready group automatically and return',{skip:!process.env.HEAT_TEST_BROWSER,timeout:45000},async()=>{
 const {chromium}=require('playwright'),e=await environment({mockNative:true});let browser;
 try{const accounts=[await e.account('quake_browser_alpha'),await e.account('quake_browser_beta')];browser=await chromium.launch({headless:true,channel:'msedge'});const errors=[],pages=[];
  for(const a of accounts){const context=await browser.newContext({viewport:{width:1360,height:900}}),p=await context.newPage();pages.push(p);p.on('pageerror',error=>errors.push(error.message));await p.goto('http://127.0.0.1:'+e.app.server.address().port+'/site/client/index.html');await p.locator('#username').fill(a.data.account.username);await p.locator('#password').fill(a.password);await p.locator('#auth-submit').click();await p.locator('#workspace').waitFor();await p.locator('[data-game="da-bomb"]').click();await p.waitForFunction(()=>!window.heatClient.busy&&document.querySelector('#game-title').textContent==='Quake / Da Bomb');await p.locator('#join-room').click();await p.waitForFunction(()=>!window.heatClient.busy&&window.heatClient.state.rooms['da-bomb'].joined);}
  const refresh=async p=>{await p.evaluate(()=>window.heatClient.refresh(true));await p.waitForFunction(()=>!window.heatClient.busy);};
  await pages[0].locator('#room-text').fill('Ready for Da Bomb');await pages[0].locator('#room-send').click();await pages[0].waitForFunction(()=>!window.heatClient.busy);await refresh(pages[1]);await pages[1].locator('#room-log').getByText('Ready for Da Bomb',{exact:true}).waitFor();
  for(const p of pages){await p.locator('#ready').click();await p.waitForFunction(()=>!window.heatClient.busy);}await refresh(pages[0]);await pages[0].locator('#play').click();await pages[0].waitForFunction(()=>!window.heatClient.busy&&window.heatClient.state.client.games.find(g=>g.id==='da-bomb').running);await refresh(pages[1]);await pages[1].waitForFunction(()=>!window.heatClient.busy&&window.heatClient.state.client.games.find(g=>g.id==='da-bomb').running);assert.equal(e.children.length,3);
  assert.equal(await pages[0].locator('#room-title').textContent(),'Quake / Da Bomb room');assert.equal(await pages[0].locator('#signout').isDisabled(),true);
  if(process.env.HEAT_QUAKE_SCREENSHOT)await pages[0].screenshot({path:process.env.HEAT_QUAKE_SCREENSHOT,fullPage:true});
  for(const c of e.children.slice(1))c.kill();for(const p of pages){await refresh(p);assert.equal(await p.locator('#signout').isDisabled(),false);assert.equal(await p.evaluate(()=>window.heatClient.state.degrees.balance),0);await p.locator('[data-game="10six"]').click();await p.waitForFunction(()=>!window.heatClient.busy&&document.querySelector('#game-title').textContent==='10Six');}
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await e.close();}
});
test('HEAT ready group launches two actual FTE clients into one Da Bomb server, records UDP RTT, returns and creates no awards',{skip:!Q.installed(gameRoot),timeout:45000},async()=>{
 const e=await environment();try{const a=await e.account('heat_quake_alpha'),b=await e.account('heat_quake_beta'),room=(a,action,data={})=>e.api('/client/da-bomb/'+action,data,a.cookie);
 for(const p of[a,b]){assert.equal((await room(p,'join')).status,200);assert.equal((await room(p,'ready',{ready:true})).status,200);}
 const start=await room(a,'start');assert.equal(start.status,200,JSON.stringify(start.data));const generation=start.data.generation;
 assert.equal((await room(b,'play',{generation:generation+1})).status,400);
 for(const p of[a,b])assert.equal((await room(p,'play',{generation})).status,200);
 assert.equal((await room(a,'play',{generation})).status,200);assert.equal(e.children.length,3);assert.equal(e.app.clientActiveGames(),2);
 assert.equal((await e.api('/auth/logout',{},a.cookie)).status,400);assert.equal((await room(a,'ready',{ready:false})).status,400);
 let status;await pause(6000);for(let i=0;i<3;i++){status=await Q.probe('127.0.0.1:'+e.port);const players=status.text.split('\n').filter(line=>/heat_quake_(alpha|beta)/.test(line));if(players.length===2&&players.every(line=>Number(line.split(' ')[3])<1000))break;await pause(2500);}
 assert.match(status.text,/heat_quake_alpha/);assert.match(status.text,/heat_quake_beta/);
 assert.ok(status.text.split('\n').filter(line=>/heat_quake_(alpha|beta)/.test(line)).every(line=>Number(line.split(' ')[3])<1000),'Both players must complete sign-on.');
 const samples=[];for(let i=0;i<8;i++){samples.push((await Q.probe('127.0.0.1:'+e.port)).round_trip_ms);await pause(1000);}samples.sort((a,b)=>a-b);
 const result={actual_fte_clients:2,heat_room_launch:true,map:'h2m1',scope:'same-machine loopback',udp_status_rtt_ms:{samples:samples.length,min:samples[0],median:samples[4],p95:samples[7],max:samples[7]},server_player_status:status.text.split('\n').slice(1),physical_lan_verified:false};
 // Kill only these two app-owned test clients, leaving the dedicated process for service cleanup.
 for(const c of e.children.slice(1))c.kill();for(let i=0;i<40&&e.app.clientActiveGames();i++)await pause(50);
 for(const p of[a,b]){const home=(await e.api('/client',undefined,p.cookie)).data;assert.equal(home.client.games.find(g=>g.id===Q.ID).running,false);assert.equal(home.rooms[Q.ID].members.find(m=>m.profile_id===p.data.account.profile_id).ready,false);assert.equal(home.degrees.balance,0);assert.equal(home.degrees.gameplay_seconds,0);assert.equal((await room(p,'play',{generation})).status,400);}
 result.return_verified=true;result.degrees_awarded=0;console.log(JSON.stringify(result));
 if(process.env.HEAT_DA_BOMB_RESULT)fs.writeFileSync(process.env.HEAT_DA_BOMB_RESULT,JSON.stringify(result,null,2));
 }finally{await e.close();}
});
