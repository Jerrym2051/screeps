// config.js - body builder, population targets, spawn planner, multi-room manager
const ROLES = ['harvester','upgrader','builder','hauler','claimer','looter','miner','defender','attacker','repairer'];
const allies = [];

function spawn(room) { return room.find(FIND_MY_SPAWNS)[0]; }

function getOwnedRooms() {
  const rooms = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) { rooms.push(room); }
  }
  rooms.sort((a, b) => getRoomPriority(a.name) - getRoomPriority(b.name));
  return rooms;
}

function getHomeRoom() {
  const spawns = _.filter(Game.structures, s => s.structureType === STRUCTURE_SPAWN && s.my);
  if (spawns.length) return spawns[0].room;
  if (Memory.rooms) {
    for (const name in Memory.rooms) {
      if (Memory.rooms[name].stage === 'home') return Game.rooms[name];
    }
  }
  return Object.values(Game.rooms)[0] || null;
}

function getRoomStage(room) {
  const name = room.name;
  const mem = Memory.rooms?.[name];
  const hasSpawn = room.find(FIND_MY_SPAWNS).length > 0;
  const c = room.controller;
  if (!c) return 'unknown';
  if (c.my) {
    if (hasSpawn) return 'home';
    return 'expansion';
  }
  if (mem && mem.stage === 'home') return 'home';
  if (mem && mem.stage === 'expansion') return 'expansion';
  return 'outpost';
}

function getRoomPriority(roomName) {
  const mem = Memory.rooms?.[roomName];
  if (mem && mem.priority !== undefined) return mem.priority;
  const homeRoom = getHomeRoom();
  if (homeRoom && homeRoom.name === roomName) return 0;
  if (homeRoom) {
    const rm = roomName.match(/^([WE])(\d+)([NS])(\d+)$/);
    const hm = homeRoom.name.match(/^([WE])(\d+)([NS])(\d+)$/);
    if (rm && hm) {
      return Math.abs(parseInt(rm[2]) - parseInt(hm[2])) + Math.abs(parseInt(rm[4]) - parseInt(hm[4]));
    }
  }
  return 999;
}

function buildBody(role, budget) {
  budget = Math.max(0, budget - 10);
  if (budget <= 0) return [];
  const b = [];
  if (role === 'claimer') {
    if (budget >= 350) { b.push(CLAIM, MOVE); }
    return b;
  }
  if (role === 'defender') {
    if (budget < 200) return [];
    if (budget >= 250) { b.push(TOUGH, MOVE, RANGED_ATTACK, HEAL); budget -= 250; }
    else if (budget >= 200) { b.push(TOUGH, MOVE, ATTACK); budget -= 200; }
    while (budget >= 50) { b.push(MOVE); budget -= 50; }
    return b;
  }
  if (role === 'repairer') {
    while (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
    return b;
  }
  // attacker: ranged combat body - tough for survivability, ranged attack + heal
  if (role === 'attacker') {
    if (budget < 300) return [];
    while (budget >= 300) { b.push(TOUGH, RANGED_ATTACK, MOVE, HEAL); budget -= 300; }
    if (budget >= 150) { b.push(TOUGH, RANGED_ATTACK, MOVE); budget -= 150; }
    if (budget >= 100) { b.push(TOUGH, MOVE); budget -= 100; }
    return b;
  }
  // upgrader: big CARRY to maximize energy per trip, fewer trips back to spawn
  if (role === 'upgrader') {
    if (budget < 250) return [];
    while (budget >= 250) { b.push(WORK, CARRY, CARRY, MOVE); budget -= 250; }
    if (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
    return b;
  }
  // harvester: more WORK and CARRY for maximum energy harvest and transport per trip
  if (role === 'harvester') {
    if (budget < 250) return [];
    while (budget >= 250) { b.push(WORK, CARRY, CARRY, MOVE); budget -= 250; }
    if (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
    return b;
  }
  // upgrader: big CARRY to maximize energy per trip, fewer trips back to spawn
  if (role === 'upgrader') {
    if (budget < 250) return [];
    while (budget >= 250) { b.push(WORK, CARRY, CARRY, MOVE); budget -= 250; }
    if (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
    return b;
  }
  const isWork = ['builder','miner'].includes(role);
  if (isWork) {
    if (budget < 200) return [];
    while (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
  } else {
    while (budget >= 100) { b.push(CARRY, MOVE); budget -= 100; }
  }
  return b;
}

function getTargets(room) {
  const sources = room.find(FIND_SOURCES);
  const controller = room.controller;
  const sites = room.find(FIND_CONSTRUCTION_SITES).length;
  const drops = room.find(FIND_DROPPED_RESOURCES).length;
  const containers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
  const filled = containers.filter(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0).length;
  const stage = getRoomStage(room);

  let hostiles = room.find(FIND_HOSTILE_CREEPS);
  const m = room.name.match(/^([WE])(\d+)([NS])(\d+)$/);
  if (m) {
    const [, wS, wN, nS, nN] = m;
    const w = parseInt(wN), n = parseInt(nN);
    const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dx, dy] of dirs) {
      const nm = wS+(w+dx)+nS+(n+dy);
      const r = Game.rooms[nm];
      if (r) hostiles = hostiles.concat(r.find(FIND_HOSTILE_CREEPS));
    }
  }
  const hostilesCount = hostiles.length;
  const hasFort = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART }).length > 0;

  const targets = {};
  if (stage === 'home') {
    targets.harvester = sources.length * 3 + Math.max(0, containers.length - filled);
    targets.upgrader = 1 + (controller && controller.level < 2 ? 2 : 0);
    targets.builder = Math.max(2, Math.ceil(sites / 2) + (controller && controller.level < 3 ? 1 : 0));
    targets.hauler = Math.max(2, Math.ceil(filled / 2));
    targets.claimer = (controller && !controller.my) ? 1 : 0;
    targets.looter = drops > 0 ? 1 : 0;
    const minerals = room.find(FIND_MINERALS);
    targets.miner = 0;
    if (minerals.length) {
      const hasExt = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTRACTOR }).length > 0;
      if (hasExt) targets.miner = 1;
    }
    targets.defender = hostilesCount ? Math.min(hostilesCount, 5) : 1;
    targets.attacker = hostilesCount ? Math.min(Math.ceil(hostilesCount / 2), 3) : 0;
    targets.repairer = hasFort ? 1 : 0;
  } else if (stage === 'outpost') {
    targets.harvester = sources.length * 2 + Math.max(0, containers.length - filled);
    targets.upgrader = 0;
    targets.builder = Math.max(1, Math.ceil(sites / 2));
    targets.hauler = Math.max(2, sources.length);
    targets.claimer = (controller && !controller.my) ? 1 : 0;
    targets.looter = drops > 0 ? 1 : 0;
    targets.defender = hostilesCount ? Math.min(hostilesCount, 3) : 1;
    targets.attacker = hostilesCount ? Math.min(Math.ceil(hostilesCount / 2), 2) : 0;
    targets.miner = 0;
    targets.repairer = 0;
  } else if (stage === 'expansion') {
    targets.harvester = sources.length * 2 + Math.max(0, containers.length - filled);
    targets.upgrader = 1;
    targets.builder = Math.max(2, Math.ceil(sites / 2) + 1);
    targets.hauler = Math.max(2, sources.length);
    targets.claimer = (controller && !controller.my) ? 1 : 0;
    targets.looter = drops > 0 ? 1 : 0;
    targets.miner = 0;
    targets.defender = hostilesCount ? Math.min(hostilesCount, 4) : 1;
    targets.attacker = hostilesCount ? Math.min(Math.ceil(hostilesCount / 2), 2) : 0;
    targets.repairer = hasFort ? 1 : 0;
  } else {
    targets.harvester = sources.length * 2;
    targets.upgrader = 1;
    targets.builder = 0;
    targets.hauler = Math.max(1, sources.length);
    targets.claimer = 0;
    targets.looter = 0;
    targets.miner = 0;
    targets.defender = 1;
    targets.attacker = 0;
    targets.repairer = 0;
  }
  if (room.energyAvailable < 500) { targets.harvester += 2; }
  // Cap upgraders at 3 — they don't scale with room size
  targets.upgrader = Math.min(targets.upgrader || 0, 3);
  return targets;
}

function manageSpawns(room) {
  const s = spawn(room);
  if (!s) return;
  if (s.spawning !== null && s.spawning !== undefined) {
    if (!Memory._spawnBusyTicks) Memory._spawnBusyTicks = 0;
    Memory._spawnBusyTicks++;
    if (Memory._spawnBusyTicks > 50) console.log('spawn STUCK:', s.spawning, 'forcing idle');
    if (!Memory._spawnWasBusy) { Memory._spawnWasBusy = true; console.log('spawn BUSY:', s.spawning, 'energy', room.energyAvailable); }
    return;
  } else { Memory._spawnWasBusy = false; Memory._spawnBusyTicks = 0; }
  // Emergency recycle: if zero harvesters remain, recycle a non-harvester creep to fund new ones
  const harvesterCreeps = Object.values(Game.creeps).filter(c => c.memory.role === 'harvester' && c.room.name === room.name);
  if (harvesterCreeps.length === 0 && typeof s.recycleCreep === 'function') {
    const others = Object.values(Game.creeps).filter(c => c.memory.role !== 'harvester' && c.room.name === room.name);
    if (others.length > 0) {
      // Recycle the creep with the most body parts (most energy returned)
      const victim = others.reduce((best, c) => (c.body.length > best.body.length ? c : best), others[0]);
      if (victim.body.length >= 4) {
        const result = s.recycleCreep(victim);
        if (result === OK) {
          console.log('Recycled', victim.name, 'to fund new harvesters');
          return;
        }
      }
    }
  }

  const targets = getTargets(room);
  const controller = room.controller;
  const stage = getRoomStage(room);
  const counts = {};
  for (const name in Game.creeps) { const r = Game.creeps[name].memory.role; counts[r] = (counts[r] || 0) + 1; }
  let best = null, score = -Infinity;
  for (const role of ROLES) {
    const need = (targets[role] || 0) - (counts[role] || 0);
    if (need <= 0) continue;
    const upgBoost = (role === 'upgrader' && controller && controller.level < 2) ? 50 : 0;
    let sc = need;
    if (stage === 'home') { sc += (role === 'harvester' ? 500 : 0); }
    else { sc += (role === 'harvester' ? 400 : 0); }
    sc += (role === 'claimer' ? 1000 : 0);
    sc += (role === 'defender' ? 500 : 0);
    sc += (role === 'attacker' ? 600 : 0);
    sc += (role === 'upgrader' ? 30 + upgBoost : 0);
    sc += (role === 'builder' ? 40 : 0);
    sc += (role === 'hauler' ? 20 : 0);
    sc += (role === 'repairer' ? 25 : 0);
    sc += (role === 'miner' ? 15 : 0);
    sc += (role === 'looter' ? 5 : 0);
    if (room.energyAvailable > 200 && role === 'harvester') { sc += 100; }
    if (room.energyAvailable > 400 && role === 'harvester') { sc += 100; }
    if (sc > score) { score = sc; best = role; }
  }
  // Harvesters are the foundation — always prioritize them if unmet
  if (targets.harvester > (counts['harvester'] || 0)) {
    best = 'harvester';
    score = 9999;
  }
  const body = buildBody(best, room.energyAvailable);
  if (body.length === 0 && best !== 'harvester') {
    const hb = buildBody('harvester', room.energyAvailable);
    if (hb.length > 0) best = 'harvester';
    else return;
  }
  if (best === 'claimer' && room.energyAvailable < 350) return;
  const memory = { role: best };
  if (best === 'harvester') {
    const sources = room.find(FIND_SOURCES);
    let bestSrc = null, min = Infinity;
    for (const src of sources) {
      const n = Object.values(Game.creeps).filter(c => c.memory.role === 'harvester' && c.memory.sourceId === src.id).length;
      if (n < min) { min = n; bestSrc = src; }
    }
    if (bestSrc) memory.sourceId = bestSrc.id;
  }
  const result = s.createCreep(body, best + Game.time, memory);
  if (typeof result !== 'string') console.log('spawn failed:', result, 'for', best, 'energy', room.energyAvailable);
  else console.log('spawned', result, 'role', best, 'energy', room.energyAvailable, 'spawning', s.spawning);
}

module.exports = { buildBody, getTargets, manageSpawns, allies, getOwnedRooms, getHomeRoom, getRoomStage, getRoomPriority };
