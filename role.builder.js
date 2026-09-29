// role.builder.js - builds construction sites; upgrades controller when idle
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  const lvl = c ? c.level : 0;

  // Target priority: the source container stored in memory (the income unlock
  // that unblocks harvesters->container->hauler), then the closest non-rampart
  // site (ramparts are a pure drain below RCL3, so skip them pre-RCL3 and
  // upgrade the controller instead).
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
  if (!site) {
    const sites = creep.room.find(FIND_CONSTRUCTION_SITES, {
      filter: s => lvl >= 3 || s.structureType !== STRUCTURE_RAMPART });
    if (sites.length) site = creep.pos.findClosestByPath(sites);
  }

  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

  // Empty — need energy. Withdraw from the nearest container/extension that has
  // energy (reliable pool), then the spawn, then mine the source. Harvesting the
  // source in-place is only a last resort: with 5 harvesters already saturating a
  // 10/tick source, a local harvest yields nothing and the builder stalls with an
  // empty store (the container never builds). Extensions/spawn have energy for real.
  if (used === 0) {
    const cont = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_EXTENSION) &&
        s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    if (cont) {
      if (creep.withdraw(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(cont, { reusePath: 5 });
      return;
    }
    if (spawn && spawn.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawn, { reusePath: 5 });
      return;
    }
    // Nothing in the pool — mine the source at the site as a last resort.
    const nearSrc = site ? site.pos.findInRange(FIND_SOURCES, 4)[0] : null;
    if (nearSrc) {
      if (creep.harvest(nearSrc) === ERR_NOT_IN_RANGE) creep.moveTo(nearSrc, { reusePath: 5 });
      return;
    }
    // No energy anywhere — just get into position at the site.
    if (site) {
      if (creep.build(site) === ERR_NOT_IN_RANGE) creep.moveTo(site, { reusePath: 5 });
    } else if (c) {
      if (creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
    }
    return;
  }

  // Has energy — build the target site if in range, else move toward it.
  if (site) {
    if (creep.build(site) !== ERR_NOT_IN_RANGE) return;
    creep.moveTo(site, { reusePath: 5 });
  } else if (c) {
    // Nothing productive to build — dump spare energy into the controller.
    if (creep.upgradeController(c) !== ERR_NOT_IN_RANGE) return;
    creep.moveTo(c, { reusePath: 5 });
  }
};
