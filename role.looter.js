// role.looter.js - picks up dropped resources; upgrades when nothing to collect
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const drop = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
    if (drop) {
      if (creep.pickup(drop) === ERR_NOT_IN_RANGE) creep.moveTo(drop);
    } else {
      const r = creep.withdraw(spawn, RESOURCE_ENERGY);
      if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
      else if (r === ERR_NOT_ENOUGH_RESOURCES) {
        const src = creep.pos.findClosestByPath(FIND_SOURCES);
        if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
      }
    }
  } else {
    const r = creep.transfer(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r !== OK) { if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c); }
  }
};
