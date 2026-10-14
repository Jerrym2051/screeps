# SCREEPS FIX9 RESULT -- sticky route tags + walk-home fallback + surplus shuttle

## Changes (all verified against live branch before deploy)
1. config.js: route-tag release branch now only clears routeRoom/homeRoom
   from haulers currently in the home room. North-deployed haulers keep
   tags through bank<800 flickers.
2. role.hauler.js deposit step: a carrying hauler in a spawnless room
   walks to the home room (memory.homeRoom or first spawn room) instead
   of parking forever.
3a. role.hauler.js deposit reorder: bank full -> storage, else central
   spawn-side non-buffer container, THEN tower-from-surplus. critTower
   emergency (tower<300) still fires first.
3b. role.hauler.js withdraw: storage-liquidity draw now requires
   energyAvailable < energyCapacityAvailable - 100 (was: any deficit),
   stopping storage->bank churn when the bank is all but full.

## Validation
- node --check config.js, role.hauler.js: clean.
- node _validate_recovery.js: 39 passed, 0 failed (validator untouched).
- The opencode agent completed edits + validation but stopped before
  deploy/read-back; Hoshi reviewed the live-vs-local diff, completed
  deploy + read-back directly.

## Deploy
- node _deploy.js (branch "default"): pushed 15 modules, 0 dropped.
- Deploy timestamp: 1791673562734.

## Read-back (live, via Screeps API)
- config 8dda2a472fe71840 live == local; role.hauler e81847eaca2c35dd
  live == local. All 5 sampled modules match.

## Note
- At deploy time the game loop had not executed since tick 77554243
  (about 17:03 EDT): ticks advance, creeps and Memory frozen. No code
  changed at that moment; cause is environmental (CPU bucket / runtime),
  not this or any recent fix. Behavioral verification of FIX9 will
  follow once the loop resumes.

Status: DEPLOYED.
