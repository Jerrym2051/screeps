// role.hauler.js - logistics.
// Two tiers:
//  - Large haulers (>= 6 body parts): full container <-> spawn/extensions/storage loop.
//  - Emergency bootstrap haulers (< 6 parts): short trips storage <-> spawn/extensions
//    only, skipping containers. Keeps the starved spawn banked so it can build bigger creeps.
// Sticks with a chosen container until it can no longer fill the hauler's free
// capacity, avoiding thrash between targets picked by other haulers.
module.exports = function (creep) {
  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const isSmall = creep.body.length < 6;

  if (used > 0) {
    // DEPOSIT: top off spawn/extensions, most-empty (most free capacity) first.
    const isBank = s => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    const banks = creep.pos.findInRange(FIND_MY_STRUCTURES, 3, { filter: isBank })
      .sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY));

    // Try each in-range bank: deposit if adjacent, move if not yet adjacent,
    // skip if a peer filled it since the find (ERR_FULL).
    for (const b of banks) {
      const res = creep.transfer(b, RESOURCE_ENERGY);
      if (res === OK) return;                         // deposited
      if (res === ERR_NOT_IN_RANGE) {                 // not adjacent — walk to it
        creep.moveTo(b, { reusePath: 5 });
        return;
      }
      // ERR_FULL: bank filled by a peer this tick, try the next in-range bank
    }

    // No in-range bank with space: go to the room-wide most-empty bank.
    const roomBank = creep.room.find(FIND_MY_STRUCTURES, { filter: isBank })
      .sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY))[0];
    if (roomBank) {
      if (creep.transfer(roomBank, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(roomBank, { reusePath: 5 });
      return;
    }

    // Banks full: dump to storage, then move on.
    const storages = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_STORAGE && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (storages.length) {
      if (creep.transfer(storages[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(storages[0], { reusePath: 5 });
      return;
    }

    // Everything full — hold near the spawn.
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && creep.pos.getRangeTo(spawn) > 1) creep.moveTo(spawn, { reusePath: 5 });
    return;
  }

  // WITHDRAW
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

  // Emergency bootstrap: small haulers skip containers entirely and shuttle
  // from storage to spawn/extensions. Short trips near the spawn so the
  // starved bank gets energy fast and can build bigger haulers.
  if (isSmall) {
    const storages = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_STORAGE && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 });
    if (storages.length) {
      const res = creep.withdraw(storages[0], RESOURCE_ENERGY);
      if (res === ERR_NOT_IN_RANGE) creep.moveTo(storages[0], { reusePath: 5 });
      return;
    }
    // No storage with energy — hold near spawn, can't help from containers.
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && creep.pos.getRangeTo(spawn) > 1) creep.moveTo(spawn, { reusePath: 5 });
    return;
  }

  // Large hauler: pull from the fullest container. Once a target is chosen,
  // stick with it until it can no longer fill the hauler's free capacity.

  // Check current target — only abandon if it can't fill us completely.
  if (creep.memory.targetId) {
    const cur = Game.getObjectById(creep.memory.targetId);
    if (cur && cur.structureType === STRUCTURE_CONTAINER &&
        cur.store.getUsedCapacity(RESOURCE_ENERGY) >= free) {
      if (creep.withdraw(cur, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(cur, { reusePath: 5 });
      return;
    }
    delete creep.memory.targetId;
  }

  // Current target is gone, drained, or no longer viable — pick the fullest.
  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  }).sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY));

  for (const c of containers) {
    const res = creep.withdraw(c, RESOURCE_ENERGY);
    if (res === OK) {
      creep.memory.targetId = c.id;
      return;
    }
    if (res === ERR_NOT_IN_RANGE) {
      creep.memory.targetId = c.id;
      creep.moveTo(c, { reusePath: 5 });
      return;
    }
    // ERR_NOT_ENOUGH_RESOURCES or other: container drained by a peer, try next
  }
  delete creep.memory.targetId;
};
