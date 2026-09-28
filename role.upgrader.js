// role.upgrader.js - spend ALL energy on the controller before returning for more
module.exports = function (creep) {
  const c = creep.room.controller;
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  // If we have energy, upgrade until empty. Only withdraw when we have nothing left.
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c);
  } else {
    const r = creep.withdraw(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r === ERR_NOT_ENOUGH_RESOURCES) {
      const src = creep.pos.findClosestByPath(FIND_SOURCES);
      if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    }
  }
};
