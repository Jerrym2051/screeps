// role.builder.js - builds construction sites; upgrades controller when idle
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  // Prioritize the source container: building it unlocks the harvester->container->
  // hauler loop that delivers the source's full ~10/tick (vs ~1/tick per carry-trip).
  // If a container site is still unbuilt at a known source containerPos, build it first.
  let site = null;
  const mem = Memory.rooms?.[creep.room.name]?.sources;
  if (mem) {
    for (const sid in mem) {
      const cp = mem[sid].containerPos;
      if (!cp || cp.roomName !== creep.room.name) continue;
      const s = new RoomPosition(cp.x, cp.y, cp.roomName).lookFor(LOOK_CONSTRUCTION_SITES)[0];
      if (s) { site = s; break; }
    }
  }
  if (!site) site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    // Fill WITHOUT camping the spawn: harvesters drop energy at the spawn, so a
    // builder hovering there waiting for the pool to refill blocks their shortest
    // drop-off route. Prefer a filled container (free, usually right at the build
    // site); else the spawn only if it can top us off in one go; else fill at the
    // source. This keeps builders on their build route instead of the spawn tiles.
    const need = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    const cont = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    const src = creep.pos.findClosestByRange(FIND_SOURCES);
    if (cont) {
      if (creep.withdraw(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(cont);
    } else if (spawn && spawn.store.getUsedCapacity(RESOURCE_ENERGY) >= need) {
      if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    } else if (src) {
      if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    } else if (spawn) {
      if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    }
  } else if (!site) {
    if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c);
  } else if (creep.build(site) === ERR_NOT_IN_RANGE) {
    creep.moveTo(site, { reusePath: 5 });
  }
};
