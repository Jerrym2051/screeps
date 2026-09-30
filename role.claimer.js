// role.claimer.js - travel to `memory.targetRoom`, claim its neutral controller,
// then reserve it to hold ownership at RCL1 (no upgrade energy burned). Used for
// the first eastward outpost claim.
function exitDirTo(fromName, toName) {
  const p = n => { const m = n.match(/^([WE])(\d+)([NS])(\d+)$/); return m ? { ew: m[1], ex: +m[2], ns: m[3], ny: +m[4] } : null; };
  const a = p(fromName), b = p(toName);
  if (!a || !b) return -1;
  if (a.ex < b.ex) return RIGHT;   // higher E coordinate = east
  if (a.ex > b.ex) return LEFT;    // lower E coordinate = west
  if (a.ny < b.ny) return BOTTOM;  // higher S coordinate = south
  if (a.ny > b.ny) return TOP;     // lower S coordinate = north
  return -1;
}

module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  if (!targetRoom) return;

  if (creep.room.name !== targetRoom) {
    // Diagnostic: log how move(exitDir) behaves at the border (every 25 ticks).
    if (Game.time % 25 === 0) {
      const fd = creep.room.findExitTo(targetRoom);
      const ed = exitDirTo(creep.room.name, targetRoom);
      console.log('[CLM2] pos=' + creep.pos + ' exitDir=' + ed + ' findExitTo=' + fd + ' fat=' + creep.fatigue + ' ttl=' + creep.ticksToLive);
    }
    const dir = exitDirTo(creep.room.name, targetRoom);
    if (dir > 0) {
      const r = creep.move(dir);
      if (r === OK) return;            // crossing / walking toward the border
      if (r === ERR_TIRED) return;     // fatigued; will retry next tick
      if (Game.time % 25 === 0) console.log('[CLM2] move(' + dir + ') err=' + r + ' at ' + creep.pos); // blocked somehow
    }
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    return;
  }

  if (!creep.memory.arrived) { console.log('[claimer] ARRIVED ' + targetRoom + ' at ' + creep.pos); creep.memory.arrived = true; }
  const c = creep.room.controller;
  if (!c) return;
  if (!c.my) {
    const r = creep.claimController(c);
    if (r === ERR_NOT_IN_RANGE) { creep.moveTo(c, { reusePath: 5 }); }
    else if (r === 0) { console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time + ' pos=' + creep.pos); }
    else if (r < 0) { console.log('[claimer] claim err ' + r + ' at ' + creep.pos); }
  } else {
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
  }
};
