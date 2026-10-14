# Screeps Deploy Result — 2026-10-09 (repairer spawn gate)

Approved by Jerry (explicit, 2026-10-09) for BOTH the edit and the deploy in one go.
Reviewed by Hoshi. No git commit/push performed.
Branch: `default`. Tooling: `_deploy.js` (module whitelist respected).

## Bug
`config.js` gated the home-stage repairer on `hasFort` only. `hasFort` counts
ramparts (`FIND_MY_STRUCTURES` + `STRUCTURE_RAMPART`). A room with no ramparts
therefore never spawned a repairer, so its roads/containers decayed forever.
The expansion-stage gate (`hasFort ? 1 : 0`, same flaw) had the identical bug.

## Scope
Only `config.js` (repairer gate + `needsRepair` computation) and the test
tooling `_validate_recovery.js` (added the `STRUCTURE_WALL` constant the new
filter references). `role.repairer.js` and every other behavior is untouched.
The recovery-stage `targets.repairer = 0` is unchanged (deliberate).

## Exact diff hunks

### config.js

```diff
@@ _computeTargets, right after `hasFort` is computed @@
   const hasFort = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART }).length > 0;
+  // Repair demand: any owned structure below 90% of its current max hits. Roads and
+  // containers decay even in a room with NO ramparts, so the repairer spawn gate must
+  // not key off `hasFort` (ramparts only) alone. Covers the set role.repairer.js keeps
+  // topped up plus extensions/spawn/storage per the plan.
+  const REPAIR_TYPES = [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL,
+    STRUCTURE_TOWER, STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_STORAGE];
+  const needsRepair = room.find(FIND_MY_STRUCTURES, {
+    filter: s => REPAIR_TYPES.includes(s.structureType) && s.hits < s.hitsMax * 0.9,
+  }).length > 0;

   const targets = {};
```

```diff
@@ home stage (normal, steady-state) @@
-    targets.repairer = (filled > 0 && hasFort) ? 1 : 0;
+    targets.repairer = (filled > 0 && (hasFort || needsRepair)) ? 1 : 0;
```

```diff
@@ expansion stage @@
-    targets.repairer = hasFort ? 1 : 0;
+    targets.repairer = (hasFort || needsRepair) ? 1 : 0;
```

Untouched (verified, live read-back matches):
- recovery stage: `targets.repairer = 0;` (line ~346)
- outpost stage:   `targets.repairer = 0;` (line ~556)
- else/unknown:    `targets.repairer = 0;` (line ~581)

### _validate_recovery.js
Added the `STRUCTURE_WALL` constant the new `REPAIR_TYPES` array references; without it `require('./config')`'s
`_computeTargets` would `ReferenceError` on the symbol when the harness calls `getTargets`.

```diff
 const STRUCTURE_STORAGE='storage',STRUCTURE_OBSERVER='observer',STRUCTURE_LINK='link',
-  STRUCTURE_EXTRACTOR='extractor';
+  STRUCTURE_EXTRACTOR='extractor',STRUCTURE_WALL='constructedWall';
 ...
-  STRUCTURE_EXTRACTOR,FIND_SOURCES,...
+  STRUCTURE_EXTRACTOR,STRUCTURE_WALL,FIND_SOURCES,...
```

## Step 1 — `node --check` (every repo-root game module)
All files parsed OK. No syntax errors.

```
OK   build.js
OK   cache.js
OK   config.js
OK   defense.js
OK   main.js
OK   role.attacker.js
OK   role.builder.js
OK   role.claimer.js
OK   role.defender.js
OK   role.harvester.js
OK   role.hauler.js
OK   role.looter.js
OK   role.miner.js
OK   role.repairer.js
OK   role.upgrader.js
```

## Step 2 — `node _validate_recovery.js` (gate: 39 passed, 0 failed)
```
RESULT: 39 passed, 0 failed
EXIT=0
```
Gate satisfied (unchanged count; the added constant does not alter any assertion).

## Step 3 — gate-fix harness (scratch file inside the repo, deleted after)
File `_repair_gate_harness.js` (NOT whitelisted by `_deploy.js`, never deployed)
stubbed `Game`/`Memory`/`Room` with `hits`/`hitsMax` and exercised the gate:

```
(a) home + damaged road + no rampart + filled -> repairer 1
  ok   home repairer target with a damaged road  (got 1)

(b) home + no damage + no rampart + filled -> repairer 0
  ok   home repairer target with everything at full hits  (got 0)

(c) recovery + damaged road -> repairer stays 0 (deliberate)
  ok   recovery repairer target unchanged despite damage  (got 0)

(d) expansion + damaged road + no rampart -> repairer 1
  ok   expansion repairer target with a damaged road  (got 1)

(e) expansion + no damage + no rampart -> repairer 0
  ok   expansion repairer target with everything at full hits  (got 0)

RESULT: 5 passed, 0 failed
```
The harness file was deleted after running (`ls _repair_gate_harness.js` → absent).

## Step 4a — pre-deploy whitelist drop check (read-only `api.code.get('default')`)
Live modules (15): `build, cache, config, defense, main, role.attacker, role.builder,
role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner,
role.repairer, role.upgrader`.

Every live module is inside `_deploy.js`'s whitelist. Non-whitelisted live (would be
dropped): none. Whitelisted modules newly added this push: none. **No live module
would be dropped.** Safe to deploy.

## Step 4b — `node _deploy.js` (branch `default`)
```
[deploy] local game modules: build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner, role.repairer, role.upgrader
[deploy] currently deployed (kept whitelisted): build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner, role.repairer, role.upgrader
[deploy] pushing 15 modules to branch default ...
[deploy] result: {"ok":1,"timestamp":1791563788472}
[deploy] OK
EXIT=0
```
Modules uploaded (15): `build, cache, config, defense, main, role.attacker, role.builder,
role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner,
role.repairer, role.upgrader`.

## Step 5 — live read-back (`api.code.get('default')`)
Live module names (15): `build, cache, config, defense, main, role.attacker, role.builder,
role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner,
role.repairer, role.upgrader`.

Confirmations against live `config.js`:
- `needsRepair` present: **true**
- home gate (live line 542): `targets.repairer = (filled > 0 && (hasFort || needsRepair)) ? 1 : 0;` — **FOUND**
- expansion gate (live line 570): `targets.repairer = (hasFort || needsRepair) ? 1 : 0;` — **FOUND**
- `needsRepair` filter (live lines 321-325): `REPAIR_TYPES` includes `STRUCTURE_ROAD,
  STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_TOWER,
  STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_STORAGE` and tests `s.hits < s.hitsMax * 0.9;` — **FOUND**
- recovery gate (live line 346): `targets.repairer = 0;` — **FOUND (unchanged)**
- outpost gate (live line 556): `targets.repairer = 0;` — **FOUND (unchanged)**

## Warnings / notes
- None. Deploy succeeded, all gates passed, live read-back matches the intended changes.
- Hoshi: remove this file after review.
