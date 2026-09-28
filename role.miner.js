// role.miner.js - harvests minerals once an Extractor exists (RCL 6+)
module.exports = function (creep) {
  const minerals = creep.room.find(FIND_MINERALS);
  if (!minerals.length) return;
  const mineral = minerals[0];
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.harvest(mineral) === ERR_NOT_IN_RANGE) creep.moveTo(mineral);
  } else {
    let dump = creep.room.find(FIND_MY_SPAWNS)[0];
    const mem = Memory.rooms?.[creep.room.name]?.sources;
    for (const sid in (mem || {})) {
      const cp = mem[sid].containerPos;
      if (!cp || cp.x == null || cp.y == null || !cp.roomName) continue;
      const c = new RoomPosition(cp.x, cp.y, cp.roomName);
      const cont = c.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER);
      if (cont) { dump = cont; break; }
    }
    if (creep.transfer(dump, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(dump);
  }
};
