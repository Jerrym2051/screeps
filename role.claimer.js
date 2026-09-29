// role.claimer.js - travel to `memory.targetRoom`, claim its neutral controller,
// then reserve it to hold ownership at RCL1 (no upgrade energy burned). Used for
// the first eastward outpost claim.
module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;

  // Travel to the target room if we're not there yet. moveTo to a RoomPosition
  // in an unseen room still resolves a path to that room's edge.
  if (targetRoom && creep.room.name !== targetRoom) {
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 5 });
    return;
  }

  const c = creep.room.controller;
  if (!c) return; // no controller here (shouldn't happen once we've arrived)

  if (!c.my) {
    // Neutral: claim it (a single CLAIM part is enough).
    if (creep.claimController(c) === ERR_NOT_IN_RANGE) {
      creep.moveTo(c, { reusePath: 5 });
    }
  } else {
    // Ours now: reserve to hold ownership and prevent downgrade without burning
    // upgrade energy. reserveController on our own controller is valid.
    if (creep.reserveController(c) === ERR_NOT_IN_RANGE) {
      creep.moveTo(c, { reusePath: 5 });
    }
  }
};
