// role.remotehauler.js - collect energy in memory.targetRoom (the north outpost) —
// dropped by the remote harvester, or sitting in an on-site container — and carry it
// back to memory.homeRoom's storage/spawn. Cross-room: both rooms are visible once the
// outpost is claimed, so moveTo across the border succeeds (unlike the claimer's blind
// entry into an unseen room).
module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  const homeRoom = creep.memory.homeRoom;
  if (!targetRoom || !homeRoom) return;

  const used = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const homeRoomObj = Game.rooms[homeRoom];
  const homeDest = homeRoomObj ? (homeRoomObj.storage || homeRoomObj.find(FIND_MY_SPAWNS)[0]) : null;

  // CARRYING -> deliver to home.
  if (used > 0) {
    if (homeDest) {
      if (creep.transfer(homeDest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(homeDest, { reusePath: 10 });
    } else {
      creep.moveTo(new RoomPosition(25, 25, homeRoom), { reusePath: 10 });
    }
    return;
  }

  // EMPTY -> collect from the outpost.
  if (creep.pos.roomName !== targetRoom) {
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 10 });
    return;
  }

  // 1) nearest dropped energy (the remote harvester's output)
  const drops = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0
  });
  if (drops.length) {
    const d = creep.pos.findClosestByPath(drops);
    if (d) { if (creep.pickup(d) === ERR_NOT_IN_RANGE) creep.moveTo(d, { reusePath: 5 }); return; }
  }

  // 2) loaded container in the outpost
  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  });
  if (containers.length) {
    const c = creep.pos.findClosestByPath(containers);
    if (c) { if (creep.withdraw(c, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 }); return; }
  }

  // Nothing to take yet — hold position so we grab the next harvester drop fast.
};
