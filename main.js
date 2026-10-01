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
  const rooms = config.getOwnedRooms();
  // Visible rooms targeted by an en-route claimer must be managed too: once a claimer
  // crosses into a new room it must be dispatched there (claim/reserve), so manage any
  // visible room that a live creep is targeting, even if Memory.rooms hasn't staged it.
  const targetRooms = new Set();
  for (const name in Game.creeps) {
    const t = Game.creeps[name].memory && Game.creeps[name].memory.targetRoom;
    if (t) targetRooms.add(t);
  }
  for (const name of targetRooms) {
    if (!rooms.some(r => r.name === name) && Game.rooms[name]) rooms.push(Game.rooms[name]);
  }
  // Also include outposts we have in memory but cant see yet (or that are visible)
  if (Memory.rooms) {
    for (const name in Memory.rooms) {
      const stage = Memory.rooms[name].stage;
      if (stage === 'outpost' || stage === 'expansion') {
        if (!rooms.some(r => r.name === name)) {
          if (Game.rooms[name]) {
            rooms.push(Game.rooms[name]);                       // visible outpost/expansion
          } else {
            rooms.push({ name: name, controller: null, my: false, find: () => [] }); // unseen placeholder
          }
        }
      }
    }
  }
  return rooms;
}

module.exports.loop = function () {
  // Lightweight per-tick profiler (enable by setting Memory._prof = 1 in the console).
  // Logs per-section CPU every 10 ticks with negligible overhead.
  const _prof = Memory._prof ? { t0: Game.cpu.getUsed(), marks: [], cpu: Game.cpu.getUsed() } : null;

  // 1. clean up memory for dead creeps across all rooms
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }
  if (_prof) _prof.marks.push('memCleanup:' + (Game.cpu.getUsed() - _prof.t0));
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

    // 2a. run every live creep by its role. One execution per creep per tick: run
    // each creep only inside the room it is currently in, because this loop runs
    // once per visible room (without this, every creep executes N times when N
    // rooms are visible — critical once we expand into a second room).
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      if (creep.room.name !== roomName) continue;
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

    // 4. idempotent construction plan — throttle to every 5 ticks.
    // buildPlan is idempotent (sites are deduped/silently skipped), so running it
    // every tick just re-ran the same room.find calls and burned CPU.
    if (build && build.buildPlan && Game.time % 5 === 0) build.buildPlan(room);

    // 5. tower active defense + safe mode
    defense.manageTowers(room);
    defense.manageSafeMode(room);

    if (_prof) _prof.marks.push('room[' + roomName + ']:' + (Game.cpu.getUsed() - _prof.t0));
  }

  // 6. expansion logic: find and claim ALL adjacent rooms in every direction.
  // Throttle to every 25 ticks — this scans 80 phantom neighbor names + writes memory
  // every tick otherwise, for no benefit (rooms don't flip ownership 40x/tick).
  if (Game.time % 25 === 0) {
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
  }

  if (_prof) {
    _prof.marks.push('expansion:' + (Game.cpu.getUsed() - _prof.t0));
    if (Game.time % 10 === 0) {
      console.log('_PROF', _prof.marks.join(' '));
    }
  }
};