'use strict';
// Browser UI on the existing per-PC native listener. HEAT TLS cookie/admissions stay in this owner.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),C=require('./authority-contract.cjs');
const Q=require('./da-bomb.cjs');
function createPlayerClient({link,admission,stopGame,root,gameRoot,spawnGame=spawn}){
  root=path.resolve(root);gameRoot=path.resolve(gameRoot);let game=null,gameId='',account=null,clientCookie='',pendingGeneration=0,pendingBomb=0,lastError='',pending=0,queue=Promise.resolve();
  const exact=(d,keys)=>C.exact(d,keys),installed=()=>fs.existsSync(path.join(gameRoot,'recovery/runtime/Godot.exe'))&&fs.existsSync(path.join(gameRoot,'playable/project.godot'));
  const localGames=()=>[{id:'10six',title:'10Six',subtitle:'Planet Visitor',supported:true,installed:installed(),running:Boolean(game),local_plot:false,joined:false,artwork:'/site/images/games/10six_shoot_45.jpg'},
    {id:Q.ID,title:'Quake / Da Bomb',supported:true,installed:Q.installed(gameRoot),running:gameId===Q.ID,kind:'match'},
    {id:'quake2',title:'Quake II',supported:false,installed:false,reason:'Client integration and multiplayer verification are still pending.'},
    {id:'scud',title:'Scud',supported:false,installed:false,reason:'Client integration and multiplayer verification are still pending.'}];
  const anonymous=()=>({version:1,identity:null,auth:{account:null,enabled:true,can_adopt:false,can_register:false,host_pc:false},degrees:null,trophies:null,catalog:{visitor:[]},rules:{},
    multiplayer:{transport:'player-https'},client:{version:1,scope:'Desktop HEAT accounts on Toast',coordination:'authenticated-gateway-v1',world:{ready:null,checked_unix:0,message:'Availability is checked when you Play.'},games:localGames()},
    room:{joined:false,members:[],messages:[],launch_generation:0},errors:lastError?[lastError]:[]});
  const cookieName=()=> 'heat_client_'+address();
  function owns(req){const found=new RegExp('(?:^|;\\s*)'+cookieName()+'=([a-f0-9]{64})(?:;|$)').exec(req.headers.cookie||'');return Boolean(clientCookie&&found?.[1]===clientCookie);}
  function bind(res,clear=false){clientCookie=clear?'':crypto.randomBytes(32).toString('hex');res.setHeader('Set-Cookie',cookieName()+'='+clientCookie+'; Path=/; HttpOnly; SameSite=Strict'+(clear?'; Max-Age=0':''));}
  async function snapshot(req){
    if(!owns(req))return anonymous();
    if(!link.signedIn){account=null;clientCookie='';return anonymous();}
    let value;try{value=await link.call('client');}catch(error){if(error.playerStatus===401){account=null;clientCookie='';lastError='Your HEAT sign-in ended. Close any active game and sign in again.';return anonymous();}throw error;}
    account=value.auth.account;value.auth.can_register=false;value.auth.host_pc=false;value.multiplayer.transport='player-https';
    for(const item of value.client.games){if(item.id==='10six'){item.installed=installed();item.running=gameId==='10six'||item.running;}if(item.id===Q.ID){item.installed=Q.installed(gameRoot);item.running=gameId===Q.ID;}}
    if(!game&&pendingGeneration&&value.room.current_generation===pendingGeneration)value.room.launch_generation=pendingGeneration;
    if(!game&&pendingBomb&&value.rooms?.[Q.ID]?.current_generation===pendingBomb)value.rooms[Q.ID].launch_generation=pendingBomb;
    if(lastError)value.errors=[lastError];return value;
  }
  async function returned(id='10six'){
    pendingGeneration=0;pendingBomb=0;
    try{if(id==='10six')await stopGame();if(link.signedIn)await link.call(id===Q.ID?'dabomb':'room',{action:'return',data:{}});}catch(error){if(error.playerStatus!==401)lastError='Game closed. Reconnect to refresh the room; no local award was created.';}
  }
  async function action(req,res,route,input){
    C.assert(C.plain(input),'Use client JSON.');
    if(route==='/auth/register')throw new Error('Create this desktop HEAT account on Toast, then sign in here.');
    if(route==='/auth/login'){C.assert(exact(input,['username','password'])&&!game,'Close the game before signing in.');const r=await link.call('login',input);account=r.account;bind(res);lastError='';return r;}
    if(!owns(req)){const error=new Error('Sign in to this player client.');error.playerStatus=401;throw error;}
    if(route==='/auth/logout'){C.assert(exact(input,[])&&!game,'Close the game before signing out.');if(link.signedIn){await stopGame();await link.call('logout');}account=null;bind(res,true);lastError='';return{ok:true};}
    C.assert(link.signedIn,'Sign in to your HEAT account first.');
    const bomb=/^\/client\/da-bomb\/(join|heartbeat|leave|ready|chat|check|start|play)$/.exec(route);
    if(bomb){
      if(bomb[1]!=='play'){if(['join','leave','ready','start'].includes(bomb[1]))C.assert(!game,'Close your game before changing the room.');return link.call('dabomb',{action:bomb[1],data:input});}
      C.assert(exact(input,['generation'])&&C.integer(input.generation,1),'Use the current Da Bomb generation.');
      if(game){C.assert(gameId===Q.ID,'Close your other game first.');return{ok:true,running:true};}
      C.assert(Q.installed(gameRoot),'The local Da Bomb files are unavailable.');pendingBomb=input.generation;
      let descriptor;try{descriptor=await link.call('dabomb',{action:'admission',data:input});}catch(error){if([400,401,403].includes(error.playerStatus))pendingBomb=0;throw error;}
      try{const child=Q.launchNative({gameRoot,descriptor,name:account?.username,spawnGame});game=child;gameId=Q.ID;pendingBomb=0;
        const clear=()=>{if(game===child){game=null;gameId='';queue=queue.then(()=>returned(Q.ID),()=>returned(Q.ID)).catch(()=>{});}};
        child.once('exit',clear);child.once('error',()=>{lastError='Da Bomb could not open. Check the files and ready up again.';clear();});return{ok:true,running:true};
      }catch(error){await returned(Q.ID);throw error;}
    }
    if(route==='/client/play'){
      C.assert(exact(input,['generation'])&&C.integer(input.generation,1),'Use the current room generation.');if(game){C.assert(gameId==='10six','Close your other game first.');return{ok:true,running:true};}
      C.assert(installed(),'The local 10Six client is unavailable.');pendingGeneration=input.generation;let ticket;
      try{ticket=await admission(input.generation);}catch(error){if(error.playerStatus===400||error.playerStatus===401||error.playerStatus===403)pendingGeneration=0;throw error;}
      try{
        const child=spawnGame(path.join(gameRoot,'recovery/runtime/Godot.exe'),['--path',path.join(gameRoot,'playable'),'--script','scripts/multiplayer_client.gd','--',
          '--shared-url=http://127.0.0.1:'+address(),'--shared-ticket='+ticket],{cwd:gameRoot,shell:false,windowsHide:false,stdio:'ignore'});
        game=child;gameId='10six';pendingGeneration=0;const clear=()=>{if(game===child){game=null;gameId='';queue=queue.then(()=>returned(),()=>returned()).catch(()=>{});}};child.once('exit',clear);child.once('error',()=>{lastError='10Six could not open. Check the game files and ready up again.';clear();});lastError='';
        return{ok:true,running:true,message:'10Six is opening. Participation is confirmed by the game server.'};
      }catch(error){await returned();throw error;}
    }
    const room=/^\/client\/(join|heartbeat|leave|ready|chat|check|start)$/.exec(route);
    if(room){if(['leave','ready','start'].includes(room[1]))C.assert(!game,'Close the game before changing the room.');return link.call('room',{action:room[1],data:input});}
    const messenger=/^\/messenger\/(presence|send|contact)$/.exec(route);
    if(messenger)return link.call('messenger',{action:messenger[1],data:input});
    throw new Error('Unsupported player client action.');
  }
  let address=()=>{throw new Error('Native listener not started.');};
  async function handle(req,res,port){
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(!url.pathname.startsWith('/site/')&&!url.pathname.startsWith('/api/visitor/')&&url.pathname!=='/')return false;
    // Native paths retain their existing separate bearer/Origin rules.
    if(url.pathname.startsWith('/api/visitor/multiplayer/'))return false;
    address=()=>port;
    const reply=(status,value)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}};
    let admitted=false;
    try{
      C.assert(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&req.headers.host==='127.0.0.1:'+port,'Use the local player client.');
      C.assert(!req.headers.origin||req.headers.origin==='http://127.0.0.1:'+port,'Use this client origin.');
      C.assert(pending<8,'Player client is busy.');pending++;admitted=true;
      if(url.pathname.startsWith('/api/visitor/')){
        const route=url.pathname.slice('/api/visitor'.length);
        if(req.method==='GET'){
          if(route==='/client'){C.assert(!url.search,'Client has no identity parameters.');reply(200,await snapshot(req));}
          else if(route==='/messenger'){
            C.assert(owns(req)&&link.signedIn&&[...url.searchParams.keys()].every(k=>['player','before'].includes(k)),'Sign in and use a bounded Messenger view.');
            const peer=url.searchParams.get('player'),before=Number(url.searchParams.get('before')||0);reply(200,await link.call('messenger',{action:peer?'thread':'view',data:peer?{player:peer,before}:{}}));
          }else throw new Error('Unsupported player client view.');
        }else{
          C.assert(req.method==='POST'&&req.headers.origin==='http://127.0.0.1:'+port&&!url.search&&/^application\/json(?:;|$)/i.test(req.headers['content-type']||''),'Use same-origin client JSON.');
          let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;C.assert(size<=16384,'Client request exceeds its limit.');chunks.push(chunk);}
          const input=JSON.parse(Buffer.concat(chunks));const work=queue.then(()=>action(req,res,route,input));queue=work.catch(()=>{});reply(200,await work);
        }
      }else{
        C.assert(['GET','HEAD'].includes(req.method)&&!url.search,'Use a read-only client page.');
        const relative=url.pathname==='/'?'site/client/index.html':url.pathname.slice(1);
        C.assert(/^site\/client\/(index\.html|client\.css|client\.js)$/.test(relative)||/^site\/images\/(ui|games|visitor-trophies)\/[a-zA-Z0-9_.-]+\.(png|jpg|gif|svg)$/.test(relative),'Page not available.');
        const target=path.resolve(root,relative);C.assert(target.startsWith(root+path.sep)&&!fs.lstatSync(target).isSymbolicLink()&&fs.statSync(target).size<=4*1024*1024,'Page not available.');
        const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml'}[path.extname(target)];
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(req.method==='HEAD'?'':fs.readFileSync(target));
      }
    }catch(error){reply(error.playerStatus||(error.code||/timed out/.test(error.message)?503:400),{error:error.code?'Player connection or page is unavailable. Retry the same action.':error instanceof SyntaxError?'Invalid client JSON.':error.message});}
    finally{if(admitted)pending--;}
    return true;
  }
  return{handle,get running(){return Boolean(game);},get account(){return link.signedIn?account:null;},async close(){C.assert(!game,'Close the active game before its client owner.');await queue;}};
}
module.exports={createPlayerClient};
