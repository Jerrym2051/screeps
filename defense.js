// defense.js - shared combat/defense brain
const config = require('config');

function getHostiles(room) {
  const allies = (config.allies || []);
  return room.find(FIND_HOSTILE_CREEPS).filter(c => {
    const u = c.owner && c.owner.username;
    return !allies.includes(u);
  });
}

function findTarget(origin, hostiles) {
  if (!hostiles.length) return null;
  return hostiles.slice().sort((a, b) => {
    return (a.hits + origin.pos.getRangeTo(a) * 10)
         - (b.hits + origin.pos.getRangeTo(b) * 10);
  })[0];
}

function isThreatened(creep, hostiles, radius) {
  hostiles = hostiles || getHostiles(creep.room);
  radius = radius || 4;
  return hostiles.some(h => creep.pos.getRangeTo(h) <= radius);
}

function isCombat(role) {
  return role === 'defender' || role === 'claimer';
}

function flee(creep, hostiles) {
  hostiles = hostiles || getHostilesNear(creep);
  if (!hostiles.length) return;
  // the spawn is the safe zone — workers always run to it
  const spawn = Game.spawns['Spawn1'];
  if (spawn) {
    if (spawn.pos.getRangeTo(creep) <= 1) return; // already at safe zone
    creep.moveTo(spawn, { reusePath: 3 });
    return;
  }
  // fallback: run away from nearest hostile
  const nearest = creep.pos.findClosestByRange(hostiles);
  if (!nearest) return;
  const dx = creep.pos.x - nearest.pos.x;
  const dy = creep.pos.y - nearest.pos.y;
  const tx = Math.max(1, Math.min(48, creep.pos.x + Math.sign(dx) * 5));
  const ty = Math.max(1, Math.min(48, creep.pos.y + Math.sign(dy) * 5));
  creep.moveTo(new RoomPosition(tx, ty, creep.room.name), { reusePath: 3 });
}

function manageTowers(room) {
  const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
  if (!towers.length) return;
  const hostiles = getHostiles(room);
  for (const t of towers) {
    if (t.store.getUsedCapacity(RESOURCE_ENERGY) < 10) continue;
    if (hostiles.length) {
      const target = findTarget(t, hostiles);
      if (target) { t.attack(target); continue; }
    }
    const hurt = room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax });
    if (hurt.length) { t.heal(hurt[0]); continue; }
    const dmg = room.find(FIND_MY_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < s.hitsMax
    });
    if (dmg.length) { dmg.sort((a, b) => a.hits - b.hits); t.repair(dmg[0]); }
  }
}

function manageSafeMode(room) {
  const c = room.controller;
  if (!c || !c.my) return;
  if (c.safeMode !== undefined) return;
  if (!c.safeModeAvailable || c.safeModeAvailable <= 0) return;
  const hostiles = getHostiles(room);
  if (!hostiles.length) return;
  const spawn = Game.spawns['Spawn1'];
  const nearCore = hostiles.some(h => (spawn && spawn.pos.getRangeTo(h) <= 3) || c.pos.getRangeTo(h) <= 3);
  const totalAttack = hostiles.reduce((s, h) => s + h.getActiveBodyparts(ATTACK) + h.getActiveBodyparts(RANGED_ATTACK), 0);
  if (nearCore || totalAttack >= 6) c.activateSafeMode();
}

// isSourceDangerous returns true if a hostile NPC (Source Keeper) with attack parts is near the source.
function isSourceDangerous(source, radius) {
  radius = radius || 3;
  return source.pos.findInRange(FIND_HOSTILE_CREEPS, radius).some(h =>
    h.getActiveBodyparts(ATTACK) > 0 || h.getActiveBodyparts(RANGED_ATTACK) > 0);
}

// neighborRooms returns the 4 cardinal adjacent room names we can observe (Source Keepers live there).
function neighborRooms(room) {
  const m = room.name.match(/^([WE])(\d+)([NS])(\d+)$/);
  if (!m) return [];
  const [, wS, wN, nS, nN] = m;
  const w = parseInt(wN), n = parseInt(nN);
  return [
    wS + w + nS + (n + 1),  // north
    wS + w + nS + (n - 1),  // south
    wS + (w + 1) + nS + n,  // east
    wS + (w - 1) + nS + n,  // west
  ].filter(n => Game.rooms[n]);
}

// getHostilesNear scans the creep's room and adjacent rooms (Source Keepers live next door).
function getHostilesNear(creep) {
  let hostiles = getHostiles(creep.room);
  for (const name of neighborRooms(creep.room)) {
    const room = Game.rooms[name];
    if (room) hostiles = hostiles.concat(getHostiles(room));
  }
  return hostiles;
}

module.exports = { getHostiles, getHostilesNear, findTarget, isThreatened, isCombat, flee, manageTowers, manageSafeMode, isSourceDangerous };
