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

// Find the best dump target for a full harvester
function findDumpTarget(creep, source) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  
  // Priority 1: source container (if exists and has space)
  const mem = Memory.rooms?.[creep.room.name]?.sources?.[source?.id]?.containerPos;
  if (mem && mem.x != null && mem.y != null && mem.roomName) {
    const pos = new RoomPosition(mem.x, mem.y, mem.roomName);
    const site = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER);
    if (site && site.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return site;
  }
  // Priority 2: storage (RCL 4+)
  if (c && c.level >= 4) {
    const storage = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_STORAGE && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    })[0];
    if (storage) return storage;
  }
  // Priority 3: spawn
  return spawn;
}

// Is the spawn blocked by other creeps?
function spawnIsBlocked(creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return false;
  const near = creep.room.lookForAt(LOOK_CREEPS, spawn.pos.x, spawn.pos.y);
  return near.length >= 5;
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
    // Harvesting
    if (creep.harvest(targetSource) === ERR_NOT_IN_RANGE) {
      creep.moveTo(targetSource, { reusePath: 5 });
    }
  } else {
    // Full — dump
    const dump = findDumpTarget(creep, source);
    const res = creep.transfer(dump, RESOURCE_ENERGY);
    if (res === ERR_NOT_IN_RANGE) {
      creep.moveTo(dump);
    } else if (res !== OK && dump !== spawn) {
      // Try alternative dump or go to spawn
      const altDump = findDumpTarget(creep, source);
      if (altDump !== dump) {
        creep.moveTo(altDump);
      } else if (spawn) {
        creep.moveTo(spawn, { reusePath: 3 });
      }
    } else if (res !== OK && dump === spawn) {
      // Spawn blocked — try to find another target or upgrade
      if (c && creep.pos.getRangeTo(c) <= 3) {
        creep.upgradeController(c);
      } else if (spawn) {
        creep.moveTo(spawn, { reusePath: 3 });
      }
    }
  }
};
