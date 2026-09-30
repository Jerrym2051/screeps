// role.claimer.js - travel to memory.targetRoom and claim/reserve its controller.
// Cross into the unseen adjacent room. On this server moveTo(unseen target) returns
// -2 (no path) and move(dir) at the EXIT is the only thing that crosses, so the
// border is stepped with move(dir). The interior approach uses moveTo(c); the
// pather is intermittent there (not always-broken like the exit), per the one
// claimer that reached the controller previously.
function exitDirTo(fromName, toName) {
  const p = n => { const m = n.match(/^([WE])(\d+)([NS])(\d+)$/); return m ? { ew: m[1], ex: +m[2], ns: m[3], ny: +m[4] } : null; };
  const a = p(fromName), b = p(toName);
  if (!a || !b) return -1;
  if (a.ex < b.ex) return RIGHT;
  if (a.ex > b.ex) return LEFT;
  if (a.ny < b.ny) return BOTTOM;
  if (a.ny > b.ny) return TOP;
  return -1;
}
function landing(dir, y, toRoom) {
  if (dir === RIGHT) return new RoomPosition(0, y, toRoom);
  if (dir === LEFT) return new RoomPosition(49, y, toRoom);
  if (dir === TOP) return new RoomPosition(y, 0, toRoom);
  if (dir === BOTTOM) return new RoomPosition(y, 49, toRoom);
  return null;
}

module.exports = function (creep) {
  const targetRoom = creep.memory.targetRoom;
  if (!targetRoom) return;

  if (creep.room.name !== targetRoom) {
    const dir = exitDirTo(creep.room.name, targetRoom);
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
        delete creep.memory.cx;
        return;
      }
      if (Game.time % 4 === 0) console.log('[CLM2] border ' + creep.pos + ' move(' + dir + ')=' + r + ' ->' + creep.pos.roomName);
      return;
    }

    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    if (Game.time % 25 === 0) console.log('[CLM2] travel ' + creep.pos + ' ttl=' + creep.ticksToLive);
    return;
  }

  if (!creep.memory.arrived) { console.log('[claimer] ARRIVED ' + targetRoom + ' at ' + creep.pos); creep.memory.arrived = true; }
  const c = creep.room.controller;
  if (!c) return;
  if (Game.time % 10 === 0) console.log('[CLAIM_DEBUG] ' + creep.name + ' pos=' + creep.pos + ' hasCLAIM=' + creep.body.some(p => p.type === CLAIM) + ' cpos=' + c.pos + ' owner=' + (c.owner ? (c.owner.username || '?') : 'none') + ' lvl=' + (c.level || 0) + ' my=' + c.my + ' range=' + c.pos.getRangeTo(creep));
  if (!c.my) {
    const hasC = creep.body.some(p => p.type === CLAIM);
    const rsv = c.reservation;
    if (creep.memory.claimPhase === 'reserve') {
      const rv = creep.reserveController(c);
      if (rv === 0) console.log('[claimer] RESERVED ' + targetRoom + ' at ' + creep.pos);
      console.log('[CLAIM3] reserve='+rv+' range='+c.pos.getRangeTo(creep)+' hasC='+hasC+' rsv='+JSON.stringify(rsv));
      creep.memory.claimPhase = 'claim';
    } else {
      const r = creep.claimController(c);
      if (r === 0) console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time + ' pos=' + creep.pos);
      console.log('[CLAIM3] claim='+r+' range='+c.pos.getRangeTo(creep)+' hasC='+hasC+' rsv='+JSON.stringify(rsv)+' pos='+creep.pos);
      creep.memory.claimPhase = 'reserve';
    }
    // Interior approach: the pather hard-no-ops move(dir) from the (0,23) landing
    // pocket, so retry moveTo(c) each tick (intermittent but was the one that worked).
    if (creep.pos.getRangeTo(c) > 1) {
      creep.moveTo(c, { reusePath: 0 });
    }
  } else {
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
  }
};
