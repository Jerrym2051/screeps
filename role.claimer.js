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
      // One move intent per tick: alternate moveTo(landing) and move(dir) and log each.
      if (!creep.memory.cx) creep.memory.cx = 0;
      const phase = creep.memory.cx % 2;
      if (phase === 0) {
        const lg = landing(dir, creep.pos.y, targetRoom);      // border landing tile IN target room
        const mr = creep.moveTo(lg, { reusePath: 0 });
        if (creep.pos.roomName === targetRoom) { console.log('[claimer] CROSSED ' + targetRoom + ' via moveTo(landing) at ' + creep.pos); return; }
        if (Game.time % 3 === 0) console.log('[CLM2] L ' + creep.pos + ' moveTo(' + lg.x + ',' + lg.y + ',' + lg.roomName + ')=' + mr + ' ->' + creep.pos.roomName);
      } else {
        const r = creep.move(dir);
        if (creep.pos.roomName === targetRoom) { console.log('[claimer] CROSSED ' + targetRoom + ' via move(' + dir + ') at ' + creep.pos); return; }
        if (Game.time % 6 === 0) console.log('[CLM2] F ' + creep.pos + ' move(' + dir + ')=' + r + ' ->' + creep.pos.roomName + ' b=' + creep.body.map(p => p.type).join(''));
      }
      creep.memory.cx++;
      return;
    }

    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 0 });
    if (Game.time % 25 === 0) console.log('[CLM2] travel ' + creep.pos + ' ttl=' + creep.ticksToLive);
    return;
  }

  if (!creep.memory.arrived) { console.log('[claimer] ARRIVED ' + targetRoom + ' at ' + creep.pos); creep.memory.arrived = true; }
  const c = creep.room.controller;
  if (!c) return;
  if (Game.time % 10 === 0) console.log('[CLAIM_DEBUG] ' + creep.name + ' pos=' + creep.pos + ' owner=' + (c.owner ? (c.owner.username || '?') : 'none') + ' lvl=' + (c.level || 0) + ' my=' + c.my + ' range=' + c.pos.getRangeTo(creep) + ' room=' + creep.room.name);
  if (!c.my) {
    const r = creep.claimController(c);
    if (r === 0) console.log('[claimer] claimed ' + targetRoom + ' at ' + Game.time + ' pos=' + creep.pos);
    else { if (Game.time % 5 === 0) console.log('[claimer] claimController=' + r + ' at ' + creep.pos + ' (approaching) room=' + creep.room.name); creep.moveTo(c, { reusePath: 5 }); }
  } else {
    const r = creep.reserveController(c);
    if (r === ERR_NOT_IN_RANGE) creep.moveTo(c, { reusePath: 5 });
  }
};
