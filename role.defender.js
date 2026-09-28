// role.defender.js - engage hostiles only when our force outmatches theirs.
// Otherwise hold a defensive position near the core.
const defense = require('defense');

function totalAttack(creeps) {
  return creeps.reduce((s, c) => s + c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK), 0);
}

function weCanWin(creep, hostiles) {
  if (!hostiles.length) return false;
  const defenders = Object.values(Game.creeps).filter(c => c.memory.role === 'defender' && c.room.name === creep.room.name);
  const ourAttack = totalAttack(defenders);
  const theirAttack = hostiles.reduce((s, h) => s + h.getActiveBodyparts(ATTACK) + h.getActiveBodyparts(RANGED_ATTACK), 0);
  return ourAttack > theirAttack * 1.5;
}

module.exports = function (creep) {
  const hostiles = defense.getHostilesNear(creep);
  const melee = creep.body.filter(p => p.type === ATTACK && p.hits > 0).length;
  const ranged = creep.body.filter(p => p.type === RANGED_ATTACK && p.hits > 0).length;
  const heal = creep.body.filter(p => p.type === HEAL && p.hits > 0).length;

  if (heal > 0 && creep.hits < creep.hitsMax * 0.4) { creep.heal(creep); return; }

  if (!hostiles.length) {
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && creep.pos.getRangeTo(spawn) > 3) creep.moveTo(spawn, { reusePath: 5 });
    return;
  }

  if (!weCanWin(creep, hostiles)) {
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && creep.pos.getRangeTo(spawn) > 3) creep.moveTo(spawn, { reusePath: 5 });
    return;
  }

  const target = defense.findTarget(creep, hostiles);
  if (!target) return;
  creep.moveTo(target, { reusePath: 3 });
  const range = creep.pos.getRangeTo(target);
  if (range <= 1 && melee > 0) creep.attack(target);
  else if (range <= 3 && ranged > 0) creep.rangedAttack(target);
};
