// role.upgrader.js - spend ALL energy on the controller before returning for more.
// Pull from the source CONTAINER first, NOT the spawn: the container is the
// harvester's buffer, so feeding the upgrader from it (instead of the bank) stops the
// upgrader from draining the spawn/extensions and starving spawns/haulers on a fragile
// 1-source economy. Spawn and direct-harvest are dry fallbacks only.
module.exports = function (creep) {
  const c = creep.room.controller;
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  // Live diagnostic for the ctrlProg stall: record the upgrader's pos + distance to
  // the controller so we can tell (a) whether moveTo(c) is actually moving it and
  // (b) whether upgradeController sees the controller. Wiped after diagnosis.
  if (creep.name.startsWith('upgrader')) {
    (Memory.rooms[creep.room.name] = Memory.rooms[creep.room.name] || {}).upg = {
      t: Game.time, x: creep.pos.x, y: creep.pos.y, rng: c ? creep.pos.getRangeTo(c) : 'noc',
      e: creep.store.energy, rc: c ? creep.upgradeController(c) : 'noc',
      path: PathFinder ? null : null,
    };
  }
  // Shelved by the recruiter: a surplus upgrader (over the target cap) that couldn't
  // be recycled because it wasn't adjacent to the spawn. Roll it back to the spawn so
  // s.recycleCreep succeeds next tick — without this, source1 income coming online
  // (the far container) never lets the bank climb, because 3 upgraders keep draining
  // the spawn-side container faster than 1 source feeds it.
  if (creep.memory.recycle) {
    if (spawn && creep.pos.isNearTo(spawn)) { spawn.recycleCreep(creep); }
    else if (spawn) { creep.moveTo(spawn, { reusePath: 5 }); }
    return;
  }
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c);
    return;
  }
  const cont = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  });
  if (cont) {
    const r = creep.withdraw(cont, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(cont);
    return;
  }
  const r = spawn && creep.withdraw(spawn, RESOURCE_ENERGY);
  if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
  else if (r === ERR_NOT_ENOUGH_RESOURCES || !spawn) {
    const src = creep.pos.findClosestByPath(FIND_SOURCES);
    if (src && creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
  }
};
