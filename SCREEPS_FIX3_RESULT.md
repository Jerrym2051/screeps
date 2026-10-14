# SCREEPS_FIX3 result

Approved brief: `SCREEPS_FIX3_BRIEF.md`. Scope: only `config.js`, `defense.js`,
`role.repairer.js` may change. No deploy (`_deploy.js` not run). No git commit/push.
Scratch harness deleted after validation.

## Root cause
`FIND_MY_STRUCTURES` never returns neutral structures (roads/containers/constructed
walls have `my === undefined`), so every repair target-finder was blind to the
structures that actually decay (W9S58: 75/79 roads <90%, 4/5 containers <90%,
tower at 1000/1000 idle). Fix: `FIND_STRUCTURES` + `s.my !== false` (keeps owned
`my:true`, admits neutral `undefined`, excludes hostile `false`).

## Implementation — exact changes (only 3 files)

### Fix 1a — structure search (config.js `_computeTargets` needsRepair)
```
const needsRepair = room.find(FIND_STRUCTURES, {
  filter: s => REPAIR_TYPES.includes(s.structureType) && s.my !== false && s.hits < s.hitsMax * 0.9,
}).length > 0;
```
(`FIND_MY_STRUCTURES` → `FIND_STRUCTURES`, added `s.my !== false`.)

### Fix 1b — damage find (role.repairer.js)
```
const dmg = creep.room.find(FIND_STRUCTURES, {
  filter: s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL ||
                s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_ROAD ||
                s.structureType === STRUCTURE_CONTAINER) && s.my !== false && s.hits < s.hitsMax * 0.9
});
```
(Types + 90% threshold unchanged; `FIND_MY_STRUCTURES` → `FIND_STRUCTURES`, `s.my !== false`.)

### Fix 2 — tower repairs (defense.js `manageTowers`)
Order preserved: attack hostiles → heal hurt → repair.
- Container search → `FIND_STRUCTURES` + `s.my !== false`.
- NEW branch immediately after containers: damaged roads (`s.hits < s.hitsMax`,
  lowest hits first), same `FIND_STRUCTURES` + `s.my !== false` rule.
- Existing rampart/wall branch and its `room.energyAvailable < 600` gate left as-is.
```
const cont = room.find(FIND_STRUCTURES, {
  filter: s => s.structureType === STRUCTURE_CONTAINER && s.my !== false && s.hits < s.hitsMax
});
if (cont.length) { cont.sort((a, b) => a.hits - b.hits); t.repair(cont[0]); continue; }
const roads = room.find(FIND_STRUCTURES, {
  filter: s => s.structureType === STRUCTURE_ROAD && s.my !== false && s.hits < s.hitsMax
});
if (roads.length) { roads.sort((a, b) => a.hits - b.hits); t.repair(roads[0]); continue; }
if (room.energyAvailable < 600) continue; // skip rampart/wall repair during recovery
const dmg = room.find(FIND_MY_STRUCTURES, {
  filter: s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < s.hitsMax
});
```

### Fix 3 — repairer allowed during economy recovery (config.js)
In the latched-recovery branch, changed `targets.repairer = 0;` to:
```
targets.repairer = needsRepair ? 1 : 0;
```
No other recovery targets changed.

### Fix 4 — body sizing toward capacity (config.js `manageSpawns`)
In the candidate spawn loop, the body is now sized from capacity with an
emergency floor for income recovery:
```
let bodyBudget = room.energyCapacityAvailable;
if (role === 'harvester' && functionalHarvesterCount === 0) bodyBudget = room.energyAvailable;
let body = buildBody(role, bodyBudget);
if (body.length > 50) body = body.slice(0, 50);
```
- `functionalHarvesterCount` reuses the existing `hasCarry`-based notion already
  used by the recovery code (`c.body.some(p => p.type === CARRY)`).
- A 1300-capacity room now sizes harvesters up to 8 WORK (cost 1250) instead of
  being hard-capped by the current `energyAvailable` pool; the existing
  affordability gates (50-reserve, 400-after-spawn drain-role rule, hauler
  low-bank caps, builder 200-cap below 700, 2-WORK forcing, 1-WORK guard) are
  all unchanged, so a bigger body simply waits until the bank can pay for it.
- The 50-part game limit is enforced with `body.slice(0, 50)`. For the live
  W9S58 (RCL4, cap 1300) every role stays well under 50 parts (max observed:
  hauler/defender 24, harvester/upgrader/builder/repairer 16-20).

## Diff summary (vs the on-disk working tree prior to this task)
Only the three permitted files were written:
- `config.js`     — Fix 1a (needsRepair find), Fix 3 (recovery repairer), Fix 4 (body budget).
- `defense.js`    — Fix 2 (tower container find + new roads branch).
- `role.repairer.js` — Fix 1b (damage find).

No other module was modified by this task.

Note on repo state: the working tree already contained a large set of uncommitted
edits (`_deploy.js`, `build.js`, `main.js`, several `role.*.js`) that pre-date
this task; those were left untouched and were not produced or reverted here.
Nothing was deployed and nothing was committed/pushed.

## Validation

### Step 1 — `node --check` every repo-root game module
```
ok  build.js
ok  cache.js
ok  config.js
ok  defense.js
ok  _deploy.js
ok  main.js
ok  logstream.js
ok  main_backup.js
ok  monitor.js
ok  role.attacker.js
ok  role.builder.js
ok  role.claimer.js
ok  role.defender.js
ok  role.harvester.js
ok  role.hauler.js
ok  role.looter.js
ok  role.miner.js
ok  role.upgrader.js
ok  role.repairer.js
ok  _validate_recovery.js
```
All repo-root modules parse.

### Step 2 — `node _validate_recovery.js`
```
RESULT: 39 passed, 0 failed
```
(exit code 0)

### Step 3 — scratch harness `_fix3_harness.js` (stubbed Game/Memory/Room,
config.getTargets on home room)
Outcomes via `config.getTargets(room)`:
```
FIX3 harness: repairer target via config.getTargets
(a) recovery + damaged neutral road (100/5000) + no ramparts -> repairer 1
  ok    (a) economy mode recovery (got recovery)
  ok  repairer target=1 (got 1)
(b) recovery + nothing damaged -> repairer 0
  ok    (b) economy mode recovery (got recovery)
  ok  repairer target=0 (got 0)
(c) normal mode + damaged neutral road + filled container -> repairer 1
  ok    (c) economy mode normal (got normal)
  ok  repairer target=1 (got 1)

HARNESS RESULT: 6 passed, 0 failed
```
The harness file was deleted after this run; `_validate_recovery.js` (pre-existing,
whitelist-excluded) is retained as-is.

### Step 4 — grep verification of the three find sites
```
config.js needsRepair:323:  const needsRepair = room.find(FIND_STRUCTURES, {
defense.js tower container:80:      filter: s => s.structureType === STRUCTURE_CONTAINER && s.my !== false && s.hits < s.hitsMax
defense.js tower roads:85:    const roads = room.find(FIND_STRUCTURES, {
role.repairer.js damage:31:    const dmg = creep.room.find(FIND_STRUCTURES, {
```
All three repair target sites now use `FIND_STRUCTURES` + `s.my !== false`
(defense keep the rampart/wall `FIND_MY_STRUCTURES` branch as-is, per the brief).

## Result
All four fixes implemented exactly within scope. All validation steps pass:
Step 1 parse OK, Step 2 39/0, Step 3 6/6 (three outcomes confirmed), Step 4
grep-verified. No deploy, no commit/push. Scratch harness deleted.
