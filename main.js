// main.js - multi-room loop: memory cleanup -> run all creeps by role -> spawn -> build plan
const config = require('config');
const build = require('build');
const defense = require('defense');
const roles = {
  harvester: require('role.harvester'),
  hauler: require('role.hauler'),
  upgrader: require('role.upgrader'),
  builder: require('role.builder'),
  claimer: require('role.claimer'),
  looter: require('role.looter'),
  miner: require('role.miner'),
  defender: require('role.defender'),
  repairer: require('role.repairer'),
};

// Get all rooms we need to manage, sorted by priority
function getManagedRooms() {
  const owned = config.getOwnedRooms();
  // Also include outposts we have in memory but cant see yet
  if (Memory.rooms) {
    for (const name in Memory.rooms) {
      const stage = Memory.rooms[name].stage;
      if (stage === 'outpost' || stage === 'expansion') {
        if (!Game.rooms[name]) {
          // We know about this room but cant see it - add a placeholder
          owned.push({ name: name, controller: null, my: false, find: () => [] });
        }
      }
    }
  }
  return owned;
}

module.exports.loop = function () {
  // 1. clean up memory for dead creeps across all rooms
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }
  // 1b. clean up stale containerPos entries missing roomName
  if (Memory.rooms) {
    for (const roomName in Memory.rooms) {
      const sources = Memory.rooms[roomName].sources;
      if (sources) {
        for (const sid in sources) {
          if (sources[sid].containerPos && !sources[sid].containerPos.roomName) {
            delete sources[sid].containerPos;
          }
        }
      }
      // clean up empty room entries
      if (!Memory.rooms[roomName].sources || Object.keys(Memory.rooms[roomName].sources).length === 0) {
        // keep if we have other data
      }
    }
  }

  // 2. manage each room
  const rooms = getManagedRooms();
  for (const room of rooms) {
    const roomName = room.name;
    const isVisible = !!Game.rooms[roomName];

    // Track room stage in memory
    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    if (!Memory.rooms[roomName].stage) {
      Memory.rooms[roomName].stage = isVisible && room.controller && room.controller.my ? 'home' : 'outpost';
    }
    if (!Memory.rooms[roomName].controllerLevel && isVisible && room.controller) {
      Memory.rooms[roomName].controllerLevel = room.controller.level;
    }
    if (isVisible && room.controller) {
      if (room.controller.my) Memory.rooms[roomName].stage = 'home';
      if (!Memory.rooms[roomName].claimedAt && room.controller.my) Memory.rooms[roomName].claimedAt = Game.time;
    }
    // Update controller level tracking
    if (isVisible && room.controller && room.controller.level > (Memory.rooms[roomName].controllerLevel || 0)) {
      Memory.rooms[roomName].controllerLevel = room.controller.level;
    }

    // Skip creep execution for rooms we cant see (can only manage memory/spawn planning)
    if (!isVisible) continue;

    // 2a. run every live creep by its role (self-heal old nested-memory creeps)
    const spawn = Game.spawns['Spawn1'];
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      // Skip creeps that belong to other rooms (only manage home room creeps here)
      // Actually, manage all creeps regardless - they are in this room
      if (!creep.memory.role && creep.memory.memory && creep.memory.memory.role) {
        creep.memory.role = creep.memory.memory.role;
        if (creep.memory.memory.sourceId) creep.memory.sourceId = creep.memory.memory.sourceId;
        delete creep.memory.memory;
      }
      // worker protection: if threatened, flee instead of working
      // the spawn is a safe zone - never interrupt a worker that is already at it
      if (!defense.isCombat(creep.memory.role)) {
        if (spawn && spawn.pos.getRangeTo(creep) <= 2) {
          // at spawn = safe zone, skip flee check
        } else {
          const hostiles = defense.getHostilesNear(creep);
          if (defense.isThreatened(creep, hostiles)) { defense.flee(creep, hostiles); continue; }
        }
      }
      const fn = roles[creep.memory.role];
      if (fn) fn(creep);
      else creep.suicide();
    }

    // 2b. run claimer for this room if controller is not ours
    if (room.controller && !room.controller.my) {
      // find any claimers in this room and run them
      const claimers = Object.values(Game.creeps).filter(c => c.memory.role === 'claimer' && c.room.name === roomName);
      for (const c of claimers) {
        if (!c.memory.role && c.memory.memory && c.memory.memory.role) {
          c.memory.role = c.memory.memory.role;
          delete c.memory.memory;
        }
        const fn = roles[c.memory.role];
        if (fn) fn(c);
      }
    }

    // 3. spawn missing roles in this room
    if (room.find(FIND_MY_SPAWNS).length > 0) {
      config.manageSpawns(room);
    }

    // 4. idempotent construction plan
    console.log('buildPlan called for', room.name, 'build type:', typeof build, 'buildPlan type:', build && typeof build.buildPlan);
    if (build && build.buildPlan) build.buildPlan(room);

    // 5. tower active defense + safe mode
    defense.manageTowers(room);
    defense.manageSafeMode(room);
  }

  // 6. expansion logic: find and claim ALL adjacent rooms in every direction
  const homeRoom = config.getHomeRoom();
  if (homeRoom && homeRoom.controller && homeRoom.controller.my && homeRoom.controller.level >= 2) {
    const m = homeRoom.name.match(/^([WE])(\d+)([NS])(\d+)$/);
    if (m) {
      const [, wS, wN, nS, nN] = m;
      const w = parseInt(wN), n = parseInt(nN);
      // Scan all 8 compass directions with unlimited range
      const directions = [
        [0, 1], [0, -1], [1, 0], [-1, 0],  // cardinal
        [1, 1], [1, -1], [-1, 1], [-1, -1],  // diagonal
      ];
      for (const [dx, dy] of directions) {
        for (let dist = 1; dist <= 10; dist++) {
          const rw = w + dx * dist;
          const rn = n + dy * dist;
          const neighborName = wS + rw + nS + rn;
          const nRoom = Game.rooms[neighborName];
          if (nRoom && nRoom.controller && !nRoom.controller.my) {
            if (!Memory.rooms[neighborName]) {
              Memory.rooms[neighborName] = { stage: 'outpost', priority: config.getRoomPriority(neighborName) };
            } else if (Memory.rooms[neighborName].stage === 'expansion') {
              Memory.rooms[neighborName].stage = 'outpost';
            }
          }
          if (!nRoom || !nRoom.controller || !nRoom.controller.my) {
            if (!Memory.rooms[neighborName]) {
              Memory.rooms[neighborName] = { stage: 'expansion', priority: config.getRoomPriority(neighborName) };
            } else if (!Memory.rooms[neighborName].stage || Memory.rooms[neighborName].stage === 'outpost') {
              Memory.rooms[neighborName].stage = 'expansion';
            }
          }
        }
      }
    }
  }
};
