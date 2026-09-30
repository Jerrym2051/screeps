// role.claimer.js - travel to `memory.targetRoom`, claim its neutral controller,
// then reserve it to hold ownership at RCL1 (no upgrade energy burned). Used for
// the first eastward outpost claim.
function exitDirTo(fromName, toName) {
  const p = n => { const m = n.match(/^([WE])(\d+)([NS])(\d+)$/); return m ? { ew: m[1], ex: +m[2], ns: m[3], ny: +m[4] } : null; };
  const a = p(fromName), b = p(toName);
  if (!a || !b) return -1;
  if (a.ex < b.ex) return RIGHT;
  if (a.ex > b.ex) return LEFT;
  if (a.ny < b.ny) return BOTTOM;
  if (a.ny > b.ny) return TOP;
  return -1;
}

module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  if (!targetRoom) return;

  if (creep.room.name !== targetRoom) {
    const dir = exitDirTo(creep.room.name, targetRoom);
    const atBorder = (dir === RIGHT && creep.pos.x === 49) ||
                     (dir === LEFT && creep.pos.x === 0) ||
                     (dir === TOP && creep.pos.y === 0) ||
                     (dir === BOTTOM && creep.pos.y === 49);

    if (atBorder && dir > 0) {
      // A creep issues only ONE move intent per tick, so we alternate: on a
      // "cross" tick we attempt creep.move(dir); on a "scan" tick we nudge the
      // creep along the border (north/south) to the next candidate exit column.
      // Cross-attempt move(dir)=0 (OK) but no movement means the landing tile in
      // the neighbor is terrain-wall at this y — that is why we scan y.
      if (creep.memory.crossTick) {
        const beforeRoom = creep.pos.roomName;
        const r = creep.move(dir);
        if (Game.time % 5 === 0) console.log('[CLM2] border X ' + beforeRoom + '(' + creep.pos.x + ',' + creep.pos.y + ') move(' + dir + ')=' + r + ' ->' + creep.pos.roomName + ' b=' + creep.body.map(p => p.type).join(''));
        if (creep.pos.roomName === targetRoom) return;        // crossed into E47S42
        if (r === ERR_TIRED) return;
        creep.memory.crossTick = false;                       // next tick: scan y
      } else {
        if (!creep.memory.scanY) creep.memory.scanY = 25;     // center y (most exits open)
        let scanDir = creep.pos.y < creep.memory.scanY ? BOTTOM : TOP;
        if (Math.abs(creep.pos.y - creep.memory.scanY) <= 1) {
          creep.memory.scanY = 5 + ((creep.memory.scanY + 9) % 40);  // next candidate column
          scanDir = creep.pos.y < creep.memory.scanY ? BOTTOM : TOP;
        }
        const sr = creep.move(scanDir);
        if (Game.time % 5 === 0) console.log('[CLM2] border S ' + creep.pos.roomName + '(' + creep.pos.x + ',' + creep.pos.y + ') move(' + scanDir + ')=' + sr + ' scanY=' + creep.memory.scanY);
        creep.memory.crossTick = true;                        // next tick: cross-attempt
      }
      return;
    }

    // Interior: path toward the target room (pather routes to the exit, around blockers).
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    if (Game.time % 25 === 0) console.log('[CLM2] travel ' + creep.pos + ' ttl=' + creep.ticksToLive);
    return;
  }

  // --- Arrived in the target room. ---
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
