// role.hauler.js - logistics: containers/storage -> spawn; upgrades when nothing to haul
module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    let found = false;
    // Withdraw from the fullest usable container (ours OR ownerless-but-usable);
    // scanning all of them (not just memory's single dump spot) is what lets a
    // hauler drain the 2000-energy source container the harvesters filled.
    const full = creep.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    });
    if (full.length) {
      const best = full.reduce((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) >= b.store.getUsedCapacity(RESOURCE_ENERGY) ? a : b);
      const r = creep.withdraw(best, RESOURCE_ENERGY);
      if (r === ERR_NOT_IN_RANGE) creep.moveTo(best, { reusePath: 5 });
      else if (r !== OK && Game.time % 50 === 0) console.log('HAULER ' + creep.name + ' withdraw err=' + r + ' tgt=' + best.pos.x + ',' + best.pos.y + ' my=' + best.my + ' owner=' + best.owner + ' used=' + best.store.getUsedCapacity(RESOURCE_ENERGY));
      found = true;
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
    // Logistics chain: top the energy BANK up. Fill empty extensions first (each
    // +50 capacity, capped by RCL), then the spawn, so energyAvailable reaches
    // energyCapacityAvailable and bodies scale up (2-WORK harvesters/builders)
    // instead of staying carry-trip 1-WORK at the spawn-only bank.
    const ext = creep.pos.findInRange(FIND_MY_STRUCTURES, 3, {
      filter: s => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    })[0];
    if (ext) {
      if (creep.transfer(ext, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(ext);
    } else {
      const r = creep.transfer(spawn, RESOURCE_ENERGY);
      if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
      else if (r !== OK) { if (c && creep.upgradeController(c) === ERR_NOT_IN_RANGE) creep.moveTo(c); }
    }
  }
};
