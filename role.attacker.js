// role.attacker.js - aggressively hunts and attacks hostiles
const defense = require('defense');

module.exports = function (creep) {
  const hostiles = defense.getHostilesNear(creep);

  if (hostiles.length > 0) {
    const target = defense.findTarget(creep, hostiles);
    if (!target) return;
    creep.moveTo(target, { reusePath: 3 });
    const range = creep.pos.getRangeTo(target);
    if (range <= 3 && creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
      creep.rangedAttack(target);
    } else if (range <= 1 && creep.getActiveBodyparts(ATTACK) > 0) {
      creep.attack(target);
    }
    // heal ourselves if damaged
    if (creep.hits < creep.hitsMax * 0.8 && creep.getActiveBodyparts(HEAL) > 0) {
      creep.heal(creep);
    }
    return;
  }

  // No hostiles nearby — move to the room core / spawn area
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && creep.pos.getRangeTo(spawn) > 5) {
    creep.moveTo(spawn, { reusePath: 5 });
  }
};