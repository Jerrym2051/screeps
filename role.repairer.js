// role.repairer.js - keeps ramparts, walls, towers, roads, containers topped up
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  // Empty — grab energy from the source CONTAINER first (not the spawn bank), so the
  // spawn/extensions stay full and the hauler can afford a bigger body. Mirror the
  // builder: container -> extension -> spawn -> mine the source as a last resort.
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    const cont = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) &&
        s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    if (cont) {
      const r = creep.withdraw(cont, RESOURCE_ENERGY);
      if (r === ERR_NOT_IN_RANGE) creep.moveTo(cont);
      return;
    }
    const ext = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    if (ext) {
      if (creep.withdraw(ext, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(ext);
      return;
    }
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    const r = spawn && creep.withdraw(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r === ERR_NOT_ENOUGH_RESOURCES || !spawn) {
      const src = creep.pos.findClosestByPath(FIND_SOURCES);
      if (src && creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    }
    return;
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
