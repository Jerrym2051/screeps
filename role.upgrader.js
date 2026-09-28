// role.upgrader.js - withdraws energy and upgrades the controller; harvests if spawn is empty
module.exports = function (creep) {
  const c = creep.room.controller;
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const r = creep.withdraw(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r === ERR_NOT_ENOUGH_RESOURCES) {
      const src = creep.pos.findClosestByPath(FIND_SOURCES);
      if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    }
  } else {
    if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c);
  }
};
