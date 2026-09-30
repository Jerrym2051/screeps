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

  // --- Travel to the target room. ---
  // moveTo(RoomPosition in an unseen room) pathfinds to the border EXIT TILE and
  // then stops: the pather cannot resolve the unseen room's terrain, so it never
  // emits the cross-room step (the claimer sat stranded at the east exit for minutes).
  // findExitTo needs vision on some servers, so compute the exit DIRECTION from the
  // room-name coordinates (vision-independent) and drive it directly with move().
  // move(exitDir) walks toward the border one tile per tick and crosses it the moment
  // it reaches the edge — no pathing into the unseen room required.
  if (creep.room.name !== targetRoom) {
    const dir = exitDirTo(creep.room.name, targetRoom);
    if (dir > 0) {
      const r = creep.move(dir);
      if (r === OK) {
        if (!creep.memory.arrived) console.log('[claimer] entering ' + targetRoom + ' from ' + creep.room.name + ' at ' + creep.pos);
        return;
      }
      if (r === ERR_TIRED) return;
      // else fall through to moveTo (e.g. ERR_WALL at a specific border tile)
    }
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    return;
  }

  // --- Arrived in the target room. ---
  if (!creep.memory.arrived) { console.log('[claimer] ARRIVED ' + targetRoom + ' at ' + creep.pos); creep.memory.arrived = true; }
  const c = creep.room.controller;
  if (!c) return;

  if (!c.my) {
    // Neutral: claim it (a single CLAIM part is enough).
    const r = creep.claimController(c);
    if (r === ERR_NOT_IN_RANGE) {
      creep.moveTo(c, { reusePath: 5 });
    } else if (r === 0) {
      console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time + ' pos=' + creep.pos);
    } else if (r < 0) {
      console.log('[claimer] claim err ' + r + ' at ' + creep.pos);
    }
  } else {
    // Ours now: reserve to hold ownership and prevent downgrade without burning
    // upgrade energy. reserveController on our own controller is valid.
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
  }
};
