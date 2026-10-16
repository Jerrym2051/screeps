// role.claimer.js - travel to memory.targetRoom and claim/reserve its controller.
// On this server: moveTo(unseen target) returns -2 (no path), so crossing is
// done with move(dir) at the EXIT. Inside the target room, the cross-room
// pather is intermittent, so interior approach uses getDirectionTo(c)+move
// (deterministic, always stays in-room). The memory.arrived flag prevents
// re-entering the travel section after crossing.
function exitDirTo(fromName, toName) {
  const p = n => { const m = n.match(/^([WE])(\d+)([NS])(\d+)$/); return m ? { ew: m[1], ex: +m[2], ns: m[3], ny: +m[4] } : null; };
  const a = p(fromName), b = p(toName);
  if (!a || !b) return -1;
  // W-axis: higher number = more west; E-axis: higher number = more east.
  if (a.ew === 'W' && b.ew === 'W') {
    if (a.ex > b.ex) return RIGHT;  // W10->W9 = east
    if (a.ex < b.ex) return LEFT;   // W9->W10 = west
  } else if (a.ew === 'E' && b.ew === 'E') {
    if (a.ex < b.ex) return RIGHT;  // E9->E10 = east
    if (a.ex > b.ex) return LEFT;   // E10->E9 = west
  } else if (a.ew === 'W' && b.ew === 'E') return RIGHT;
  else if (a.ew === 'E' && b.ew === 'W') return LEFT;
  // S-axis: higher number = more south; N-axis: higher number = more north.
  if (a.ns === 'S' && b.ns === 'S') {
    if (a.ny > b.ny) return TOP;     // S57->S56 = north
    if (a.ny < b.ny) return BOTTOM;  // S56->S57 = south
  } else if (a.ns === 'N' && b.ns === 'N') {
    if (a.ny < b.ny) return TOP;     // N5->N6 = north
    if (a.ny > b.ny) return BOTTOM;  // N6->N5 = south
  } else if (a.ns === 'S' && b.ns === 'N') return TOP;
  else if (a.ns === 'N' && b.ns === 'S') return BOTTOM;
  return -1;
}

module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  if (!targetRoom) return;

  // Once arrived, NEVER re-enter the travel section. If the claimer is pushed
  // back across the border by pathing/terrain, just hold position — do NOT try
  // to re-cross (that's what causes the bouncing loop).
  if (creep.memory.arrived) {
    if (creep.pos.roomName !== targetRoom) {
      // Somehow bounced back — walk to the border again WITHOUT moveTo cross-room
      const dir = exitDirTo(creep.pos.roomName, targetRoom);
      const atBorder = (dir === RIGHT && creep.pos.x === 49) ||
                       (dir === LEFT && creep.pos.x === 0) ||
                       (dir === TOP && creep.pos.y === 0) ||
                       (dir === BOTTOM && creep.pos.y === 49);
      if (atBorder && dir > 0) {
        creep.move(dir);
      } else {
        // moveTo is safe: target is in the current visible room (only cross-room moveTo is broken on this server).
        const tx = dir === LEFT ? 0 : dir === RIGHT ? 49 : creep.pos.x;
        const ty = dir === TOP ? 0 : dir === BOTTOM ? 49 : creep.pos.y;
        creep.moveTo(new RoomPosition(tx, ty, creep.pos.roomName));
      }
      return;
    }
    // In target room — fall through to claim logic below
  } else {
    // Not yet arrived: travel to the border and cross
    if (creep.pos.roomName !== targetRoom) {
      const dir = exitDirTo(creep.pos.roomName, targetRoom);
      const atBorder = (dir === RIGHT && creep.pos.x === 49) ||
                       (dir === LEFT && creep.pos.x === 0) ||
                       (dir === TOP && creep.pos.y === 0) ||
                       (dir === BOTTOM && creep.pos.y === 49);

      if (atBorder && dir > 0) {
        // One move intent per tick at the border: move(dir) is the only reliable
        // cross tool here (the pather no-ops moveTo on the unseen landing).
        const r = creep.move(dir);
        if (creep.pos.roomName === targetRoom) {
          console.log('[claimer] CROSSED ' + targetRoom + ' via move(' + dir + ') at ' + creep.pos);
          creep.memory.arrived = true;
          return;
        }
        if (Game.time % 4 === 0) console.log('[CLM2] border ' + creep.pos + ' move(' + dir + ')=' + r + ' ->' + creep.pos.roomName);
        return;
      }

      // moveTo is safe: target is in the current visible room (only cross-room moveTo is broken on this server).
      const tx = dir === LEFT ? 0 : dir === RIGHT ? 49 : creep.pos.x;
      const ty = dir === TOP ? 0 : dir === BOTTOM ? 49 : creep.pos.y;
      creep.moveTo(new RoomPosition(tx, ty, creep.pos.roomName));
      if (Game.time % 25 === 0) console.log('[CLM2] travel ' + creep.pos + ' dir=' + dir + ' ttl=' + creep.ticksToLive);
      return;
    }
    // First tick in target room
    console.log('[claimer] ARRIVED ' + targetRoom + ' at ' + creep.pos);
    creep.memory.arrived = true;
  }

  // --- In-room logic: claim or reserve the controller ---
  const c = creep.room.controller;
  if (!c) return;
  if (Game.time % 10 === 0) console.log('[CLAIM_DEBUG] ' + creep.name + ' pos=' + creep.pos + ' hasCLAIM=' + creep.body.some(p => p.type === CLAIM) + ' cpos=' + c.pos + ' owner=' + (c.owner ? (c.owner.username || '?') : 'none') + ' lvl=' + (c.level || 0) + ' my=' + c.my + ' range=' + c.pos.getRangeTo(creep));
  if (!c.my) {
    const hasC = creep.body.some(p => p.type === CLAIM);
    const rsv = c.reservation;
    if (creep.memory.claimPhase === 'reserve') {
      const rv = creep.reserveController(c);
      if (rv === 0) console.log('[claimer] RESERVED ' + targetRoom + ' at ' + creep.pos);
      console.log('[CLAIM3] reserve=' + rv + ' range=' + c.pos.getRangeTo(creep) + ' hasC=' + hasC + ' rsv=' + JSON.stringify(rsv));
      creep.memory.claimPhase = 'claim';
    } else {
      const r = creep.claimController(c);
      if (r === 0) console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time + ' pos=' + creep.pos);
      console.log('[CLAIM3] claim=' + r + ' range=' + c.pos.getRangeTo(creep) + ' hasC=' + hasC + ' rsv=' + JSON.stringify(rsv) + ' pos=' + creep.pos);
      creep.memory.claimPhase = 'reserve';
    }
    // Interior approach: walk directly toward the controller using move() — the
    // cross-room pather is broken on this server, so moveTo(c) can return a path
    // that bounces the claimer back across the border. getDirectionTo + move is
    // deterministic and always stays in-room once we've arrived.
    if (creep.pos.getRangeTo(c) > 1) {
      const d = creep.pos.getDirectionTo(c);
      const r = creep.move(d);
      if (Game.time % 25 === 0) console.log('[CLAIM3] interior move d=' + d + ' r=' + r + ' pos=' + creep.pos);
    }
  } else {
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) {
      const d = creep.pos.getDirectionTo(c);
      creep.move(d);
    }
  }
};
