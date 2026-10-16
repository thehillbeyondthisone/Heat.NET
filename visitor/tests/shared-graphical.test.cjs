'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {createFixtures,available}=require('./remote-tls-fixtures.cjs'),{createAuthorityHost}=require('../authority-host.cjs'),{createVisitorServer}=require('../server.cjs'),{createPlayerGateway}=require('../player-gateway.cjs'),{createPlayerBridge}=require('../player-bridge.cjs');
const gameRoot=path.resolve(__dirname,'../../../..'),heatRoot=path.resolve(__dirname,'../..'),runtime=path.join(gameRoot,'recovery/runtime/Godot.exe');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evidence=process.env.HEAT_GRAPHICAL_REVIEW_DIR||path.join(gameRoot,'.local/shared-3d-20261011/two-graphical');
const staged=path.join(gameRoot,'.local/shared-3d-20261011/staged-multiplayer-client.gd');
const entry=process.env.HEAT_GRAPHICAL_ENTRY||(fs.existsSync(staged)?staged:path.join(gameRoot,'playable/scripts/multiplayer_client.gd'));
function protectedHashes(){
 const files=['saves/first-plot.json','saves/first-plot.json.bak','saves/heat-net/accounts.json','saves/heat-net/degrees.json','saves/heat-net/trophies.json','runtime/node.exe','recovery/runtime/Godot.exe'];
 for(const dir of ['.local/heat-net/config','.local/heat-net/credentials','.local/heat-net/trust','.local/heat-net/state/heat','.local/heat-net-signing']){
  const walk=p=>{if(!fs.existsSync(p))return;for(const f of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,f.name);if(f.isDirectory())walk(full);else if(f.isFile())files.push(path.relative(gameRoot,full));}};walk(path.join(gameRoot,dir));
 }
 return Object.fromEntries(files.map(relative=>{const p=path.join(gameRoot,relative);return[relative,fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null];}));
}
test('existing 3D game: two actual graphical HEAT clients, private inventory, authoritative actions and persistent reconnect awards',{skip:!available||!fs.existsSync(runtime),timeout:240000},async()=>{
 fs.mkdirSync(evidence,{recursive:true});if(fs.existsSync(path.join(evidence,'RESULT.json')))fs.unlinkSync(path.join(evidence,'RESULT.json'));const before=protectedHashes(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'heat-shared-3d-')),worldId='isolated-shared-3d-v2';
 const material=createFixtures(path.join(temp,'tls')),worldState=path.join(temp,'world');let host,bridge,gateway;const natives=[],children=[],cookies=new WeakMap(),runs=[],accounts=[];let phase='initial',hostPort;
 const createHost=()=>createAuthorityHost({gameRoot,stateDir:worldState,worldId,toastSpki:material.toastSpki,tls:{ca:material.ca,...material.server}});
 async function localAPI(base,route,input,cookie=''){
  const res=await fetch(base+'/api/visitor'+route,{method:input===undefined?'GET':'POST',headers:{Cookie:cookie,...(input===undefined?{}:{Origin:base,'Content-Type':'application/json'})},body:input===undefined?undefined:JSON.stringify(input)});
  return{status:res.status,data:await res.json(),cookie:(res.headers.get('set-cookie')||'').split(';')[0]};
 }
 async function ui(native,route,input){const base='http://127.0.0.1:'+native.server.address().port,r=await localAPI(base,route,input,cookies.get(native)||'');if(r.cookie)cookies.set(native,r.cookie);return r;}
 async function until(condition,seconds=12){const end=Date.now()+seconds*1000;while(Date.now()<end){if(await condition())return;await pause(100);}throw new Error('Fixture condition did not complete.');}
 function launch(index){return(exe,args,options)=>{
  assert.equal(exe,runtime);assert.equal(options.shell,false);assert.ok(args.includes('scripts/multiplayer_client.gd'));
  const output=path.join(evidence,phase+'-'+index);fs.mkdirSync(output,{recursive:true});
  const planDir=path.join(temp,phase+'-'+index);fs.mkdirSync(planDir,{recursive:true});const plan=path.join(planDir,'plan.json');
  fs.writeFileSync(plan,JSON.stringify({world:worldId,output,phase,camp:701+index,corporation:index===0?'bruteforce':'toyco'}));
  const launchedArgs=args.slice(),scriptIndex=launchedArgs.indexOf('--script')+1;launchedArgs[scriptIndex]=entry;
  launchedArgs.splice(launchedArgs.indexOf('--'),0,'--log-file',path.join(output,'runtime.log'));
  if(process.env.HEAT_GRAPHICAL_VERBOSE==='1')launchedArgs.unshift('--verbose');
  launchedArgs.push('--shared-review-world='+worldId,'--shared-review-plan='+plan);
  const child=spawn(exe,launchedArgs,{...options,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
  const result=new Promise((resolve,reject)=>{
   let consoleText='';child.stdout.on('data',part=>consoleText+=part);child.stderr.on('data',part=>consoleText+=part);
   child.once('error',reject);child.once('close',code=>{
    fs.writeFileSync(path.join(output,'console.log'),consoleText);
    try{assert.equal(code,0,consoleText.split(/\r?\n/).filter(line=>/^SCRIPT ERROR:|^ERROR:/.test(line)).join('\n'));
     const report=JSON.parse(fs.readFileSync(path.join(output,'report.json')));assert.equal(report.pass,true,JSON.stringify(report));assert.equal(report.local_sim_steps,0);
     const errors=consoleText.split(/\r?\n/).filter(line=>/^SCRIPT ERROR:|^ERROR:/.test(line));assert.equal(errors.length,0,errors.join('\n'));resolve({output,report,pid:child.pid});
    }catch(error){reject(error);}
   });
  });result.catch(()=>{});runs.push({phase,index,result});return child;
 };}
 try{
  host=createHost();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));hostPort=host.server.address().port;
  const remote={endpoint:'https://127.0.0.1:'+hostPort,world_id:worldId,server_spki:material.serverSpki,ca:material.ca,...material.toast};
  bridge=createVisitorServer({root:heatRoot,gameRoot,stateDir:path.join(temp,'heat'),remoteAuthority:remote,clientEnabled:true});
  await new Promise(resolve=>bridge.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+bridge.server.address().port;
  gateway=createPlayerGateway({bridge,worldId,tls:material.player});await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));
  const trust={endpoint:'https://127.0.0.1:'+gateway.server.address().port,world_id:worldId,server_spki:material.playerSpki,ca:material.ca};
  for(let i=0;i<2;i++){
   const username='graphical_'+i,password=crypto.randomBytes(24).toString('hex');
   const created=await localAPI(base,'/auth/register',{username,display_name:'Isolated pioneer '+i,password,adopt_local:false});assert.equal(created.status,200);
   accounts.push({username,password,...created.data.account});
   const native=createPlayerBridge({trust,clientUI:{root:heatRoot,gameRoot,spawnGame:launch(i)}});natives.push(native);await new Promise(resolve=>native.server.listen(0,'127.0.0.1',resolve));
   assert.equal((await ui(native,'/auth/login',{username,password})).status,200);assert.equal((await ui(native,'/client/join',{})).status,200);
  }
  async function round(){
   for(const native of natives)assert.equal((await ui(native,'/client/ready',{ready:true})).status,200);
   const generation=(await ui(natives[0],'/client/start',{})).data.generation;assert.ok(generation>0);
   await Promise.all(natives.map(async native=>assert.equal((await ui(native,'/client/play',{generation})).status,200)));
   const observed=await Promise.all(runs.filter(run=>run.phase===phase).map(run=>run.result));
   await until(()=>bridge.clientActiveGames()===0);await pause(200);
   const awards=[];
   for(const native of natives){
    const home=(await ui(native,'/client')).data;
    assert.equal(home.degrees.balance,100);assert.equal(home.trophies.granted.length,1);assert.equal(home.client.games[0].running,false);
    const retry=(await ui(native,'/client')).data;assert.equal(retry.degrees.balance,100);assert.equal(retry.trophies.granted.length,1);
    awards.push({degrees:home.degrees.balance,trophies:home.trophies.granted.length});
   }
   return{observed,awards};
  }
  const initial=await round();assert.equal(children.length,2);assert.ok(initial.observed.every(run=>run.report.camps_seen.length===2&&run.report.mined>0));
  await host.close();host=createHost();await new Promise(resolve=>host.server.listen(hostPort,'127.0.0.1',resolve));
  phase='reconnect';const reconnect=await round();assert.equal(children.length,4);
  assert.deepEqual(reconnect.awards,initial.awards);
  assert.ok(reconnect.observed.every(run=>run.report.progress.nc===1&&run.report.progress.well===1&&run.report.mined>0));
  const report={pass:true,same_machine_loopback:true,two_physical_pcs:false,real_graphical_windows:4,simultaneous_clients:2,mtls_authority:true,actual_existing_game:true,authority_restarted:true,protocol:2,initial:initial.observed.map(x=>x.report),reconnect:reconnect.observed.map(x=>x.report),awards:reconnect.awards,awards_duplicated:false,local_simulation_steps:0,live_accounts_changed:false,screenshots:runs.map(run=>path.join(run.phase+'-'+run.index,'owned-riding.png'))};
  fs.writeFileSync(path.join(evidence,'RESULT.json'),JSON.stringify(report,null,2));console.log('SHARED_3D_GRAPHICAL_OK '+JSON.stringify({windows:4,clients:2,awards:report.awards,isolated:true}));
 }finally{
  for(const child of children)if(child.exitCode===null)child.kill();
  await pause(300);for(const native of natives)await native.close();
  if(gateway)await gateway.close();if(bridge)await new Promise(resolve=>bridge.server.close(resolve));if(host)await host.close();
  assert.deepEqual(protectedHashes(),before);
  const resolved=fs.realpathSync(temp);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});
 }
});
