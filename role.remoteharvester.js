// role.remoteharvester.js - harvest a source in memory.targetRoom (the north outpost)
// and drop the energy on the ground beside it. The outpost has no spawn (and no source
// container yet), so a full harvester DROPS its carry and a remote hauler carries it home.
// Dispatched from the HOME spawn only AFTER the target room is claimed + visible, so
// cross-room moveTo pathing succeeds — the blind move() border-crossing is only needed
// by the claimer entering an UNSEEN room (see role.claimer.js).
module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  if (!targetRoom) return;

  // Assigned source (set by the recruiter). Falls back to the nearest in-room source.
  let source = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;

  // Not yet in the target room — travel toward the source (or the room center).
  if (creep.pos.roomName !== targetRoom) {
    const dest = source || new RoomPosition(25, 25, targetRoom);
    const r = creep.moveTo(dest, { reusePath: 10 });
    if (Game.time % 50 === 0) console.log('[RHV] ' + creep.name + ' travel ->' + targetRoom + ' r=' + r + ' pos=' + creep.pos);
    return;
  }

  if (!source) {
    source = creep.pos.findClosestByPath(FIND_SOURCES);
    if (source) creep.memory.sourceId = source.id;
  }
  if (!source) {
    // No source resolved — if loaded, drop so the hauler can still recover it.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.drop(RESOURCE_ENERGY);
    return;
  }

  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source, { reusePath: 5 });
  } else {
    // Full — dump into the on-site container if one exists (laid by buildPlan), else
    // drop on the ground beside the source for the remote hauler to collect.
    const cont = creep.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 })[0];
    if (cont) { if (creep.transfer(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(cont, { reusePath: 3 }); }
    else creep.drop(RESOURCE_ENERGY);
  }
};
