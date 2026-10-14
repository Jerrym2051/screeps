// role.builder.js - builds construction sites; upgrades controller when idle
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  const lvl = c ? c.level : 0;

  // Target priority: a source container stored in memory (the income unlock that
   // reroutes harvesters to an on-site dump, killing the far source<->spawn walk), then
   // the closest non-rampart site (ramparts are a pure drain below RCL3, so skip them
   // pre-RCL3 and upgrade the controller instead). When several source containers
   // exist, finish the one CLOSEST to the spawn first — its source's harvesters are
   // already nearest the spawn, so completing it first lets them start dumping on-site
   // sooner, spiking income and unblocking the RCL2 income gate (bank > 300).
   let site = null;
  const mem = Memory.rooms?.[creep.room.name]?.sources;
  if (mem) {
    const candidates = [];
    for (const sid in mem) {
      const cp = mem[sid].containerPos;
      if (!cp || cp.roomName !== creep.room.name) continue;
      const s = new RoomPosition(cp.x, cp.y, cp.roomName).lookFor(LOOK_CONSTRUCTION_SITES)[0];
      if (s) candidates.push(s);
    }
    if (candidates.length) {
      site = candidates.reduce((a, b) =>
        (a.pos.getRangeTo(spawn) <= b.pos.getRangeTo(spawn) ? a : b));
    }
  }
  if (!site) {
    const sites = creep.room.find(FIND_CONSTRUCTION_SITES, {
      filter: s => (lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)
        && (lvl >= 2 || s.structureType !== STRUCTURE_ROAD) });
    // With the income containers built, extensions become the bottleneck: until they
    // exist the energy bank is capped at the spawn's 300, so 2-WORK builders (and a
    // full RCL3 push) never arrive. Prioritize extension sites over the bank-buffer
    // containers / roads so they get built before anything else drains builder energy.
    const extSites = sites.filter(s => s.structureType === STRUCTURE_EXTENSION);
    if (extSites.length) site = creep.pos.findClosestByPath(extSites);
    else if (sites.length) site = creep.pos.findClosestByPath(sites);
  }

  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

  // Empty — need energy. Withdraw from the nearest usable container (ours OR the
  // ownerless ones this server lets us interact with — the source container can
  // hold 2000, enough to keep the bank funded), then extensions, then the spawn,
  // then mine the source. Withdrawing from the container (not the spawn) is what
  // keeps spawn energy available to actually build a hauler during the cold-start.
  // Empty — STORAGE ONLY. No containers, no spawn, no extensions, no harvesting.
  // Idle at the site if storage is dry.
  if (used === 0) {
    const storage = creep.room.storage;
    if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(storage, { reusePath: 5 });
      return;
    }
    // Storage dry — move to site and wait.
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
