// role.looter.js - collects DROPPED resources ONLY. When there is nothing on
// the ground it returns any carried energy and then PARKS — it must never
// withdraw from the spawn or harvest a source: those are not "dropped" energy,
// and treating them as loot just moves spawn energy spawn->carry->spawn,
// starving the spawn pool and burning move upkeep for zero gain.
module.exports = function (creep) {
  const room = creep.room;
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const controller = room.controller;

  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    // Pick up what is actually on the ground.
    const drop = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES);
    if (drop) {
      if (creep.pickup(drop) === ERR_NOT_IN_RANGE) creep.moveTo(drop);
      return;
    }
    // Nothing to loot: idle. Park adjacent to the spawn (not ON it, so we
    // don't block spawning/recycling) and do NOT steal its energy.
    if (spawn && creep.pos.getRangeTo(spawn) > 1) creep.moveTo(spawn);
    return;
  }

  // Carrying loot: deposit it. Prefer a usable container, else the spawn/bank.
  let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });
  if (!target) target = spawn;
  if (target) {
    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target);
    return;
  }
  // Nowhere to deposit: burn it on the controller rather than sit on a full load.
  if (controller && creep.upgradeController(controller) === ERR_NOT_IN_RANGE) creep.moveTo(controller);
};
