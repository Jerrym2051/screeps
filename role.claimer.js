// role.claimer.js - travel to `memory.targetRoom`, claim its neutral controller,
// then reserve it to hold ownership at RCL1 (no upgrade energy burned). Used for
// the first eastward outpost claim.
module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  if (!targetRoom) { if (creep.room.controller && !creep.room.controller.my) { /* nothing */ } return; }

  // --- Travel to the target room. ---
  // moveTo(RoomPosition in an unseen room) pathfinds to the border EXIT TILE and
  // then stops: the pather cannot resolve the unseen room's terrain, so it never
  // emits the cross-room step. Drive the exit DIRECTION directly instead — move()
  // in the exit direction walks to the border and crosses into the neighbor room
  // (allowed by the engine for adjacent rooms), with no path into the unseen room.
  if (creep.room.name !== targetRoom) {
    const exitDir = creep.room.findExitTo(targetRoom);
    if (exitDir && exitDir > 0) {
      const r = creep.move(exitDir);
      if (r === OK || r === ERR_TIRED) return;          // crossing / walking toward exit
      if (r === ERR_WALL) {                              // blocked by a wall segment at this tile
        // fall back to pathing to the border tile from inside
        const border = creep.pos;
        if (creep.moveTo(new RoomPosition(targetRoom === 'E47S42' ? 1 : 25, 25, targetRoom), { reusePath: 0 }) === ERR_NO_PATH) return;
      }
      return;
    }
    // No coordinate exit found (e.g. room not adjacent yet): path to the center
    // and keep retrying each tick.
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    return;
  }

  // --- We reached the target room. ---
  const c = creep.room.controller;
  if (!c) return;

  if (!c.my) {
    // Neutral: claim it (a single CLAIM part is enough).
    const r = creep.claimController(c);
    if (r === ERR_NOT_IN_RANGE) {
      creep.moveTo(c, { reusePath: 5 });
    } else if (r === 0) {
      console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time);
    }
  } else {
    // Ours now: reserve to hold ownership and prevent downgrade without burning
    // upgrade energy. reserveController on our own controller is valid.
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
    else if (r === 0) {
      // keep targetRoom set so reserve keeps running; the room is now ours.
    }
  }
};
