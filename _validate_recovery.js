'use strict'
// Host-side validation harness (NOT a game module — _deploy.js whitelist excludes it).
// Exercises config._computeTargets / getEconomyMode through a stubbed Game/Memory/Room
// so we can assert the latched recovery path cannot throw and yields stable,
// backbone-only targets. Run: node _validate_recovery.js

// ---- Screeps global constants ----
const WORK='work',CARRY='carry',MOVE='move',CLAIM='claim',ATTACK='attack',
  RANGED_ATTACK='ranged_attack',HEAL='heal',TOUGH='tough';
const BODYPART_COST={[WORK]:100,[CARRY]:50,[MOVE]:50,[CLAIM]:600,[ATTACK]:30,
  [RANGED_ATTACK]:150,[HEAL]:150,[TOUGH]:10};
const RESOURCE_ENERGY='energy';
const STRUCTURE_CONTAINER='container',STRUCTURE_SPAWN='spawn',STRUCTURE_EXTENSION='extension',
  STRUCTURE_TOWER='tower',STRUCTURE_ROAD='road',STRUCTURE_RAMPART='rampart',
  STRUCTURE_STORAGE='storage',STRUCTURE_OBSERVER='observer',STRUCTURE_LINK='link',
  STRUCTURE_EXTRACTOR='extractor',STRUCTURE_WALL='constructedWall';
const FIND_SOURCES='sources',FIND_STRUCTURES='structures',FIND_MY_STRUCTURES='myStructures',
  FIND_CONSTRUCTION_SITES='sites',FIND_DROPPED_RESOURCES='drops',FIND_HOSTILE_CREEPS='hostiles',
  FIND_MINERALS='minerals',FIND_MY_SPAWNS='mySpawns',LOOK_CONSTRUCTION_SITES='lookSites';
const OK=0,ERR_NOT_IN_RANGE=-9,ERR_NO_BODYPART=-11;
Object.assign(globalThis,{WORK,CARRY,MOVE,CLAIM,ATTACK,RANGED_ATTACK,HEAL,TOUGH,BODYPART_COST,
  RESOURCE_ENERGY,STRUCTURE_CONTAINER,STRUCTURE_SPAWN,STRUCTURE_EXTENSION,STRUCTURE_TOWER,
  STRUCTURE_ROAD,STRUCTURE_RAMPART,STRUCTURE_STORAGE,STRUCTURE_OBSERVER,STRUCTURE_LINK,
  STRUCTURE_EXTRACTOR,STRUCTURE_WALL,FIND_SOURCES,FIND_STRUCTURES,FIND_MY_STRUCTURES,FIND_CONSTRUCTION_SITES,
  FIND_DROPPED_RESOURCES,FIND_HOSTILE_CREEPS,FIND_MINERALS,FIND_MY_SPAWNS,LOOK_CONSTRUCTION_SITES,
  OK,ERR_NOT_IN_RANGE,ERR_NO_BODYPART});
globalThis._ = { filter:(a,f)=>a.filter(f) };
class RoomPosition{constructor(x,y,roomName){this.x=x;this.y=y;this.roomName=roomName;}
  getRangeTo(o){const p=(o.pos)||o;return Math.max(Math.abs(this.x-p.x),Math.abs(this.y-p.y));}
  findInRange(type,n){const room=Game.rooms[this.roomName];const arr=room.find(type)||[];
    return arr.filter(s=>Math.max(Math.abs(this.x-(s.pos?s.pos.x:s.x)),Math.abs(this.y-(s.pos?s.pos.y:s.y)))<=n);}
}
globalThis.RoomPosition=RoomPosition;

function mkStore(cap,used){return{getUsedCapacity:()=>used,getFreeCapacity:()=>Math.max(0,cap-used),
  getCapacity:()=>cap};}
function pos(x,y,rn){return new RoomPosition(x,y,rn);}

// Build a stub room: 2 sources, 1 built source container (west), east container is a
// 0/5000 SITE, storage 25450, spawn, 20 extensions (empty), tower.
function makeRoom(opts){
  const o=opts||{};
  const srcCount=o.srcCount||2;
  const builtSrcContainers=o.builtSrcContainers!=null?o.builtSrcContainers:1;
  const sources=[];for(let i=0;i<srcCount;i++)sources.push({id:'src'+i,pos:pos(i===0?4:27,i===0?14:20,'W9S58')});
  const structures=[];
  for(let i=0;i<builtSrcContainers;i++)structures.push({structureType:STRUCTURE_CONTAINER,
    pos:pos(sources[i].pos.x,sources[i].pos.y,'W9S58'),store:mkStore(2000,o.containerEnergy!=null?o.containerEnergy:2000),my:true,id:'c'+i});
  const sites=[];
  for(let i=builtSrcContainers;i<srcCount;i++)sites.push({structureType:STRUCTURE_CONTAINER,
    pos:pos(sources[i].pos.x,sources[i].pos.y,'W9S58'),id:'cs'+i,progress:0,progressTotal:5000});
  for(let i=0;i<35;i++)sites.push({structureType:STRUCTURE_ROAD,pos:pos(10+i%5,10,'W9S58'),id:'rs'+i});
  const myStructures=[{structureType:STRUCTURE_SPAWN,pos:pos(18,17,'W9S58'),store:mkStore(300,0),my:true,id:'sp'}];
  for(let i=0;i<20;i++)myStructures.push({structureType:STRUCTURE_EXTENSION,pos:pos(17+i%3,18,'W9S58'),store:mkStore(50,0),my:true,id:'e'+i});
  myStructures.push({structureType:STRUCTURE_TOWER,pos:pos(18,18,'W9S58'),store:mkStore(2000,810),my:true,id:'tw'});
  const storage={structureType:STRUCTURE_STORAGE,pos:pos(19,17,'W9S58'),store:mkStore(1000000,25450),my:true,id:'sto'};
  const spawns=[myStructures[0]];
  const room={name:'W9S58',energyAvailable:o.bank!=null?o.bank:100,energyCapacityAvailable:1300,
    storage,controller:{my:true,level:4,progress:1000,progressTotal:10000,reservation:null},
    find:(type,opts)=>{const f=opts&&opts.filter;let arr;
      switch(type){case FIND_SOURCES:arr=sources;break;case FIND_STRUCTURES:arr=structures;break;
        case FIND_MY_STRUCTURES:arr=myStructures;break;case FIND_CONSTRUCTION_SITES:arr=sites;break;
        case FIND_DROPPED_RESOURCES:arr=[];break;case FIND_HOSTILE_CREEPS:arr=[];break;
        case FIND_MINERALS:arr=[];break;case FIND_MY_SPAWNS:arr=spawns;break;default:arr=[];}
      return f?arr.filter(f):arr.slice();},
    findExitTo:()=>-10};
  return room;
}

function makeCreeps(o){
  o=o||{};const creeps={};
  if(o.harvester!==0)creeps.h1={memory:{role:'harvester'},room:{name:'W9S58'},body:[{type:WORK},{type:CARRY},{type:MOVE}],ticksToLive:1200};
  if(o.hauler!==0){creeps.a1={memory:{role:'hauler'},room:{name:'W9S58'},body:[{type:CARRY},{type:MOVE}],ticksToLive:1200};
    creeps.a2={memory:{role:'hauler'},room:{name:'W9S58'},body:[{type:CARRY},{type:MOVE}],ticksToLive:1200};}
  return creeps;
}

let PASS=0,FAIL=0;
function assert(cond,msg){if(cond){PASS++;console.log('  ok  '+msg);}else{FAIL++;console.log('  FAIL '+msg);}}

const config=require('./config');

function freshMemory(){globalThis.Memory={rooms:{},creeps:{}};}

// ---------- TEST 1: latched recovery, stable backbone-only targets across bank 100/400/700 ----------
console.log('\nTEST 1: recovery latch + deterministic targets (2 sources, 1 built container)');
{
  freshMemory();
  globalThis.Game={rooms:{},creeps:makeCreeps({}),cpu:{getUsed:()=>5,limit:10}};
  const room=makeRoom({bank:100});Game.rooms['W9S58']=room;
  Memory.rooms['W9S58']={stage:'home'};
  let threw=false,prev=null;
  const banks=[100,400,700];
  try{
    for(const b of banks){
      room.energyAvailable=b;Game.time=1000+b;
      const mode=config.getEconomyMode(room);
      assert(mode==='recovery','bank '+b+' -> recovery latched (got '+mode+')');
      const t=config.getTargets(room);
      assert(t.harvester===1,'bank '+b+' harvester target=1 (got '+t.harvester+')');
      assert(t.hauler===4,'bank '+b+' hauler target=4 (got '+t.hauler+')');
      assert(t.builder===1,'bank '+b+' builder target=1 (container missing) (got '+t.builder+')');
      assert(t.upgrader===0,'bank '+b+' upgrader target=0 (got '+t.upgrader+')');
      for(const r of ['claimer','defender','attacker','looter','miner','repairer'])
        assert((t[r]||0)===0,'bank '+b+' no non-backbone role '+r+' (got '+(t[r]||0)+')');
      if(prev)assert(JSON.stringify(prev)===JSON.stringify(t),'targets stable across bank '+b);
      prev=t;
    }
  }catch(e){threw=true;console.log('  THREW: '+e.message+'\n'+e.stack);}
  assert(!threw,'_computeTargets did not throw on low-bank/no-full-coverage path');
}

// ---------- TEST 2: regression — normal branch must not throw on srcCount path ----------
console.log('\nTEST 2: regression — normal branch with 0 built source containers (old srcCount crash)');
{
  freshMemory();
  globalThis.Game={rooms:{},creeps:makeCreeps({}),cpu:{getUsed:()=>5,limit:10}};
  // Force normal mode with NO built source containers and low bank: this used to hit
  // `Math.min(3, srcCount)` where srcCount was undefined in _computeTargets scope.
  const room=makeRoom({bank:100,builtSrcContainers:0});Game.rooms['W9S58']=room;
  Memory.rooms['W9S58']={stage:'home',eco:{mode:'normal',healthySince:0}};
  let threw=false,err='';
  try{Game.time=5000;const t=config.getTargets(room);}
  catch(e){threw=true;err=e.message;}
  assert(!threw,'normal branch with 0 containers does not throw'+(threw?': '+err:''));
}

// ---------- TEST 3: recovery exits only after full coverage + haulers + healthy window ----------
console.log('\nTEST 3: recovery exit requires full source coverage held for 50 ticks');
{
  freshMemory();
  globalThis.Game={rooms:{},creeps:makeCreeps({}),cpu:{getUsed:()=>5,limit:10}};
  const room=makeRoom({bank:700,builtSrcContainers:2,srcCount:2});Game.rooms['W9S58']=room;
  Memory.rooms['W9S58']={stage:'home',eco:{mode:'recovery',healthySince:0}};
  Game.time=10000;
  const m1=config.getEconomyMode(room);
  assert(m1==='recovery','first healthy tick still recovery (window not elapsed)');
  Game.time=10060; // +60 ticks healthy
  const m2=config.getEconomyMode(room);
  assert(m2==='normal','after 50 healthy ticks with full coverage -> normal');
}

console.log('\nRESULT: '+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
