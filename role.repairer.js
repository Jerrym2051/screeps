// role.repairer.js - keeps ramparts, walls, towers, roads, containers topped up
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const r = creep.withdraw(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r === ERR_NOT_ENOUGH_RESOURCES) {
      const src = creep.pos.findClosestByPath(FIND_SOURCES);
      if (src && creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    }
  } else {
    const dmg = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL ||
                    s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_ROAD ||
                    s.structureType === STRUCTURE_CONTAINER) && s.hits < s.hitsMax * 0.9
    });
    if (!dmg.length) { creep.say('ok'); return; }
    dmg.sort((a, b) => a.hits - b.hits);
    const site = creep.pos.findClosestByPath(dmg);
    if (site && creep.repair(site) === ERR_NOT_IN_RANGE) creep.moveTo(site, { reusePath: 5 });
  }
};
