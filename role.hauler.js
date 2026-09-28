// role.hauler.js - logistics: containers/storage -> spawn; upgrades when nothing to haul
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    let found = false;
    const mem = Memory.rooms?.[creep.room.name]?.sources;
    if (mem) {
      for (const sid in mem) {
        const cp = mem[sid].containerPos;
        if (!cp || cp.x == null || cp.y == null || !cp.roomName) continue;
        const pos = new RoomPosition(cp.x, cp.y, cp.roomName);
        const container = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER);
        if (container && container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
          if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(container, { reusePath: 5 });
          found = true; break;
        }
      }
    }
    if (!found) {
      // Pick up dropped resources from destroyed construction sites
      const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0
      });
      if (dropped && creep.pickup(dropped) === ERR_NOT_IN_RANGE) { creep.moveTo(dropped); found = true; }
    }
    if (!found) {
      // No containers to haul — harvest from source instead of stealing from spawn
      const src = creep.pos.findClosestByPath(FIND_SOURCES);
      if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
      found = true;
    }
  } else {
    const r = creep.transfer(spawn, RESOURCE_ENERGY);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    else if (r !== OK) { if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c); }
  }
};
