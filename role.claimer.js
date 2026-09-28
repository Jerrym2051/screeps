// role.claimer.js - claims a neutral controller
module.exports = function (creep) {
  const c = creep.room.controller;
  if (!c || c.my) return;
  if (creep.claimController(c) === ERR_NOT_IN_RANGE) {
    creep.moveTo(c);
  }
};
