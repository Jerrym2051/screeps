'use strict'
// Host-side validation for the north-expansion + remote-crew dispatch (Task 2).
// NOT a game module — _deploy.js reads only top-level *.js, so files under tests/
// are never pushed to the server. Run: node tests/_validate_expansion.js
//
// Validates:
//  - northNeighbor(W9S58) === 'W9S57'
//  - expansion target is the NORTH neighbor (when south/east are also unseen)
//  - remote harvester/haulers/builders fire ONLY after the north room is CLAIMED+visible
//  - the latent `defense is not defined` crash (countRemoteSources) is gone: a visible
//    OWNED neighbor no longer throws, because config no longer depends on defense.js.

// ---- Screeps global constants (must precede require('../config')) ----
const SC = { WORK:'work',CARRY:'carry',MOVE:'move',CLAIM:'claim',TOUGH:'tough',
  ATTACK:'attack',RANGED_ATTACK:'ranged_attack',HEAL:'heal' };
const BC = { [SC.WORK]:100,[SC.CARRY]:50,[SC.MOVE]:50,[SC.CLAIM]:600,[SC.ATTACK]:30,
  [SC.RANGED_ATTACK]:150,[SC.HEAL]:150,[SC.TOUGH]:10 };
const RE='energy';
const F = { SOURCES:'sources',MY_SPAWNS:'mySpawns',CONSTRUCTION_SITES:'sites',
  DROPPED_RESOURCES:'drops',HOSTILE_CREEPS:'hostiles',STRUCTURES:'structures',
  MY_STRUCTURES:'myStructures',SOURCES_ACTIVE:'sources_active',MINERALS:'minerals' };
const OK=0,ERR_NOT_IN_RANGE=-9;
Object.assign(globalThis,{WORK:SC.WORK,CARRY:SC.CARRY,MOVE:SC.MOVE,CLAIM:SC.CLAIM,TOUGH:SC.TOUGH,
  ATTACK:SC.ATTACK,RANGED_ATTACK:SC.RANGED_ATTACK,HEAL:SC.HEAL,BODYPART_COST:BC,RESOURCE_ENERGY:RE,
  STRUCTURE_CONTAINER:'container',STRUCTURE_SPAWN:'spawn',STRUCTURE_EXTENSION:'extension',
  STRUCTURE_TOWER:'tower',STRUCTURE_ROAD:'road',STRUCTURE_RAMPART:'rampart',
  STRUCTURE_STORAGE:'storage',FIND_SOURCES:F.SOURCES,FIND_MY_SPAWNS:F.MY_SPAWNS,
  FIND_CONSTRUCTION_SITES:F.CONSTRUCTION_SITES,FIND_DROPPED_RESOURCES:F.DROPPED_RESOURCES,
  FIND_HOSTILE_CREEPS:F.HOSTILE_CREEPS,FIND_STRUCTURES:F.STRUCTURES,
  FIND_MY_STRUCTURES:F.MY_STRUCTURES,FIND_SOURCES_ACTIVE:F.SOURCES_ACTIVE,
  FIND_MINERALS:F.MINERALS,OK,ERR_NOT_IN_RANGE,CREEP_SPAWN_TIME:3});

function RoomPosition(x,y,roomName){this.x=x;this.y=y;this.roomName=roomName;}
RoomPosition.prototype.getRangeTo=function(o){const p=(o&&o.pos)||o;return p?Math.max(Math.abs(this.x-p.x),Math.abs(this.y-p.y)):NaN;};
globalThis.RoomPosition=RoomPosition;
function mkStore(cap,used){return{getUsedCapacity:()=>used,getFreeCapacity:()=>Math.max(0,cap-used),getCapacity:()=>cap};}
function srcOf(id,rn){return{id,pos:new RoomPosition(id==='src0'?4:27,id==='src0'?14:20,rn)};}
function mkRoom(name,opts){
  opts=opts||{};
  const srcs=[];for(let i=0;i<(opts.sourcesCount||2);i++)srcs.push(srcOf('src'+i,name));
  const spawns=opts.spawn?[{structureType:'spawn',pos:new RoomPosition(18,17,name),store:mkStore(300,0),my:true,id:'sp'+name}]:[];
  const storage=opts.storage?{structureType:'storage',pos:new RoomPosition(19,17,name),store:mkStore(1000000,50000),my:true,id:'st'+name}:null;
  const tower=opts.tower?[{structureType:'tower',pos:new RoomPosition(18,18,name),store:mkStore(2000,810),my:true,id:'tw'+name}]:[];
  const structs=[].concat(spawns).concat(tower).concat(storage?[storage]:[]);
  return{
    name,energyAvailable:opts.bank!=null?opts.bank:100,energyCapacityAvailable:opts.cap!=null?opts.cap:1300,
    storage,controller:opts.controller,
    find:(type,o)=>{const f=o&&o.filter;let a;
      switch(type){case F.SOURCES:a=srcs;break;case F.MY_SPAWNS:a=spawns;break;
        case F.CONSTRUCTION_SITES:a=opts.sites||[];break;case F.DROPPED_RESOURCES:a=[];break;
        case F.HOSTILE_CREEPS:a=[];break;case F.STRUCTURES:a=structs;break;
        case F.MY_STRUCTURES:a=structs;break;case F.SOURCES_ACTIVE:a=srcs;break;
        case F.MINERALS:a=[];break;default:a=[];}
      return f?a.filter(f):a.slice();},
    findExitTo:()=>-10
  };
}
const config=require('../config');
const memoryClear=()=>{globalThis.Memory={rooms:{},creeps:{}}};
function mkGame(time,rooms,creeps){globalThis.Game={rooms:rooms,creeps:creeps||{},time:time,cpu:{getUsed:()=>1,limit:10}};return globalThis.Game;}

let PASS=0,FAIL=0;
function assert(c,m){if(c){PASS++;console.log('  ok  '+m);}else{FAIL++;console.log('  FAIL '+m);}}

// Home room: RCL4, full bank, spawn+tower+storage, 2 sources.
function home(){return mkRoom('W9S58',{bank:900,controller:{my:true,level:4,reservation:null},
  sourcesCount:2,spawn:true,tower:true,storage:true,sites:[]});}

console.log('\nTEST A: north neighbor name + north is the expansion target');
memoryClear();mkGame(1000,{'W9S58':home()},null);Memory.rooms['W9S58']={stage:'home'};
assert(config.northNeighbor('W9S58')==='W9S57','northNeighbor(W9S58)=W9S57 (got '+config.northNeighbor('W9S58')+')');
let t;let threw=false;let err='';
try{ t=config.getTargets(home()); }catch(e){threw=true;err=e.message;}
assert(!threw,'getTargets(home) does not throw (got: '+(threw?err:'ok')+')');
assert(t&&t.claimerTarget==='W9S57','claimerTarget=north W9S57 (got '+(t&&t.claimerTarget)+')');
assert(t&&t.claimer===1,'claimer=1 while north is unclaimed (got '+(t&&t.claimer)+')');

console.log('\nTEST B: remote crew dispatch + defense fix (north CLAIMED+visible)');
memoryClear();const northC=mkRoom('W9S57',{controller:{my:true,level:1,reservation:null},
  sourcesCount:1,spawn:false,tower:false,storage:false,sites:[],bank:0});
mkGame(2000,{'W9S58':home(),'W9S57':northC},null);
Memory.rooms['W9S58']={stage:'home'};Memory.rooms['W9S57']={stage:'home',claimedAt:1999};
threw=false;err='';
try{ t=config.getTargets(home()); }catch(e){threw=true;err=e.message;}
assert(!threw,'getTargets(home) does NOT throw with a visible owned north neighbor (defense fix; '+err+')');
assert(t&&t.remoteTarget==='W9S57','remoteTarget=north W9S57 (got '+(t&&t.remoteTarget)+')');
assert(t&&t.remoteharvester===1,'remoteharvester=1 (1 north source) (got '+(t&&t.remoteharvester)+')');
assert(t&&t.remotehauler===1,'remotehauler=1 (got '+(t&&t.remotehauler)+')');
assert(t&&t.remotebuilder===1,'remotebuilder=1 (got '+(t&&t.remotebuilder)+')');
assert(t&&t.claimer===0,'claimer=0 once north is ours (got '+(t&&t.claimer)+')');

console.log('\nTEST C: buildBody produces the remote crew shapes');
assert(config.buildBody('remoteharvester',1000).join('/')==='work/work/carry/move/move','remoteharvester (got '+config.buildBody('remoteharvester',1000).join('/')+')');
assert(config.buildBody('remotehauler',1000).join('/')==='carry/carry/move/move','remotehauler (got '+config.buildBody('remotehauler',1000).join('/')+')');
assert(config.buildBody('remotebuilder',1000).join('/')==='work/carry/move/move','remotebuilder (got '+config.buildBody('remotebuilder',1000).join('/')+')');

console.log('\nTEST D: no remote crew before claim (north visible but unowned)');
memoryClear();const northU=mkRoom('W9S57',{controller:{my:false,level:1,reservation:null},sourcesCount:1,spawn:false,tower:false,storage:false,sites:[],bank:0});
mkGame(3000,{'W9S58':home(),'W9S57':northU},null);
Memory.rooms['W9S58']={stage:'home'};Memory.rooms['W9S57']={stage:'outpost'};
threw=false;err='';
try{ t=config.getTargets(home()); }catch(e){threw=true;err=e.message;}
assert(!threw,'no throw when north visible/unowned (got: '+(threw?err:'ok')+')');
assert(!(t&&t.remoteharvester),'no remoteharvester before claim (got '+(t&&t.remoteharvester)+')');
assert(t&&t.claimerTarget==='W9S57','still claims north first (got '+(t&&t.claimerTarget)+')');

console.log('\nRESULT: '+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
