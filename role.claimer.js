// role.claimer.js - travel to memory.targetRoom and claim its neutral controller.
// Cross into the unseen adjacent room. On this server move(dir)/moveByPath no-op at
// the exit (returns OK, no movement) and moveTo(unseen interior goal) returns -2, so
// the only untested cross is moveTo a goal that sits ON the border landing tile in the
// target room (the pather then needs just one cross step, no unseen interior routing).
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
      // Direct cross: move(dir) is the only reliable cross tool here (the pather
      // no-ops moveTo on unseen/interior targets). Step the border every tick
      // until the pos flips into targetRoom.
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
  if (Game.time % 10 === 0) console.log('[CLAIM_DEBUG] ' + creep.name + ' pos=' + creep.pos + ' body=' + creep.body.map(p => p.type).join(',') + ' hasCLAIM=' + creep.body.some(p => p.type === CLAIM) + ' cpos=' + c.pos + ' owner=' + (c.owner ? (c.owner.username || '?') : 'none') + ' lvl=' + (c.level || 0) + ' my=' + c.my + ' range=' + c.pos.getRangeTo(creep) + ' room=' + creep.room.name);
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
     // The pather no-ops moveTo inside the target room; step directly toward the
     // controller until in range, then let claimController/reserveController fire.
     if (creep.pos.getRangeTo(c) > 1) {
       const d = creep.pos.getDirectionTo(c);
       if (d) creep.move(d);
     }
   } else {
     const r = creep.reserveController(c);
     if (r === ERR_NOT_IN_RANGE) {
       const d = creep.pos.getDirectionTo(c);
       if (d) creep.move(d);
     }
   }
};
