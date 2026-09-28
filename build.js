// build.js - idempotent construction planner (containers, roads, extensions, storage, ramparts, towers, observer, links)
const DIRS = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]];
const SPAWN_CLEAR_RADIUS = 1; // leave the 8 tiles adjacent to the spawn empty for creep logistics

function getSpawn(room) { return room.find(FIND_MY_SPAWNS)[0]; }

function isSpawnClear(pos, room) {
  const spawn = getSpawn(room);
  if (!spawn) return true;
  return Math.abs(pos.x - spawn.pos.x) > SPAWN_CLEAR_RADIUS || Math.abs(pos.y - spawn.pos.y) > SPAWN_CLEAR_RADIUS;
}

function makeSite(pos, type, room) {
  if (!pos) return ERR_INVALID_ARGS;
  if (!isSpawnClear(pos, room)) return -4;
  if (pos.lookFor(LOOK_STRUCTURES).length || pos.lookFor(LOOK_CONSTRUCTION_SITES).length) return -4;
  return room.createConstructionSite(pos, type);
}

function placeContainers(room) {
  const sources = room.find(FIND_SOURCES);
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
  if (!Memory.rooms[room.name].sources) Memory.rooms[room.name].sources = {};
  const containerDirs = [[0,-2],[0,2],[-2,0],[2,0]];
  for (const src of sources) {
    // Skip if a container already exists within 2 tiles of this source
    const nearContainers = room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER &&
        Math.abs(s.pos.x - src.pos.x) <= 2 && Math.abs(s.pos.y - src.pos.y) <= 2
    });
    if (nearContainers.length > 0) continue;
    for (const [dx, dy] of containerDirs) {
      const px = src.pos.x + dx, py = src.pos.y + dy;
      if (px < 0 || px > 49 || py < 0 || py > 49) continue;
      const t = room.getTerrain().get(px, py);
      if (t === TERRAIN_MASK_WALL || t === TERRAIN_MASK_SWAMP) continue;
      const mid = room.getTerrain().get(src.pos.x + dx/2, src.pos.y + dy/2);
      if (mid === TERRAIN_MASK_WALL || mid === TERRAIN_MASK_SWAMP) continue;
      const pos = new RoomPosition(px, py, room.name);
      const res = makeSite(pos, STRUCTURE_CONTAINER, room);
      console.log('container attempt for source', src.id, 'at', px, py, 'res:', res);
      if (res === OK) {
        Memory.rooms[room.name].sources[src.id] = { containerPos: { x: px, y: py, roomName: room.name } };
        break;
      }
    }
  }
}

function ring(center, r) {
  const out = [];
  for (let x = center.x - r; x <= center.x + r; x++)
    for (let y = center.y - r; y <= center.y + r; y++)
      if ((Math.abs(x - center.x) === r || Math.abs(y - center.y) === r))
        out.push(new RoomPosition(x, y, center.roomName));
  return out;
}

function placeExtensions(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const c = room.controller;
  if (!spawn || !c || c.level < 2) return;
  const max = c.level * 5;
  const have = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
  let need = max - have;
  if (need <= 0) return;
  for (let r = 1; r <= 3 && need > 0; r++) {
    for (const pos of ring(spawn.pos, r)) {
      if (need <= 0) break;
      const t = room.getTerrain().get(pos.x, pos.y);
      if (t === TERRAIN_MASK_WALL || t === TERRAIN_MASK_SWAMP) continue;
      if (makeSite(pos, STRUCTURE_EXTENSION, room) === OK) need--;
    }
  }
}

function placeRoads(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  const targets = room.find(FIND_SOURCES).concat(room.controller ? [room.controller] : []);
  for (const t of targets) {
    const path = PathFinder.search(spawn.pos, t.pos, { swampCost: 1 }).path;
    for (const step of path) {
      const pos = new RoomPosition(step.x, step.y, room.name);
      if (room.getTerrain().get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
        makeSite(pos, STRUCTURE_ROAD, room);
      }
    }
  }
}

function placeStorage(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const c = room.controller;
  if (!spawn || !c || c.level < 4) return;
  if (room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_STORAGE }).length) return;
  for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
    const pos = new RoomPosition(spawn.pos.x + dx, spawn.pos.y + dy, room.name);
    if (makeSite(pos, STRUCTURE_STORAGE, room) === OK) return;
  }
}

function placeRamparts(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  const targets = [spawn.pos];
  const c = room.controller;
  if (c && c.my) targets.push(c.pos);
  const mem = Memory.rooms?.[room.name]?.sources;
  if (mem) {
    for (const sid in mem) {
      const p = mem[sid].containerPos;
      if (p && p.x != null && p.y != null && p.roomName) {
        targets.push(new RoomPosition(p.x, p.y, p.roomName));
      }
    }
  }
  room.find(FIND_EXIT).forEach(e => {
    if (e.x != null && e.y != null) targets.push(e);
  });
  for (const pos of targets) {
    if (pos.x == null || pos.y == null) continue;
    for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const px = pos.x + dx, py = pos.y + dy;
      if (px < 0 || px > 49 || py < 0 || py > 49) continue;
      const rp = new RoomPosition(px, py, room.name);
      if (room.getTerrain().get(rp.x, rp.y) === TERRAIN_MASK_WALL) {
        makeSite(rp, STRUCTURE_RAMPART, room);
      }
    }
  }
}

function placeTowers(room) {
  const c = room.controller;
  if (!c || c.level < 3) return;
  if (room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length) return;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  let built = 0;
  for (const [dx, dy] of [[0,0],[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const pos = new RoomPosition(spawn.pos.x + dx, spawn.pos.y + dy, room.name);
    if (makeSite(pos, STRUCTURE_TOWER, room) === OK) {
      built++;
      if (built >= 2) break;
    }
  }
}

// Observer at RCL 2+ for remote room vision
function placeObserver(room) {
  const c = room.controller;
  if (!c || c.level < 2) return;
  if (room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_OBSERVER }).length) return;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  for (const [dx, dy] of [[0,0],[0,1],[1,0],[0,-1],[-1,0]]) {
    const pos = new RoomPosition(spawn.pos.x + dx, spawn.pos.y + dy, room.name);
    if (makeSite(pos, STRUCTURE_OBSERVER, room) === OK) return;
  }
}

// Links at RCL 5+ for energy logistics
function placeLinks(room) {
  const c = room.controller;
  if (!c || c.level < 5) return;
  if (room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_LINK }).length) return;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  // Link near spawn for energy input
  let built = 0;
  for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
    const pos = new RoomPosition(spawn.pos.x + dx, spawn.pos.y + dy, room.name);
    if (makeSite(pos, STRUCTURE_LINK, room) === OK) {
      built++;
      if (built >= 1) break;
    }
  }
}

// Extractor at RCL 6+ for minerals
function placeExtractor(room) {
  const c = room.controller;
  if (!c || c.level < 6) return;
  const minerals = room.find(FIND_MINERALS);
  if (!minerals.length) return;
  if (room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTRACTOR }).length) return;
  const mineral = minerals[0];
  for (const [dx, dy] of [[0,0],[0,1],[1,0],[0,-1],[-1,0]]) {
    const pos = new RoomPosition(mineral.pos.x + dx, mineral.pos.y + dy, room.name);
    if (makeSite(pos, STRUCTURE_EXTRACTOR, room) === OK) return;
  }
}

function buildPlan(room) {
  try {
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
    if (!Memory.rooms[room.name].sources) Memory.rooms[room.name].sources = {};
    console.log('buildPlan for', room.name, 'sources:', room.find(FIND_SOURCES).length, 'sites:', room.find(FIND_CONSTRUCTION_SITES).length, 'memory sources:', Object.keys(Memory.rooms[room.name].sources).length);
    placeExtensions(room);
    placeContainers(room);
    placeRamparts(room);
    placeTowers(room);
    placeStorage(room);
    placeObserver(room);
    placeLinks(room);
    placeExtractor(room);
  } catch (e) {
    console.log('buildPlan error:', e.message, e.stack);
  }
}

module.exports = { buildPlan };
