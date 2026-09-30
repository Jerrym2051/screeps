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
    const dir = exitDirTo(creep.room.name, targetRoom);
    // At the room's border edge in the exit direction, drive the cross directly:
    // moveTo(path to unseen room) returns -2 (no path) at the exit and never crosses,
    // but move(exitDir) is the engine's cross-room primitive and crosses on the edge.
    const atBorder = (dir === RIGHT && creep.pos.x === 49) ||
                     (dir === LEFT && creep.pos.x === 0) ||
                     (dir === TOP && creep.pos.y === 0) ||
                     (dir === BOTTOM && creep.pos.y === 49);
    if (atBorder && dir > 0) {
      const r = creep.move(dir);
      if (Game.time % 5 === 0) console.log('[CLM2] CROSS ' + creep.pos + ' move(' + dir + ')=' + r + ' room=' + creep.pos.roomName + ' ttl=' + creep.ticksToLive);
      if (r === OK) return;          // crossed into the target room
      if (r === ERR_TIRED) return;   // fatigued, retry next tick
      // Cross blocked at this border y (wall/exit terrain): scramble along the exit
      // to the next walkable border tile and retry.
      const ny = (creep.pos.y + (Game.time % 7) + 1) % 50;
      const nx = creep.pos.x;
      creep.moveTo(new RoomPosition(nx, ny, creep.pos.roomName), { reusePath: 0 });
      return;
    }
    // Interior: let the pather route toward the target room (it reaches the exit
    // edge and crosses the border via the atBorder branch above).
    const mr = creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    if (Game.time % 25 === 0) console.log('[CLM2] travel mr=' + mr + ' pos=' + creep.pos + ' ttl=' + creep.ticksToLive);
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
