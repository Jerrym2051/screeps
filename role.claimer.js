// role.claimer.js - travel to `memory.targetRoom`, claim its neutral controller,
// then reserve it to hold ownership at RCL1 (no upgrade energy burned). Used for
// the first eastward outpost claim.
module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;

  // Travel to the target room if we're not there yet. moveTo to a RoomPosition in
  // an unseen room still resolves a path to that room's edge.
  if (targetRoom && creep.room.name !== targetRoom) {
    const dest = new RoomPosition(25, 25, targetRoom);
    if (creep.moveTo(dest, { reusePath: 5 }) === ERR_INVALID_ARGS) {
      // room truly unreachable from here - hold and retry next tick
      if (creep.pos.getRangeTo(creep.pos.findClosestByPath(FIND_EXIT_TOP) || creep.pos) > 1) {
        // no exit in range; just sit tight
      }
    }
    return;
  }

  const c = creep.room.controller;
  if (!c) return; // no controller in this room (or still en route / edge case)

  if (!c.my) {
    // Neutral or enemy-owned: claim it (1 CLAIM part is enough).
    if (creep.claimController(c) === ERR_NOT_IN_RANGE) {
      creep.moveTo(c, { reusePath: 5 });
    }
  } else {
    // Ours now: reserve to keep it held and prevent downgrade without spending
    // upgrade energy. (reserveController on our own controller is valid and
    // refreshes ownership each tick.)
    if (creep.reserveController(c) === ERR_NOT_IN_RANGE) {
      creep.moveTo(c, { reusePath: 5 });
    }
  }
};
