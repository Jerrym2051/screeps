// role.hauler.js - logistics.
// Topology:
//  - harvest-buffer containers (adjacent to a source) are DRAINED: harvesters
//    dump into them, the hauler pulls energy out toward the bank.
//  - spawn-side overflow containers (not adjacent to a source) are FILLED: they
//    hold surplus when the bank (spawn + extensions) is full.
// A container is only ever a source OR a sink in a given trip, never both, which
// kills the sit-and-thrash bounce where a hauler withdrew and deposited back into
// the same source-area container.
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const sources = creep.room.find(FIND_SOURCES);
  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);

  const usable = s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner);
  // matches the harvester's dump radius so any container a harvester can deposit
  // to is treated as a harvest buffer (drain target), not an overflow (fill target).
  const isBuffer = c => sources.some(s => c.pos.getRangeTo(s) <= 3);
  const roomCont = () => creep.room.find(FIND_STRUCTURES, { filter: usable });

  // --- Deposit mode: empty the carry. ---
  if (used > 0) {
    const isBank = s => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    // 1) top off the most-empty bank structure in range, then anywhere in the room.
    const bank = (creep.pos.findInRange(FIND_MY_STRUCTURES, 3, { filter: isBank })
      .sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY))[0])
      || (creep.room.find(FIND_MY_STRUCTURES, { filter: isBank })
        .sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY))[0]);
    if (bank) { if (creep.transfer(bank, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(bank, { reusePath: 5 }); return; }

    // 2) Banks full: fund the tower (defense + auto-repair) from surplus, only while
    //    the bank stays healthy enough to keep the income backbone running. A tower
    //    is a 1000-capacity sink, so never starve the spawn/extensions for it.
    const tw = creep.room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (tw.length && creep.room.energyAvailable >= 400) {
      const t = tw.sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY))[0];
      if (creep.transfer(t, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(t, { reusePath: 5 });
      return;
    }

    // 3) Banks full: spill into the spawn-side overflow container closest to the
    //    spawn. Never into a buffer (== the bounce source).
    const spill = roomCont().filter(c => !isBuffer(c) && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && c.id !== creep.memory.haulSrc)
      .sort((a, b) => a.pos.getRangeTo(spawn) - b.pos.getRangeTo(spawn))[0];
    if (spill) { if (creep.transfer(spill, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spill, { reusePath: 5 }); return; }

    // 4) No bank room and nowhere to spill: hold near the spawn and wait for a
    //    builder/upgrader to create headroom. Dropping here only feeds looter churn.
    if (spawn && creep.pos.getRangeTo(spawn) > 1) creep.moveTo(spawn, { reusePath: 5 });
    return;
  }

  // --- Withdraw mode: fill from the fullest harvest buffer, then drops, then harvest. ---
  const buffers = roomCont().filter(c => isBuffer(c) && c.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
  if (buffers.length) {
    const best = buffers.sort((a, b) => b.store.getUsedCapacity(RESOURCE_ENERGY) - a.store.getUsedCapacity(RESOURCE_ENERGY))[0];
    creep.memory.haulSrc = best.id;
    if (creep.withdraw(best, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(best, { reusePath: 5 });
    return;
  }
  const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0 });
  if (dropped) { if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) { creep.moveTo(dropped, { reusePath: 5 }); } return; }
  const src = creep.pos.findClosestByPath(FIND_SOURCES);
  if (src) { if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src, { reusePath: 5 }); }
};
