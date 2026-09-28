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
