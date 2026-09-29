// role.hauler.js - logistics: drain full containers -> the energy BANK
// (extensions + spawn). Deposits FULLY before re-hauling.
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const controller = creep.room.controller;
  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

  // --- Deposit mode: drain the carry until it's empty. ---
  // The old dispatch keyed withdrawals on `freeCap > 0`, so a full hauler dropping
  // 50 into one extension (carry now showing free space) immediately flipped back
  // into WITHDRAW mode and re-hauled from the containers instead of top-filling the
  // remaining empty extensions/spawn. Key on `used > 0` so we keep depositing until
  // the carry is clean. Never push energy back INTO a container (it's a source,
  // not a bank).
  if (used > 0) {
    const isBank = s => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    const inRange = creep.pos.findInRange(FIND_MY_STRUCTURES, 3, { filter: isBank });
    if (inRange.length) {
      const best = inRange.reduce((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) >= b.store.getFreeCapacity(RESOURCE_ENERGY) ? a : b);
      if (creep.transfer(best, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(best, { reusePath: 5 });
      return;
    }
    const roomWide = creep.room.find(FIND_MY_STRUCTURES, { filter: isBank });
    if (roomWide.length) {
      const best = roomWide.reduce((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) >= b.store.getFreeCapacity(RESOURCE_ENERGY) ? a : b);
      if (creep.transfer(best, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(best, { reusePath: 5 });
      return;
    }
    // All banks full: hold near the spawn and wait for a spawner/builder to create
    // headroom. Dropping on the ground here would just cause looter churn.
    if (spawn && creep.pos.getRangeTo(spawn) > 1) creep.moveTo(spawn, { reusePath: 5 });
    return;
  }

  // --- Withdraw mode (carry empty): fill from the fullest usable container, ---
  // then any dropped resources, then harvest as a last resort (never steal from
  // the spawn's own buffer — that is not a renewable source).
  if (free > 0) {
    const full = creep.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    });
    if (full.length) {
      const best = full.reduce((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) >= b.store.getUsedCapacity(RESOURCE_ENERGY) ? a : b);
      if (creep.withdraw(best, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(best, { reusePath: 5 });
      return;
    }
    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0 });
    if (dropped && creep.pickup(dropped) === ERR_NOT_IN_RANGE) { creep.moveTo(dropped); return; }
    const src = creep.pos.findClosestByPath(FIND_SOURCES);
    if (src) { if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src); }
  }
};
