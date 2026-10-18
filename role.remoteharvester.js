// role.remoteharvester.js - harvest a source in memory.targetRoom (the north outpost)
// and deposit energy: into the source container once it exists (laid by buildPlan), else
// drop on the ground beside it for the remote hauler to carry it home. While the source
// container is still under construction, a full harvester builds the container site near
// its assigned source itself (within range 3) instead of dropping energy that would decay
// on the ground — the remote builder stays on roads/general sites, the harvester finishes
// the container. Once the container exists it decays over time (no dedicated repairer is
// stationed at the remote outpost), so a full harvester also opportunistically REPAIRS its
// source's container when it is damaged (hits < 80% of hitsMax) — never interrupting
// active harvesting (only when the creep is already full). Dispatched from the HOME spawn
// only AFTER the target room is claimed + visible, so cross-room moveTo pathing succeeds —
// the blind move() border-crossing is only needed by the claimer entering an UNSEEN room
// (see role.claimer.js).
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
    // Full — HELP THE REMOTE BUILDER: build the source container site near this source
    // instead of dropping energy on the ground (which decays). Only container sites count
    // (no roads/general sites) and only within range 3 of THIS source, so the builder
    // keeps owning roads + general construction.
    const site = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
      filter: s => s.structureType === STRUCTURE_CONTAINER })[0];
    if (site) { if (creep.build(site) === ERR_NOT_IN_RANGE) creep.moveTo(site, { reusePath: 3 }); return; }

    // No site — if the source container exists but is damaged (hits < 80% of hitsMax),
    // REPAIR it instead of dropping energy on the ground. No repairer is stationed at
    // the remote outpost, so the full harvester tends to its own container here.
    // Searches within range 3 of THIS source (consistent with the build-site logic).
    const damaged = source.pos.findInRange(FIND_STRUCTURES, 3, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && s.hits < s.hitsMax * 0.8 })[0];
    if (damaged) { if (creep.repair(damaged) === ERR_NOT_IN_RANGE) creep.moveTo(damaged, { reusePath: 3 }); return; }

    // Container (or site) not ready yet — dump into the on-site container if one exists
    // with free capacity, else drop on the ground beside the source for the remote hauler.
    const cont = creep.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 })[0];
    if (cont) { if (creep.transfer(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(cont, { reusePath: 3 }); }
    else creep.drop(RESOURCE_ENERGY);
  }
};
