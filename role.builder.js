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
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) >= 45) {
    // Refill only when nearly EMPTY so we put ALL energy to work first (build ~45
    // ticks per trip) instead of topping off 1 energy after every build and camping
    // the spawn tiles (which blocks harvesters' drop-off route). Pull the spawn's
    // FULL available amount in one withdrawal (min(freeCarry, available)); only mine
    // the source when the spawn is empty. One withdrawal then leave to build.
    // Withdraw from a filled source container, else a filled extension (the energy
    // pool the harvesters are topping off), else the spawn, else mine the source.
    const cont = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_EXTENSION) && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    if (cont) {
      if (creep.withdraw(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(cont);
    } else if (spawn && spawn.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
    } else {
      const src = creep.pos.findClosestByRange(FIND_SOURCES);
      if (src && creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
    }
  } else if (!site) {
    if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c);
  } else if (creep.build(site) === ERR_NOT_IN_RANGE) {
    creep.moveTo(site, { reusePath: 5 });
  }
};
