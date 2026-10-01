// role.harvester.js - parks on an assigned source, fills source container or room spawn
// If home room is blocked, harvest from a nearby room and bring it back
const defense = require('defense');

// Parse room name like "W1N2" into {w:1, n:2} coordinates
function parseRoom(name) {
  const m = name.match(/^([WE])(\d+)([NS])(\d+)$/);
  if (!m) return null;
  return { w: parseInt(m[2]), n: parseInt(m[4]), wSign: m[1], nSign: m[3] };
}

// Build neighbor room name from parsed coords
function roomName(p) {
  return `${p.wSign}${p.w}${p.nSign}${p.n}`;
}

// Find a safe source in a nearby room (returns RoomPosition or null)
function findRemoteSource(creep) {
  const home = parseRoom(creep.room.name);
  if (!home) return null;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [dx, dy] of dirs) {
    const neighbor = { w: home.w + dx, n: home.n + dy, wSign: home.wSign, nSign: home.nSign };
    const name = roomName(neighbor);
    const room = Game.rooms[name];
    if (!room || !room.controller || !room.controller.my) continue;
    if (defense.getHostilesNear(creep).length > 0) continue;
    const sources = room.find(FIND_SOURCES).filter(s => !defense.isSourceDangerous(s, 3));
    if (sources.length > 0) {
      const safe = creep.pos.findClosestByPath(sources);
      if (safe) return safe;
    }
  }
  return null;
}

// Find the best dump target for a full harvester. Prefer the source's container
// (shortest trip), but match ANY built container in the room — not only
// Memory.sources.containerPos — so a stale/mismatched memory entry (which
// happened with the duplicate-container sites) doesn't strand energy at the spawn
// and starve the `filled > 0` hauler gate.
function findDumpTarget(creep, source) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  // 1) source's own container (by memory), verified to actually exist + have space
  const mem = Memory.rooms?.[creep.room.name]?.sources?.[source?.id]?.containerPos;
  if (mem && mem.x != null && mem.y != null && mem.roomName) {
    const pos = new RoomPosition(mem.x, mem.y, mem.roomName);
    const site = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    if (site) return site;
  }
  // 2) any container adjacent to the source (the real source container)
  if (source) {
    const near = source.pos.findInRange(FIND_STRUCTURES, 3, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (near.length) return creep.pos.findClosestByRange(near);
  }
  // (No room-wide container search: harvesters must NOT cross the room to dump into
  // the far spawn-side bank containers — that made them "run around" instead of
  // mining. Those bank containers are the HAULERS' job. If no container near the
  // source has space, fall through to the cold-start/idle logic below.)
  // 4) storage (RCL 4+)
  if (c && c.level >= 4) {
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_STORAGE && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 })[0];
    if (storage) return storage;
  }
  // No container has space. Decide between topping the bank and idling near the source.
  const haulers = creep.room.find(FIND_MY_CREEPS, {
    filter: cr => cr.memory && cr.memory.role === 'hauler'
  });
  // Cold-start (no hauler yet) OR the bank is critically low: dump into the pool so
  // the spawn can build the next hauler/creep. (The old always-on <150 check ping-ponged
  // the harvesters; gating it on "no container space" means it only fires when the
  // containers are genuinely full, i.e. the haulers aren't keeping up.)
  if (haulers.length === 0 || creep.room.energyAvailable < 150) {
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return spawn;
    const ext = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (ext.length) return creep.pos.findClosestByRange(ext);
    return spawn;
  }
  // Bank healthy + hauler running + containers full: DON'T cross the room to the
  // spawn — idle beside the source so we dump the instant a hauler frees space.
  return null;
}

// Is the spawn blocked by other creeps?
function spawnIsBlocked(creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return false;
  const near = creep.room.lookForAt(LOOK_CREEPS, spawn.pos.x, spawn.pos.y);
  return near.length >= 5;
}

// Pick a FREE, walkable tile adjacent to the source for a harvester to wait on
// when the source is crowded. Keeps the source->spawn corridor (the tile a full
// harvester uses to exit toward the spawn) clear, so a departing harvester isn't
// blocked by harvesters queued to mine.
function findWaitTile(creep, source) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const DIR_DELTA = { 1:[0,-1], 2:[1,-1], 3:[1,0], 4:[1,1], 5:[0,1], 6:[-1,1], 7:[-1,0], 8:[-1,-1] };
  let exitX = -1, exitY = -1;
  if (spawn) {
    const d = source.pos.getDirectionTo(spawn.pos);
    const dl = DIR_DELTA[d];
    if (dl) { exitX = source.pos.x + dl[0]; exitY = source.pos.y + dl[1]; }
  }
  const adj = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const terrain = creep.room.getTerrain();
  let best = null, bestDist = Infinity;
  for (const [dx, dy] of adj) {
    const x = source.pos.x + dx, y = source.pos.y + dy;
    if (x < 1 || x > 48 || y < 1 || y > 48) continue;
    if (x === exitX && y === exitY) continue;              // keep exit corridor clear
    if (creep.room.lookForAt(LOOK_CREEPS, x, y).length) continue; // don't stack on another creep
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;       // walkable only
    const dist = Math.abs(x - creep.pos.x) + Math.abs(y - creep.pos.y);
    if (dist < bestDist) { bestDist = dist; best = new RoomPosition(x, y, creep.room.name); }
  }
  return best;
}

module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;

  // Check if home room is blocked — look for remote source
  const safeSources = creep.room.find(FIND_SOURCES).filter(s => !defense.isSourceDangerous(s, 3));
  const source = safeSources.length ? creep.pos.findClosestByPath(safeSources) : null;
  const remoteSource = !source ? findRemoteSource(creep) : null;
  const targetSource = source || remoteSource;
  const isRemote = !!remoteSource;

  if (!targetSource) {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      // Full but nowhere to dump — move toward spawn
      if (c && creep.pos.getRangeTo(c) <= 3) {
        creep.upgradeController(c);
      } else if (spawn) {
        creep.moveTo(spawn, { reusePath: 3 });
      }
    } else if (spawn) {
      creep.moveTo(spawn, { reusePath: 3 });
    }
    return;
  }

  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    // Harvesting. If we can't reach the source (the adjacent tiles are full / we
    // got pushed off), park on a FREE tile NEXT to the source instead of roaming
    // toward the spawn, and keep the source->spawn exit corridor clear so a full
    // harvester can leave to dump without being blocked by waiting ones.
    const h = creep.harvest(targetSource);
    if (h === ERR_NOT_IN_RANGE) {
      const wait = findWaitTile(creep, targetSource);
      if (wait) creep.moveTo(wait, { reusePath: 5 });
      else creep.moveTo(targetSource, { reusePath: 5 });
    }
  } else {
    // Full — dump.
    const dump = findDumpTarget(creep, source);
    // RCL1 cold-start: the spawn caps at 300 (no extensions until RCL2, which needs
    // the upgrader the gate starves of energy), so a full harvester's energy would
    // rot there once the spawn is full. Build the source's own container site in
    // place instead — we're already on the source, so this finishes the
    // income-unlock container faster than the 1-MOVE builders walking from the spawn
    // to the far source site. SAFE: only fires when the spawn is completely full
    // (getFreeCapacity===0), so no deposit-at-spawn is skipped — harvesters still
    // top the spawn whenever it isn't full, preserving the spawn cycle. Energy that
    // would rot at the 300-cap instead pools in a 1500-cap container.
    if (dump && dump.structureType === STRUCTURE_SPAWN && dump.store &&
        dump.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      const site = source && creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 4,
        { filter: s => s.structureType === STRUCTURE_CONTAINER })[0];
      if (site) {
        if (creep.build(site) !== ERR_NOT_IN_RANGE) return;
        creep.moveTo(site, { reusePath: 5 });
        return;
      }
    }
    if (!dump) {
      // Containers full + hauler running + bank healthy: idle on a free tile beside
      // the source (by the containers) so we dump the instant a hauler frees space,
      // instead of crossing the room to the spawn every cycle.
      const wait = findWaitTile(creep, source);
      if (wait) { if (creep.pos.getRangeTo(wait) > 1) creep.moveTo(wait, { reusePath: 5 }); }
      else if (spawn) { creep.moveTo(spawn, { reusePath: 3 }); }
    } else if (dump.structureType === STRUCTURE_CONTAINER) {
      const res = creep.transfer(dump, RESOURCE_ENERGY);
      if (res === ERR_NOT_IN_RANGE) creep.moveTo(dump, { reusePath: 5 });
    } else {
      // Cold-start: top the bank (spawn/extension) so the next hauler/creep can spawn.
      const res = creep.transfer(dump, RESOURCE_ENERGY);
      if (res === ERR_NOT_IN_RANGE) {
        if (c && creep.pos.getRangeTo(c) <= 3) creep.upgradeController(c);
        else creep.moveTo(dump, { reusePath: 3 });
      }
    }
  }
};
