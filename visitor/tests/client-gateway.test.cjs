'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {createFixtures,available}=require('./remote-tls-fixtures.cjs'),{createAuthorityHost}=require('../authority-host.cjs'),{createVisitorServer}=require('../server.cjs'),{createPlayerGateway}=require('../player-gateway.cjs'),{createPlayerLink}=require('../player-link.cjs'),{createPlayerBridge}=require('../player-bridge.cjs');
const root=path.resolve(__dirname,'../..'),gameRoot=path.resolve(process.env.HEAT_TEST_GAME_ROOT||path.join(root,'../..')),runtime=path.join(gameRoot,'recovery/runtime/Godot.exe'),pause=ms=>new Promise(r=>setTimeout(r,ms));
const protectedFiles=['saves/first-plot.json','saves/heat-net/accounts.json','saves/heat-net/degrees.json','saves/heat-net/trophies.json','.local/heat-net/state/heat/accounts.json','.local/heat-net/state/heat/degrees.json','.local/heat-net/state/heat/trophies.json'].map(f=>path.join(gameRoot,f));
const hashes=()=>protectedFiles.map(f=>fs.existsSync(f)?crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null);
async function environment(options={}){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'heat-client-gateway-')),fixtures=createFixtures(path.join(temp,'tls'));let offset=0;const now=()=>Date.now()/1000+offset,worldId='isolated-client-gateway';
 const host=createAuthorityHost({gameRoot,stateDir:path.join(temp,'world'),worldId,toastSpki:fixtures.toastSpki,tls:{ca:fixtures.ca,...fixtures.server},now});
 await new Promise(r=>host.server.listen(0,'127.0.0.1',r));
 const remote={endpoint:'https://127.0.0.1:'+host.server.address().port,world_id:worldId,server_spki:fixtures.serverSpki,ca:fixtures.ca,...fixtures.toast};
 const state=path.join(temp,'heat'),bridge=createVisitorServer({root,gameRoot,stateDir:state,remoteAuthority:remote,clientEnabled:true,now,daBomb:options.daBomb});
 await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+bridge.server.address().port;
 let loseAdmission=false;const playerRequest=bridge.playerRequest;bridge.playerRequest=async(...args)=>{const value=await playerRequest(...args);if(loseAdmission&&['room','dabomb'].includes(args[2])&&args[3].action==='admission'){loseAdmission=false;const error=new Error('Fixture admission reply lost after commit.');error.retryable=true;throw error;}return value;};
 const gateway=createPlayerGateway({bridge,worldId,tls:fixtures.player});await new Promise(r=>gateway.server.listen(0,'127.0.0.1',r));
 const trust={endpoint:'https://127.0.0.1:'+gateway.server.address().port,world_id:worldId,server_spki:fixtures.playerSpki,ca:fixtures.ca},links=[],natives=[],children=[];
 async function account(name){const password=crypto.randomBytes(24).toString('hex'),r=await fetch(base+'/api/visitor/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:name,display_name:name,password,adopt_local:false})});assert.equal(r.status,200);return{username:name,password,...(await r.json()).account};}
 const link=()=>{const l=createPlayerLink(trust);links.push(l);return l;};
 async function native(spawnGame){const n=createPlayerBridge({trust,now,clientUI:{root,gameRoot,spawnGame}});natives.push(n);await new Promise(r=>n.server.listen(0,'127.0.0.1',r));return n;}
 async function close(){for(const child of children)if(child.exitCode===null)child.kill();for(const n of natives)await n.close();for(const l of links)l.close();await gateway.close();await new Promise(r=>bridge.server.close(r));await host.close();const safe=fs.realpathSync(temp);assert.ok(safe.startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(safe,{recursive:true,force:true});}
 return{temp,fixtures,state,trust,account,link,native,children,bridge,advance:s=>offset+=s,loseRoomAdmission:()=>loseAdmission=true,close};
}
const uiCookies=new WeakMap();
async function ui(native,route,input,headers={}){
 const base='http://127.0.0.1:'+native.server.address().port;const r=await fetch(base+'/api/visitor'+route,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(uiCookies.get(native)?{Cookie:uiCookies.get(native)}:{}),...(input===undefined?{}:{Origin:base}),...headers},body:input===undefined?undefined:JSON.stringify(input)});
 const set=r.headers.get('set-cookie');if(set)uiCookies.set(native,set.split(';')[0]);
 return{status:r.status,headers:r.headers,data:await r.json()};
}
const room=(l,action,data={})=>l.call('room',{action,data}),messenger=(l,action,data={})=>l.call('messenger',{action,data});
test('Quake gateway reuses bound local UI sessions, retries lost match admission once, rejects cross-game launch and clears remote seats',{skip:!available||!process.env.HEAT_TEST_LAN_ADDRESS,timeout:30000},async()=>{
 const udp=require('node:dgram').createSocket('udp4');await new Promise(r=>udp.bind(0,'127.0.0.1',r));const port=udp.address().port;udp.close();
 const before=hashes(),app=await environment({daBomb:{bind:process.env.HEAT_TEST_LAN_ADDRESS,port}}),mockChildren=[];
 try{const accounts=[await app.account('quake_gateway_alpha'),await app.account('quake_gateway_beta')],mockSpawn=(exe,args)=>{assert.match(exe,/fteqw64\.exe$/);assert.ok(args.includes(process.env.HEAT_TEST_LAN_ADDRESS+':'+port));const c=new EventEmitter();mockChildren.push(c);return c;},natives=[await app.native(mockSpawn),await app.native(mockSpawn)];
  for(let i=0;i<2;i++){assert.equal((await ui(natives[i],'/auth/login',{username:accounts[i].username,password:accounts[i].password})).status,200);assert.equal((await ui(natives[i],'/client/da-bomb/join',{})).status,200);assert.equal((await ui(natives[i],'/client/da-bomb/ready',{ready:true})).status,200);}
  assert.equal((await ui(natives[0],'/client/da-bomb/play',{generation:1},{Cookie:''})).status,401);assert.equal((await ui(natives[0],'/client/da-bomb/start',{profile_id:accounts[1].profile_id})).status,400);
  const start=await ui(natives[0],'/client/da-bomb/start',{});assert.equal(start.status,200,JSON.stringify(start.data));const generation=start.data.generation;
  app.loseRoomAdmission();assert.equal((await ui(natives[0],'/client/da-bomb/play',{generation})).status,503);assert.equal(mockChildren.length,0);assert.equal((await ui(natives[0],'/client')).data.rooms['da-bomb'].launch_generation,generation);
  assert.equal((await ui(natives[0],'/client/da-bomb/play',{generation})).status,200);assert.equal((await ui(natives[0],'/client/da-bomb/play',{generation})).status,200);assert.equal((await ui(natives[1],'/client/da-bomb/play',{generation})).status,200);assert.equal(mockChildren.length,2);
  assert.equal((await ui(natives[0],'/client/play',{generation})).status,400);assert.equal((await ui(natives[0],'/auth/logout',{})).status,400);assert.equal(app.bridge.clientActiveGames(),2);
  mockChildren.forEach(c=>c.emit('exit',0));await pause(150);
  for(const n of natives){const value=(await ui(n,'/client')).data;assert.equal(value.client.games.find(g=>g.id==='da-bomb').running,false);assert.equal(value.rooms['da-bomb'].members.find(m=>m.profile_id===value.auth.account.profile_id).ready,false);assert.equal(value.degrees.balance,0);assert.equal((await ui(n,'/client/da-bomb/play',{generation})).status,400);}
  assert.equal(app.bridge.clientActiveGames(),0);
 }finally{mockChildren.forEach(c=>c.emit('exit',0));await pause(100);await app.close();assert.deepEqual(hashes(),before);}
});
async function raw(app,op,data,extra={}){
 const body=JSON.stringify({world_id:app.trust.world_id,request_id:crypto.randomBytes(32).toString('hex'),data,...extra.envelope});
 return new Promise((resolve,reject)=>{const q=https.request(new URL('/api/player/v1/'+op,app.trust.endpoint),{method:'POST',ca:app.fixtures.ca,agent:false,minVersion:'TLSv1.3',headers:{'Content-Type':'application/json',...extra.headers}},r=>{let t='';r.on('data',c=>t+=c);r.on('end',()=>resolve({status:r.statusCode,data:JSON.parse(t)}));});q.on('error',reject);q.end(body);});
}
test('gateway room/Messenger binds HEAT sessions, rejects identity/event/admin injection, isolates private pages and expires/logout seats',{skip:!available,timeout:60000},async()=>{
 const before=hashes(),app=await environment();try{
 const a=await app.account('gateway_alpha'),b=await app.account('gateway_beta'),c=await app.account('gateway_gamma'),alice=app.link(),bob=app.link(),charlie=app.link();
 for(const op of ['client','room','messenger'])assert.equal((await raw(app,op,op==='client'?{}:{action:'view',data:{}})).status,401);
 assert.equal((await raw(app,'room',{action:'join',data:{}},{envelope:{world_id:'wrong-world'}})).status,400);
 assert.equal((await raw(app,'client',{}, {headers:{Origin:'https://foreign.example'}})).status,400);
 await alice.call('login',{username:a.username,password:a.password});await bob.call('login',{username:b.username,password:b.password});await charlie.call('login',{username:c.username,password:c.password});
 const view=await alice.call('client');assert.equal(view.auth.account.profile_id,a.profile_id);assert.equal(view.auth.can_register,false);assert.equal(view.profiles,undefined);assert.equal(view.catalog.historical,undefined);assert.equal(view.client.world.checked_unix,0);assert.doesNotMatch(JSON.stringify(view),/password_hash|heat_session|PRIVATE KEY|\"token\"|\"ticket\"/);
 const healthLink=app.link();assert.equal(healthLink.signedIn,false);assert.equal((await healthLink.call('health')).ready,true);const checked=await alice.call('client');assert.equal(checked.client.world.ready,true);assert.ok(checked.client.world.checked_unix>0);const anonymous=await (await fetch('http://127.0.0.1:'+app.bridge.server.address().port+'/api/visitor/client')).json();assert.equal(anonymous.auth.account,null);assert.equal(anonymous.client.world.ready,true);assert.equal(anonymous.degrees,null);assert.equal(checked.degrees.balance,0);
 await assert.rejects(room(alice,'join',{profile_id:b.profile_id}),/identity/);await room(alice,'join');await pause(10);await room(bob,'join');assert.equal((await bob.call('client')).room.members.length,2);
 const id=crypto.randomUUID(),r=await room(alice,'chat',{request_id:id,text:'One shared room.'});assert.equal((await room(alice,'chat',{request_id:id,text:'One shared room.'})).duplicate,true);await assert.rejects(room(alice,'chat',{request_id:id,text:'changed'}),/another message/);assert.equal((await bob.call('client')).room.messages.length,1);
 await messenger(alice,'presence',{status:'online'});await messenger(bob,'presence',{status:'away'});assert.equal((await messenger(alice,'view')).players.find(p=>p.profile_id===b.profile_id).status,'away');
 const page={to:b.profile_id,text:'Private, plain text <script>no code</script>',request_id:crypto.randomUUID()};await messenger(alice,'send',page);assert.equal((await messenger(alice,'send',page)).duplicate,true);
 await assert.rejects(messenger(alice,'send',{...page,from:c.profile_id}),/recipient/);await assert.rejects(messenger(alice,'send',{...page,to:c.profile_id}),/different page/);
 assert.equal((await messenger(bob,'thread',{player:a.profile_id,before:0})).messages.length,1);assert.equal((await messenger(charlie,'thread',{player:a.profile_id,before:0})).messages.length,0);
 await assert.rejects(messenger(charlie,'thread',{player:a.profile_id,before:0,self_id:b.profile_id}),/history position/);
 await messenger(bob,'contact',{player:a.profile_id,action:'block',enabled:true});await assert.rejects(messenger(alice,'send',{...page,request_id:crypto.randomUUID()}),/blocked/);
 await assert.rejects(messenger(alice,'event',{}),/Unsupported/);await assert.rejects(room(alice,'spawn',{exe:'cmd.exe'}),/Unknown/);
 assert.equal((await alice.call('client')).degrees.balance,0);app.advance(46);assert.equal((await alice.call('client')).room.joined,false);
 await room(alice,'join');await room(bob,'join');await room(alice,'ready',{ready:true});await alice.call('logout');assert.equal((await bob.call('client')).room.members.length,1);assert.equal((await bob.call('client')).room.host_id,b.profile_id);await assert.rejects(room(alice,'heartbeat'),e=>e.playerStatus===401);
 app.advance(7*86400+1);await assert.rejects(bob.call('client'),e=>e.playerStatus===401);assert.equal(bob.signedIn,false);
 }finally{await app.close();assert.deepEqual(hashes(),before);}
});
test('two existing native UI listeners use shared gateway room launch, real Godot/mTLS actions, awards once, return and replay rejection',{skip:!available||!fs.existsSync(runtime),timeout:60000},async()=>{
 const before=hashes(),app=await environment(),results=[];try{
 const accounts=[await app.account('client_native_alpha'),await app.account('client_native_beta')];
 const spawnFor=index=>(exe,args,options)=>{assert.equal(exe,runtime);assert.equal(options.shell,false);assert.ok(args.includes('scripts/multiplayer_client.gd'));const out=path.join(app.temp,'result-'+index+'.json');
  const rest=args.slice(args.indexOf('--')+1),child=spawn(exe,['--headless','--path',path.join(gameRoot,'playable'),'--script','tests/run_shared_e2e.gd','--',...rest,'--test-camp='+(735+index),'--test-output='+out],{windowsHide:true});app.children.push(child);
  results[index]=new Promise((resolve,reject)=>{let log='';child.stdout.on('data',c=>log+=c);child.stderr.on('data',c=>log+=c);child.once('error',reject);child.once('close',code=>{try{assert.equal(code,0,log);assert.match(log,/SHARED_NATIVE_E2E_OK/);resolve(JSON.parse(fs.readFileSync(out)));}catch(e){reject(e);}});});return child;};
 const natives=[await app.native(spawnFor(0)),await app.native(spawnFor(1))];
 for(let i=0;i<2;i++){
  assert.equal((await ui(natives[i],'/client')).data.auth.account,null);assert.equal((await ui(natives[i],'/auth/register',{username:'no_remote_registration'})).status,400);
  const auth=await ui(natives[i],'/auth/login',{username:accounts[i].username,password:accounts[i].password});assert.equal(auth.status,200);assert.match(auth.headers.get('set-cookie'),/^heat_client_[0-9]+=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict$/);assert.doesNotMatch(auth.headers.get('set-cookie'),/heat_session=/);
  const anon=await ui(natives[i],'/client',undefined,{Cookie:''});assert.equal(anon.data.auth.account,null);assert.deepEqual(anon.data.room.messages,[]);assert.equal((await ui(natives[i],'/client/ready',{ready:true},{Cookie:''})).status,401);
  assert.equal((await ui(natives[i],'/client/join',{})).status,200);assert.equal((await ui(natives[i],'/client/ready',{ready:true})).status,200);
 }
 assert.equal((await ui(natives[1],'/client/start',{})).status,400);
 assert.equal((await ui(natives[0],'/client/chat',{request_id:crypto.randomUUID(),text:'Gateway group.'},{Origin:'http://foreign.example'})).status,400);
 const start=await ui(natives[0],'/client/start',{});assert.equal(start.status,200);const generation=start.data.generation;assert.equal((await ui(natives[0],'/client/start',{})).data.generation,generation);
 assert.equal((await ui(natives[1],'/client/play',{generation:generation+1})).status,400);assert.equal(app.children.length,0);
 app.loseRoomAdmission();assert.equal((await ui(natives[0],'/client/play',{generation})).status,503);assert.equal(app.children.length,0);assert.equal((await ui(natives[0],'/client')).data.room.launch_generation,generation);
 const launched=await Promise.all([ui(natives[0],'/client/play',{generation}),ui(natives[0],'/client/play',{generation}),ui(natives[1],'/client/play',{generation})]);assert.ok(launched.every(r=>r.status===200));assert.equal(app.children.length,2);
 assert.equal((await ui(natives[0],'/auth/logout',{})).status,400);assert.equal((await ui(natives[1],'/client/ready',{ready:false})).status,400);
 const observed=await Promise.all(results);await pause(250);
 for(let i=0;i<2;i++){assert.equal(observed[i].world.world_id,app.trust.world_id);assert.equal(observed[i].world.tick_hz,30);assert.equal(observed[i].world.camps.length,2);assert.ok(observed[i].world.camps.every(c=>c.nerve_center_online));assert.ok(observed[i].world.camps.find(c=>c.owner_id===observed[i].profile_id).mined>0);
  const home=(await ui(natives[i],'/client')).data;assert.equal(home.degrees.balance,100);assert.equal(home.trophies.granted.length,1);assert.equal(home.client.games[0].running,false);assert.equal(home.room.members.find(m=>m.profile_id===accounts[i].profile_id).ready,false);
  assert.equal((await ui(natives[i],'/client')).data.degrees.balance,100);assert.equal((await ui(natives[i],'/client/play',{generation})).status,400);
 }
 assert.equal(app.bridge.clientActiveGames(),0);
 await ui(natives[0],'/auth/logout',{});assert.equal((await ui(natives[0],'/client')).data.auth.account,null);assert.equal((await ui(natives[1],'/client')).data.room.members.length,1);
 if(process.env.HEAT_CLIENT_REVIEW_DIR)fs.writeFileSync(path.join(process.env.HEAT_CLIENT_REVIEW_DIR,'native-gateway-result.json'),JSON.stringify({pass:true,actual_native_clients:2,per_pc_listener_reused:true,authenticated_gateway:true,real_mtls_authority:true,shared_world:app.trust.world_id,simulation_hz:30,constructed_and_mined:true,existing_degrees_each:100,first_claim_each:1,duplicate_awards:false,return_and_replay_checked:true,same_machine_loopback:true,two_physical_pcs:false,harbinger_access:false,live_accounts_changed:false},null,2));
 }finally{await app.close();assert.deepEqual(hashes(),before);}
});

test('two real browser clients reuse native listeners, bind local cookies, preserve drafts and coordinate room/Messenger launch/return',{skip:!available,timeout:90000},async()=>{
 const {createRequire}=require('node:module'),{chromium}=createRequire('C:/Users/fillt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_heat-client-gateway.cjs')('playwright');
 const before=hashes(),app=await environment(),mockChildren=[];let browser;try{
 const accounts=[await app.account('browser_gateway_alpha'),await app.account('browser_gateway_beta')];
 const mockedSpawn=()=>{const child=new EventEmitter();child.pid=900000+mockChildren.length;mockChildren.push(child);return child;};
 const natives=[await app.native(mockedSpawn),await app.native(mockedSpawn)];browser=await chromium.launch({headless:true,channel:'msedge'});
 const contexts=[await browser.newContext({viewport:{width:1360,height:900}}),await browser.newContext({viewport:{width:1024,height:768}})],pages=[await contexts[0].newPage(),await contexts[1].newPage()],errors=[];
 for(let i=0;i<2;i++){const p=pages[i];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+natives[i].server.address().port+'/site/client/index.html');await p.locator('#connection').getByText('HEAT connected').waitFor();assert.equal(await p.locator('#create-tab').isVisible(),false);await p.locator('#username').fill(accounts[i].username);await p.locator('#password').fill(accounts[i].password);await p.locator('#auth-submit').click();await p.locator('#workspace').waitFor();const cookies=await contexts[i].cookies();assert.ok(cookies.some(c=>c.name==='heat_client_'+natives[i].server.address().port&&c.httpOnly&&c.sameSite==='Strict'));assert.ok(cookies.every(c=>c.name!=='heat_session'));await p.locator('#join-room').click();await p.waitForFunction(()=>window.heatClient.state.room.joined&&!window.heatClient.busy);}
 const [a,b]=pages,refresh=async p=>{await p.evaluate(()=>window.heatClient.refresh(true));await p.waitForFunction(()=>!window.heatClient.busy);};
 await a.locator('#room-text').fill('Two browser clients, one shared HEAT room.');await a.locator('#room-send').click();await a.waitForFunction(()=>!window.heatClient.busy);await refresh(b);await b.locator('#room-log').getByText('Two browser clients, one shared HEAT room.',{exact:true}).waitFor();
 await a.locator('[data-view="friends"]').click();await refresh(a);await a.locator('#people [data-peer="'+accounts[1].profile_id+'"]').click();await a.locator('#private-text').fill('Gateway private page.');await a.locator('#private-send').click();await a.waitForFunction(()=>!window.heatClient.busy);await b.locator('[data-view="friends"]').click();await refresh(b);await b.locator('#people [data-peer="'+accounts[0].profile_id+'"]').click();await b.locator('#private-log').getByText('Gateway private page.',{exact:true}).waitFor();
 await a.locator('#private-text').fill('Draft remains in this browser.');await a.locator('#private-text').focus();await a.locator('#private-text').evaluate(e=>e.setSelectionRange(6,13));for(let i=0;i<10;i++)await refresh(a);assert.deepEqual(await a.locator('#private-text').evaluate(e=>({value:e.value,start:e.selectionStart,end:e.selectionEnd,focused:document.activeElement===e})),{value:'Draft remains in this browser.',start:6,end:13,focused:true});
 for(const p of pages){await p.locator('[data-view="games"]').click();await p.locator('#ready').click();await p.waitForFunction(()=>!window.heatClient.busy);}await refresh(a);await a.locator('#play').click();await a.waitForFunction(()=>window.heatClient.state.client.games[0].running&&!window.heatClient.busy);await refresh(b);await b.waitForFunction(()=>window.heatClient.state.client.games[0].running&&!window.heatClient.busy);assert.equal(mockChildren.length,2);assert.equal(await a.locator('#signout').isDisabled(),true);
 mockChildren.forEach(c=>c.emit('exit',0));await pause(150);for(const p of pages){await refresh(p);assert.equal(await p.locator('#signout').isDisabled(),false);assert.equal(await p.evaluate(()=>window.heatClient.state.degrees.balance),0);}
 await a.locator('#signout').click();await a.locator('#auth-view').waitFor();assert.equal(await a.locator('#password').inputValue(),'');assert.deepEqual(errors,[]);
 if(process.env.HEAT_CLIENT_REVIEW_DIR)fs.writeFileSync(path.join(process.env.HEAT_CLIENT_REVIEW_DIR,'browser-gateway-result.json'),JSON.stringify({pass:true,real_browser_contexts:2,existing_native_listener_only:true,real_https_gateway_and_account_messenger:true,ephemeral_http_only_local_binding:true,no_heat_cookie_in_browser:true,room_chat_readiness_auto_launch_return:true,draft_caret_focus_after_10_polls:true,game_process_mocked:true,degrees_from_mocked_game:0,physical_two_pc:false,harbinger_access:false},null,2));
 }finally{mockChildren.forEach(c=>c.emit('exit',0));await pause(150);if(browser)await browser.close();await app.close();assert.deepEqual(hashes(),before);}
});
