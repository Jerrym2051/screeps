# SCREEPS FIX7.1 BRIEF — exclude self from hauler reservations

Approved by Jerry 2026-10-10 ("Ship the one-line self-exclusion fix").
Repo: /home/jma/screeps/screeps. NEVER git commit or push. Work ONLY inside
the repo; never read/list/stat paths outside it (node _deploy.js reads the
API credentials itself). If a tool call is permission-rejected, skip it and
CONTINUE. Write SCREEPS_FIX71_RESULT.md in the repo root even on failure.

## The one change (role.hauler.js, inside pickHaulTarget)

Found in Hoshi review of FIX7: the reservation sum counts the choosing
creep ITSELF (the brief said OTHER creeps). Line today is approximately:

  const others = Object.values(Game.creeps).filter(c => c && c.memory && c.memory.role === "hauler");

Change the filter to also exclude the choosing creep:

  const others = Object.values(Game.creeps).filter(c => c && c.name !== creep.name && c.memory && c.memory.role === "hauler");

That is the ONLY code change. Nothing else in role.hauler.js, and no other
module, changes. In particular do not touch the candidate sets, sticky rule,
full-first rule, deposit-mode haulSrc clear, or any FIX4/5/6/7 behavior.

## Validation

1. node --check role.hauler.js — clean.
2. node _validate_recovery.js => 39 passed / 0 failed (validator not edited).
3. Small scratch harness INSIDE the repo (deleted afterwards) running the
   REAL role.hauler.js with stubbed globals, asserting the regression case:
   a lone empty hauler (free capacity 300) and ONE buffer holding 250 energy,
   no other haulers -> the hauler now targets that buffer (withdraws or
   moveTo toward it) instead of skipping it; plus one control case: another
   hauler with haulSrc on that buffer and free capacity 300 still nets it
   out (effective 250-300 <= 0) so the chooser does not target it.

## Deploy + verify

4. node _deploy.js (branch "default"). STOP and report if any live game
   module would be dropped.
5. Read live role.hauler back via the Screeps API; confirm it contains
   "c.name !== creep.name"; report sha256 prefix local vs live.
6. Write SCREEPS_FIX71_RESULT.md (change, validation, deploy, read-back),
   ending DEPLOYED or the exact failure. Keep this brief.
