# Screeps fix-all-three brief — repairer / tower / body sizing (NO DEPLOY)

Approved by Jerry 2026-10-09. Implement exactly this scope. Do NOT run _deploy.js.
Do NOT git commit or push. When finished, write SCREEPS_FIX3_RESULT.md (diff summary +
validation output) in this repo root.

## Live diagnosis (verified 2026-10-09, W9S58 shard2, RCL4, energy capacity 1300)

Root cause A: FIND_MY_STRUCTURES never returns neutral structures (roads, containers,
constructed walls have `my === undefined`). All repair target-finding uses it, so the
repairer gate, the tower, and the repairer creep are all blind to the structures that
actually decay. Live symptoms confirming this: 75/79 roads below 90% hits (worst
100/5000), 4/5 containers below 90% (worst 115000/250000), tower sitting at 1000/1000
energy spending nothing.

## Fix 1 — structure search at all three sites

Use FIND_STRUCTURES with the type filter PLUS `s.my !== false` (allows owned (true) and
neutral (undefined), excludes hostile (false)).

- config.js `_computeTargets`: the `needsRepair` find (currently FIND_MY_STRUCTURES with
  REPAIR_TYPES) -> FIND_STRUCTURES with the same REPAIR_TYPES list and `s.my !== false`.
- role.repairer.js: the damage find (currently FIND_MY_STRUCTURES; types rampart, wall,
  tower, road, container; 90% threshold) -> FIND_STRUCTURES + `s.my !== false`. Types and
  threshold unchanged.

## Fix 2 — tower can actually repair (defense.js manageTowers)

Keep order: attack hostiles, heal hurt creeps, then repair.
- Container search -> FIND_STRUCTURES + `s.my !== false` (currently FIND_MY_STRUCTURES).
- NEW next priority after containers: damaged roads (`s.hits < s.hitsMax`, lowest hits
  first), same FIND_STRUCTURES + `s.my !== false` rule.
- Keep the existing rampart/wall branch and its `room.energyAvailable < 600` gate as-is.

## Fix 3 — repairer allowed during economy recovery (config.js)

- In the latched-recovery branch of the home stage, change `targets.repairer = 0;` to
  `targets.repairer = needsRepair ? 1 : 0;`. No other recovery targets change.

## Fix 4 — body sizing toward capacity (config.js manageSpawns)

In the candidate loop, the main body build
`let body = buildBody(role, room.energyAvailable);`
must size from capacity so a 1300-capacity room produces bodies with more WORK:
- Normally: `buildBody(role, room.energyCapacityAvailable)`.
- Emergency floor: if role === "harvester" and there is NO functional harvester alive in
  the room (no harvester whose body includes a CARRY part — same notion the recovery code
  uses), size from `room.energyAvailable` instead, so income can always reboot.
- Keep every existing gate/cap unchanged: the 50-reserve rule, the drain-role
  (upgrader/defender) 400-after-spawn rule, the hauler low-bank caps, the builder
  200-cap below bank 700, the claimer special-case, the harvester 2-WORK forcing and the
  1-WORK guard. A bigger body simply waits until the bank can pay for it.
- Bodies must stay within the 50-part game limit.

## Validation (all required before writing the result file)

1. `node --check` every repo-root game module — all must parse.
2. `node _validate_recovery.js` — must report 39 passed, 0 failed.
3. Scratch harness `_fix3_harness.js` (delete it after; never whitelisted) stubbing
   Game/Memory/Room enough to prove, via config getTargets on the home room:
   (a) recovery mode + one damaged neutral road (hits 100/5000) + no ramparts -> repairer 1;
   (b) recovery mode + nothing damaged -> repairer 0;
   (c) normal mode + damaged neutral road + a filled container -> repairer 1.
   Report the three outcomes in the result file.
4. grep-verify the three find sites (config needsRepair, defense tower containers,
   role.repairer damage) now use FIND_STRUCTURES; paste the lines into the result file.

## Scope limits

ONLY config.js, defense.js, role.repairer.js may change. No other module. No deploy.
No git commit/push. Scratch files deleted when done. If a validation step fails and the
fix is not obvious within this scope, stop and describe it in the result file instead of
improvising.
