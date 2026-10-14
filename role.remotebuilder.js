// role.remotebuilder.js - build construction sites in memory.targetRoom (the north
// outpost: roads + a source container placed by buildPlan). It carries its own energy
// and refills from the HOME room's storage (or spawn) when empty, then returns — the
// outpost has no energy bank of its own yet. Deliberately does NOT grab the outpost's
// dropped energy (that is the remote hauler's cargo to carry home). With nothing to
// build it upgrades the outpost controller, which is always productive.
module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  const homeRoom = creep.memory.homeRoom;
  if (!targetRoom || !homeRoom) return;

  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);

  // EMPTY -> refill from home storage/spawn.
  if (used === 0) {
    if (creep.pos.roomName !== homeRoom) {
      creep.moveTo(new RoomPosition(25, 25, homeRoom), { reusePath: 10 });
      return;
    }
    const homeRoomObj = Game.rooms[homeRoom];
    const src = homeRoomObj && (homeRoomObj.storage || homeRoomObj.find(FIND_MY_SPAWNS)[0]);
    if (src && src.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(src, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(src, { reusePath: 5 });
      return;
    }
    // Home bank dry — wait near it.
    creep.moveTo(new RoomPosition(25, 25, homeRoom), { reusePath: 5 });
    return;
  }

  // HAS ENERGY -> work in the outpost.
  if (creep.pos.roomName !== targetRoom) {
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 10 });
    return;
  }

  const site = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  if (site) {
    if (creep.build(site) !== ERR_NOT_IN_RANGE) return;
    creep.moveTo(site, { reusePath: 5 });
    return;
  }

  // Nothing to build — dump spare energy into the outpost controller.
  const nc = creep.room.controller;
  if (nc) {
    if (creep.upgradeController(nc) !== ERR_NOT_IN_RANGE) return;
    creep.moveTo(nc, { reusePath: 5 });
  }
};
