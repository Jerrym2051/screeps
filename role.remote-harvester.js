// role.remote-harvester.js - farm a RESERVED outpost (memory.targetRoom) and bring the
// energy home. This server's pather no-ops moveTo on an unseen/in-path room target, so
// the border is crossed with move(dir) at the exit tile (the same trick as the claimer);
// the interior moveTo toward the source is retried each tick (intermittent but works).
function exitDirTo(fromName, toName) {
  const p = n => { const m = n.match(/^([WE])(\d+)([NS])(\d+)$/); return m ? { ex: +m[2], ny: +m[4] } : null; };
  const a = p(fromName), b = p(toName);
  if (!a || !b) return -1;
  if (a.ex < b.ex) return RIGHT;
  if (a.ex > b.ex) return LEFT;
  if (a.ny < b.ny) return BOTTOM;
  if (a.ny > b.ny) return TOP;
  return -1;
}
function atBorder(creep, dir) {
  return (dir === RIGHT && creep.pos.x === 49) ||
         (dir === LEFT && creep.pos.x === 0) ||
         (dir === TOP && creep.pos.y === 0) ||
         (dir === BOTTOM && creep.pos.y === 49);
}
module.exports = function (creep) {
  const home = creep.memory.homeRoom || 'E46S42';
  const target = creep.memory.targetRoom;
  if (!target) { creep.suicide(); return; }
  const full = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  const carrying = creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  if (Game.time % 25 === 0) console.log('[RHDIAG] ' + (creep.name||'?') + ' @' + creep.pos + ' carry=' + creep.store.getUsedCapacity(RESOURCE_ENERGY) + '/' + creep.store.getCapacity(RESOURCE_ENERGY) + ' full=' + full + ' tgt=' + target + ' dirT=' + (creep.memory.targetRoom) + ' hm=' + exitDirTo(home, target) + '/' + exitDirTo(target, home));

  // HOME: deposit, then (if empty) head toward the target room.
  if (creep.room.name === home) {
    if (carrying) {
      const dest = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      });
      if (dest) { if (creep.transfer(dest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(dest, { reusePath: 5 }); return; }
      // buffers full: hold in place rather than wander (saves ticks for a re-deposit next tick)
      return;
    }
    const dir = exitDirTo(home, target);
    if (dir > 0 && atBorder(creep, dir)) { creep.move(dir); return; }
    creep.moveTo(new RoomPosition(25, 25, target), { reusePath: 0 });
    return;
  }

  // TARGET: harvest; when full carry home.
  if (creep.room.name === target) {
    if (full) {
      const dir = exitDirTo(target, home);
      if (dir > 0 && atBorder(creep, dir)) { creep.move(dir); return; }
      creep.moveTo(new RoomPosition(25, 25, home), { reusePath: 0 });
      return;
    }
    let src = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;
    if (!src || !src.pos || !src.pos.inRoom) src = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (!src) { creep.moveTo(new RoomPosition(25, 25, target), { reusePath: 0 }); return; }
    creep.memory.sourceId = src.id;
    if (Game.time % 10 === 0) console.log('[RH] ' + (creep.name||'?') + ' harvest @' + creep.pos + ' src=' + src.pos + ' carry=' + creep.store.getUsedCapacity(RESOURCE_ENERGY) + '/' + creep.store.getCapacity(RESOURCE_ENERGY));
    if (creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src, { reusePath: 0 });
    return;
  }

  // TRANSIT (neither home nor target): steer toward whichever we're heading to.
  const dest = full ? home : target;
  const dir = exitDirTo(creep.room.name, dest);
  if (dir > 0 && atBorder(creep, dir)) { creep.move(dir); return; }
  creep.moveTo(new RoomPosition(25, 25, dest), { reusePath: 0 });
};
