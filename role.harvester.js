// role.harvester.js - parks on an assigned source, fills source container or room spawn
const defense = require('defense');

module.exports = function (creep) {
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  const c = creep.room.controller;
  // pick the nearest SAFE source with no hostile NPC keeper within 3 tiles
  const safeSources = creep.room.find(FIND_SOURCES).filter(s => !defense.isSourceDangerous(s, 3));
  const source = safeSources.length ? creep.pos.findClosestByPath(safeSources) : null;

  if (!source) {
    const c2 = creep.room.controller;
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
      if (c2 && creep.pos.getRangeTo(c2) <= 3) {
        creep.upgradeController(c2);
      } else if (spawn) {
        creep.moveTo(spawn, { reusePath: 3 });
      }
    } else if (spawn) {
      creep.moveTo(spawn, { reusePath: 3 });
    }
    return;
  }

  if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      creep.moveTo(source, { reusePath: 5 });
    }
  } else {
    let dump = spawn;
    const mem = Memory.rooms?.[creep.room.name]?.sources?.[source.id]?.containerPos;
    if (mem && mem.x != null && mem.y != null && mem.roomName) {
      const pos = new RoomPosition(mem.x, mem.y, mem.roomName);
      const site = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER);
      if (site) dump = site;
    }
    const res = creep.transfer(dump, RESOURCE_ENERGY);
    if (res === ERR_NOT_IN_RANGE) {
      creep.moveTo(dump);
    } else if (res !== OK && dump !== spawn) {
      creep.moveTo(spawn, { reusePath: 3 });
    } else if (res !== OK && dump === spawn) {
      if (c && creep.pos.getRangeTo(c) <= 3) {
        creep.upgradeController(c);
      }
    }
  }
};
