// cache.js - tick-scoped memoization for room.find calls.
// Most CPU in buildPlan/getTargets is repeated identical room.find invocations on
// the same room within a single tick (e.g. count containers, count container sites,
// list extensions, etc.). Cache each (room, type, filterKey) for the current tick so
// the second call is a table lookup instead of re-scanning the room.
let _tick = -1;
const _store = {};

function tickCheck() {
  if (_tick !== Game.time) {
    _tick = Game.time;
    for (const k in _store) delete _store[k];
  }
}

function get(room, type, key, filter) {
  tickCheck();
  const k = room.name + '|' + type + '|' + key;
  if (_store[k]) return _store[k].val;
  const val = filter ? room.find(type, { filter }) : room.find(type);
  _store[k] = { val };
  return val;
}

// Convenience: all structures of a given structureType, cached per tick.
function structures(room, type) {
  return get(room, FIND_STRUCTURES, type, s => s.structureType === type);
}
function sites(room, type) {
  return get(room, FIND_CONSTRUCTION_SITES, type, s => s.structureType === type);
}
function spawn(room) {
  return structures(room, STRUCTURE_SPAWN)[0] || null;
}

module.exports = { get, structures, sites, spawn };
