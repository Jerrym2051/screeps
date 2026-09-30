// role.upgrader.js - spend ALL energy on the controller before returning for more.
// Pull from the source CONTAINER first, NOT the spawn: the container is the
// harvester's buffer, so feeding the upgrader from it (instead of the bank) stops the
// upgrader from draining the spawn/extensions and starving spawns/haulers on a fragile
// 1-source economy. Spawn and direct-harvest are dry fallbacks only.
module.exports = function (creep) {
  const c = creep.room.controller;
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
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
