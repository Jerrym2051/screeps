// role.claimer.js - travel to memory.targetRoom, claim its neutral controller,
// then reserve it to hold ownership at RCL1. Cross into the unseen east room.
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
// candidate y values along the east exit column (the pather traversed these to reach (49,23))
const SCAN_Y = [23, 20, 22, 24, 26, 28, 19, 21, 25, 27, 17];

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
      // move() along exit tiles / across the border is a no-op on this server
      // (returns OK, 0 movement). So: reposition to a walkable (49,y) via the PATHER
      // (which does move along the exit), then attempt move(dir) to cross at that y.
      if (!creep.memory.si) creep.memory.si = 0;
      const crossTick = Game.time % 2 === 0;
      const sy = SCAN_Y[creep.memory.si % SCAN_Y.length];

      if (crossTick) {
        const r = creep.move(dir);
        if (creep.pos.roomName === targetRoom) { console.log('[claimer] CROSSED ' + targetRoom + ' at ' + creep.pos); return; }
        if (Game.time % 3 === 0) console.log('[CLM2] X ' + creep.pos + ' y=' + creep.pos.y + ' move(' + dir + ')=' + r + ' ->' + creep.pos.roomName + ' body=' + creep.body.map(p => p.type).join(''));
        creep.memory.si = (creep.memory.si + 1) % SCAN_Y.length; // didn't cross here: next y
      } else {
        // reposition to (49, sy) via pather (raw move along exits is a no-op)
        const mr = creep.moveTo(new RoomPosition(49, sy, creep.pos.roomName), { reusePath: 0 });
        if (Game.time % 3 === 0) console.log('[CLM2] S ' + creep.pos + ' ->y=' + sy + ' mr=' + mr + ' room=' + creep.pos.roomName);
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
    else if (r === 0) { console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time + ' pos=' + creep.pos + ''); }
    else if (r < 0) { console.log('[claimer] claim err ' + r + ' at ' + creep.pos); }
  } else {
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
  }
};
