// role.builder.js - builds construction sites; upgrades controller when idle
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const r = creep.withdraw(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r === ERR_NOT_ENOUGH_RESOURCES) {
      const src = creep.pos.findClosestByPath(FIND_SOURCES);
      if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    }
  } else if (!site) {
    if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c);
  } else if (creep.build(site) === ERR_NOT_IN_RANGE) {
    creep.moveTo(site, { reusePath: 5 });
  }
};
