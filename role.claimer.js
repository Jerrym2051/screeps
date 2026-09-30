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
    // Cross into an unseen adjacent room. moveTo(RoomPosition in unseen room) returns
    // -2 at the border (the pather can't resolve the unseen room's terrain, so it never
    // emits the border-cross step). move(exitDir) is a no-op for cross-room on this
    // server (returns OK, 0 movement). So plan the path OURSELF with PathFinder,
    // treating the unseen target room as plain walkable terrain via roomCallback; that
    // yields a path that crosses the exit, which moveByPath then executes.
    const res = PathFinder.search(creep.pos, { pos: new RoomPosition(25, 25, targetRoom), range: 1 }, {
      maxRooms: 2,
      maxCost: 1000,
      roomCallback: function (roomName) {
        if (roomName === creep.pos.roomName) return undefined;      // real terrain for home
        return new PathFinder.CostMatrix();                         // unseen room: all walkable
      }
    });
    if (res.path.length >= 2) {
      const r = creep.moveByPath(res.path);
      if (Game.time % 5 === 0) console.log('[CLM2] PF len=' + res.path.length + ' mbp=' + r + ' pos=' + creep.pos + ' next=' + res.path[1] + ' ->room=' + creep.pos.roomName);
      return;
    }
    // No custom path: fall back to a plain path toward the target room.
    const mr = creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    if (Game.time % 5 === 0) console.log('[CLM2] PF-empty mr=' + mr + ' pos=' + creep.pos);
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
    else if (r === 0) { /* reserved */ }
  }
};
