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
  for (const src of sources) {
    // (1) Once we've committed to a spot for a source (tracked in memory), NEVER
    //     place a second container for it — UNLESS the committed spot is stale
    //     (no container structure AND no container site there). A stale entry was
    //     the actual deadlock: placeContainers kept `continue`-ing on a memory
    //     position that had no site, so the source container was never (re)built,
    //     the builder fell through to rampart sites, and income stayed carry-limited.
    const srcMem = Memory.rooms[room.name].sources[src.id] || (Memory.rooms[room.name].sources[src.id] = {});
    // (1) If a usable container already sits near the source, adopt the emptiest
    //     one and cancel any redundant own container site — this MUST run before
    //     the remembered-spot check, otherwise a stale containerPos pointing at a
    //     construction site (e.g. the 19,14 we built while the neutral containers
    //     were misread as foreign) short-circuits the loop and keeps the builder
    //     draining energy on a second container beside an existing one.
    const nearContainers = room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) &&
        Math.abs(s.pos.x - src.pos.x) <= 2 && Math.abs(s.pos.y - src.pos.y) <= 2
    });
    if (nearContainers.length > 0) {
      const best = nearContainers.reduce((a, b) =>
        (a.store.getFreeCapacity(RESOURCE_ENERGY) >= b.store.getFreeCapacity(RESOURCE_ENERGY) ? a : b));
      srcMem.containerPos = { x: best.pos.x, y: best.pos.y, roomName: room.name };
      for (const site of room.find(FIND_CONSTRUCTION_SITES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.my &&
          Math.abs(s.pos.x - src.pos.x) <= 2 && Math.abs(s.pos.y - src.pos.y) <= 2 })) {
        site.remove();
        console.log('removed redundant container site at', site.pos.x, site.pos.y);
      }
      continue;
    }
    // (2) Once committed to a spot (no usable container near source), don't place a
    //     second one unless that spot is stale (no structure AND no site there).
    if (srcMem.containerPos) {
      const cp = srcMem.containerPos;
      const pos = new RoomPosition(cp.x, cp.y, cp.roomName);
      const hasStruct = pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner));
      const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0;
      if (hasStruct || hasSite) continue; // committed spot is real — leave it alone
      if (Game.time < (srcMem.retryAt || 0)) continue; // rate-limit re-placement (no thrash)
      srcMem.retryAt = Game.time + 200;
      delete srcMem.containerPos; // stale — fall through and place a fresh one
    }
    // (3) Adopt an in-progress container site so the builder focuses on it.
    const nearSites = room.find(FIND_CONSTRUCTION_SITES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER &&
        Math.abs(s.pos.x - src.pos.x) <= 2 && Math.abs(s.pos.y - src.pos.y) <= 2
    });
    if (nearSites.length > 0) {
      const best = nearSites.reduce((a, b) => (a.progress >= b.progress ? a : b));
      srcMem.containerPos = { x: best.pos.x, y: best.pos.y, roomName: room.name };
      continue;
    }

    // Spiral outward from the source and place a container on the first
    // valid plain tile: not wall/swamp, not on the room edge (construction
    // sites require x/y in 1..48), not inside the spawn-clear radius, and
    // not blocked by an existing structure/construction site. r<=4 reaches a
    // plain tile even when the source is ringed by walls/swamp.
    let placed = false;
    for (let r = 1; r <= 4 && !placed; r++) {
      for (const pos of ring(src.pos, r)) {
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
        const t = room.getTerrain().get(pos.x, pos.y);
        if (t === TERRAIN_MASK_WALL || t === TERRAIN_MASK_SWAMP) continue;
        const res = makeSite(pos, STRUCTURE_CONTAINER, room);
        if (res === OK) {
          Memory.rooms[room.name].sources[src.id] = { containerPos: { x: pos.x, y: pos.y, roomName: room.name } };
          console.log('container placed for source', src.id, 'at', pos.x, pos.y);
          placed = true;
          break;
        }
      }
    }
  }

  // Bank buffer: at RCL2 the energy bank caps at 550 (spawn+extensions) and the
  // source containers are full, so any extra harvest overflows to the ground. Lay
  // more containers right BESIDE THE SPAWN (up to the room's 5-container limit) as
  // bank storage the haulers top up when extensions/spawn are full — that absorbs
  // surplus into storage instead of letting it rot on the ground, and each 5000-build
  // container is itself a one-time energy sink. Placed near the SPAWN, not the
  // source, so placeContainers' source-adoption cleanup can't prune them as
  // "redundant" source sites (which caused the place/remove churn).
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const contUsable = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) }).length;
  const contSites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_CONTAINER }).length;
  const max = 5 - (contUsable + contSites);
  // RCL1 cold-start: NO bank buffer. The income-gate keeps us at the 300 spawn cap
  // (extensions don't exist until RCL2), and every 5000-build HP the builders spend on
  // a near-spawn container is HP stolen from the SOURCE income-unlock containers the
  // harvesters won't dump into. The 1-MOVE builders are slow and heavy; force them to
  // finish a source container first so harvesters can dump on-site (→ no 90-tick
  // source↔spawn round-trip) and the cascade to RCL2 can start. Bank buffers are
  // placed at RCL2+ (when the bank overflows past 550 and haulers exist to use them).
  if (spawn && max > 0 && room.controller && room.controller.level >= 2) {
    let placed = 0;
    outer: for (let r = 2; r <= 3 && placed < max; r++) {
      for (const pos of ring(spawn.pos, r)) {
        if (placed >= max) break outer;
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
        const t = room.getTerrain().get(pos.x, pos.y);
        if (t === TERRAIN_MASK_WALL || t === TERRAIN_MASK_SWAMP) continue;
        if (pos.findInRange(FIND_MY_STRUCTURES, 0).some(s => s.structureType === STRUCTURE_CONTAINER)) continue;
        if (makeSite(pos, STRUCTURE_CONTAINER, room) === OK) {
          placed++;
          console.log('bank container placed at', pos.x, pos.y, '(total', contUsable + contSites + placed + '/5)');
        }
      }
    }
  }
}

function ring(center, r) {
  const out = [];
  for (let x = center.x - r; x <= center.x + r; x++)
    for (let y = center.y - r; y <= center.y + r; y++)
      if (
        (Math.abs(x - center.x) === r || Math.abs(y - center.y) === r) &&
        x >= 0 && x <= 49 && y >= 0 && y <= 49
      )
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

function pathPerp(dx, dy) {
  // rotate the step direction (dx,dy) by 90 to get a lane-parallel offset.
  // (dx,dy) are each -1/0/1 (PathFinder steps are cardinal/diagonal), so the
  // returned neighbor is exactly one tile to the left/right of the path = a 2nd lane.
  return [[dy, -dx], [-dy, dx]];
}

function pave2Lane(room, fromPos, toPos) {
  if (!fromPos || !toPos) return 0;
  let path;
  try {
    path = room.findPath(fromPos, toPos, { swampCost: 1, range: 1 });
  } catch (e) {
    if (Memory.rooms && Memory.rooms[room.name]) Memory.rooms[room.name]._roadErr = e.message;
    return 0;
  }
  if (!path || !path.length) return 0;
  let laid = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const px = p.x, py = p.y;
    if (px >= 1 && px <= 48 && py >= 1 && py <= 48 &&
        room.getTerrain().get(px, py) !== TERRAIN_MASK_WALL) {
      if (makeSite(new RoomPosition(px, py, room.name), STRUCTURE_ROAD, room) === OK) laid++;
    }
    // parallel lane: one tile offset from the path direction so opposing traffic
    // doesn't stack on a single tile (true 2-lane, not a 1-tile spine).
    if (i + 1 < path.length) {
      const nx = path[i + 1].x - p.x, ny = path[i + 1].y - p.y;
      for (const [ox, oy] of pathPerp(nx, ny)) {
        const qx = px + ox, qy = py + oy;
        if (qx >= 1 && qx <= 48 && qy >= 1 && qy <= 48 &&
            room.getTerrain().get(qx, qy) !== TERRAIN_MASK_WALL) {
          if (makeSite(new RoomPosition(qx, qy, room.name), STRUCTURE_ROAD, room) === OK) laid++;
        }
      }
    }
  }
  return laid;
}

// 2-lane road network connecting the two sources, the spawn, and the controller:
// source1 <-> spawn <-> controller <-> source2 (and the reverse legs so each segment
// is genuinely 2 tiles wide). Laid once the income loop is live (RCL2 + energy banked)
// and source containers exist — a 2-lane road cuts creep travel in half and lets the
// 1-MOVE workers move at full 2-MOVE body speed without zoning each other out.
function placeRoads(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const c = room.controller;
  // Allow roads at RCL2 (the old energyAvailable>=500 gate never fired: the bank is
  // capped at 300 until extensions exist, so roads were permanently starved). Gate
  // on the income containers being built instead so road sites never steal build
  // progress from the source containers that feed the bank.
  const srcContainers = room.find(FIND_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) &&
      s.pos.findInRange(FIND_SOURCES, 1).length > 0,
  });
  if (Memory.rooms && Memory.rooms[room.name]) Memory.rooms[room.name]._placeRoadsRan = { t: Game.time, bank: room.energyAvailable, srcC: srcContainers.length, lvl: c && c.level };
  if (!spawn || !c || c.level < 2 || srcContainers.length < 1 || room.energyAvailable < 300) return;
  const sources = room.find(FIND_SOURCES);
  if (!sources.length) return;
  const src1 = sources.find(s => s.pos.x < 25) || sources[0];
  const src2 = sources.find(s => s.pos.x >= 25) || sources[sources.length - 1];
  const legs = [
    [src1.pos, spawn.pos], [spawn.pos, src1.pos],
    [src2.pos, spawn.pos], [spawn.pos, src2.pos],
    [spawn.pos, c.pos], [c.pos, spawn.pos],
    [src1.pos, c.pos], [c.pos, src1.pos],
    [src2.pos, c.pos], [c.pos, src2.pos],
  ];
  let total = 0;
  for (const [a, b] of legs) total += pave2Lane(room, a, b);
  if (Memory.rooms && Memory.rooms[room.name]) Memory.rooms[room.name]._roadLaid = { t: Game.time, laid: total };
  // Access roads: pave the spawn's and each source's ring so creeps never trudge
  // raw terrain onto/off a source or the spawn — cheap (300 build HP) continuous sink
  // for surplus once income is healthy.
  const ringCentres = [spawn.pos].concat(sources.map(s => s.pos));
  for (const centre of ringCentres) {
    for (const pos of ring(centre, 1)) {
      if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
      if (room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL) continue;
      makeSite(pos, STRUCTURE_ROAD, room);
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

// Ramparts are pure drain at RCL2 (3000 build cost each, no defense value yet).
// Only plan them once RCL>=3 and the container+hauler loop is live, so they can
// never starve the income unlock or clog the builder.
function placeRamparts(room) {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  const c = room.controller;
  if (!c || c.level < 3) return;
  const targets = [spawn.pos];
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
  // Defer the tower until the home bank is healthy (>=500): a 600 build funded by
  // the spawn-side container starves the fragile 1-source recovery cycle (containers
  // empty -> decay -> collapse). Only site a tower once the bank can absorb the cost,
  // and clear any tower site placed while fragile so the containers refill first.
  if (room.energyAvailable < 500) return;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;
  let built = 0;
  // isSpawnClear rejects the 3x3 ring around the spawn (SPAWN_CLEAR_RADIUS=1), so a
  // tower must be sited at radius 2. A tower covers the whole room, so a radius-2
  // tile is fine and actually leaves the spawn approach clear for logistics.
  const towerOffsets = [[2,0],[0,2],[-2,0],[0,-2],[2,1],[-2,1],[2,-1],[-2,-1],[1,2],[-1,2],[1,-2],[-1,-2],[2,2],[-2,2],[2,-2],[-2,-2]];
  for (const [dx, dy] of towerOffsets) {
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
    if (Game.time % 50 === 0) console.log('buildPlan for', room.name, 'sources:', room.find(FIND_SOURCES).length, 'sites:', room.find(FIND_CONSTRUCTION_SITES).length, 'memory sources:', Object.keys(Memory.rooms[room.name].sources).length);
    placeExtensions(room);
    placeContainers(room);
    placeRoads(room);
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
