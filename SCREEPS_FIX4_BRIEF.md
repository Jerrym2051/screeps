# SCREEPS_FIX4_BRIEF — tower critical refill + north-expansion reservation gate

Context: the FIX3 deploy is LIVE and verified (repairer spawns, tower repairs).
Three follow-up issues were diagnosed live on shard2 (W9S58 home, W9S57 north).
Work in the working tree only. NO deploy (`_deploy.js` must NOT be run),
NO git commit/push. Touch only `config.js`, `build.js`, `role.hauler.js`.

## Fix 1 — reservation field name (config.js + build.js)

Screeps' controller reservation object is `{ username, ticksToEnd }`.
Two "is this room ours?" gates read `.ticks`, which is always undefined,
so a reserved-by-us room never counts as ours:

- `config.js`, in `northRemoteRoom` (~line 117):
  `(rsv.ticks || 0) > 0`  →  `(rsv.ticksToEnd || 0) > 0`
- `build.js`, in `placeRemoteNorthRoads` (~line 514):
  `(c.reservation.ticks || 0) > 0`  →  `(c.reservation.ticksToEnd || 0) > 0`

Change nothing else in these functions. Expected effect: with W9S57 reserved
by us and the home bank >= 800, `targets.remoteTargetRoom` turns on, so remote
harvesters, the north builder, route haulers, and the remote road leg in
W9S57 all activate.

## Fix 2 — tower critical refill (role.hauler.js)

Current deposit order: (1) bank = extensions/spawn, (2) tower only from
full-bank surplus (`cE >= 1500 && energyAvailable >= 400`), (3) storage,
(4) spill container, (5) hold near spawn. Because the bank rarely sits at
100%, the tower drained 1000 -> 0 doing repairs and is never refilled.

Change: keep the existing surplus path exactly as it is, and ADD a
critical-refill path:

- Evaluate once near the top of deposit mode (creep carrying energy > 0):
  if any tower in the room has `store` energy < 300 AND
  `creep.room.energyAvailable >= 600`, the hauler delivers to the tower
  (the one with the most free capacity, same pick as the surplus path)
  BEFORE the bank transfer.
- The `cE >= 1500` container-sum requirement does NOT apply to this
  critical path; the `energyAvailable >= 600` floor is the spawn protection.
- If the critical condition is false, behavior is byte-for-byte the old
  order: bank, surplus-tower, storage, spill, hold.

Do not change steps (1), (3), (4), (5) otherwise.

## NOT in scope

- No changes to spawn priorities, body sizing, economy/recovery logic,
  `defense.js`, `role.repairer.js`, or any other file.
- Do not touch `_deploy.js`, `main_backup.js`, `SCREEPS_*_RESULT.md` history
  files, or any junk files.

## Validation (all required)

1. `node --check` on `config.js`, `build.js`, `role.hauler.js` — clean.
2. Run `_validate_recovery.js` — expect 39 passed / 0 failed.
3. Grep the repo (excluding node_modules) for `reservation.ticks` and
   `rsv.ticks` reads that are NOT `ticksToEnd` — expect none left.
4. Preferred: a throwaway harness proving the gate logic — fake reservation
   `{ username: <me>, ticksToEnd: 100 }` qualifies the room,
   `ticksToEnd: 0` does not. Delete the harness afterward.
5. Write `SCREEPS_FIX4_RESULT.md` with the diffs summary and validation
   output, ending with the line: READY FOR REVIEW — not deployed.
