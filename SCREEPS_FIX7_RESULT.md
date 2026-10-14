# SCREEPS FIX7 RESULT — remote deposit, north repairs, hauler targeting

Date: 2026-10-10. Repo: /home/jma/screeps/screeps. Branch deployed: `default`.
Per brief: NEVER git commit/push (none done). Worked only inside the repo; the
deploy script (`node _deploy.js`) read the API credentials itself — credentials
never inspected. No tool call was permission-rejected. Out-of-scope items
(recovery latch / getEconomyMode / ECO_HEALTHY_TICKS / recovery early-return,
FIX4/5/6 gates, route-hauler count, hauler target formula, hauler body sizing,
recovery targets.hauler=4, role.repairer.js, role.claimer.js, build.js, main.js,
defense.js) were NOT modified.

I edited exactly four files: role.harvester.js, role.builder.js, config.js,
role.hauler.js. See the working-tree note at the bottom.

## Changes made

### Change 1 — remote harvesters can dump (role.harvester.js:50)
In `findDumpTarget()`, the cold-start branch guard was changed from
`if (haulers.length === 0) {` to:
```js
if (haulers.length === 0 && spawn) {
```
Spawn-less (remote) rooms now fall through to the existing container dump
steps 1-2 instead of returning `undefined` (which deadlocked a full W9S57
harvester beside empty containers). Home-room behavior with a spawn present is
unchanged. Nothing else in role.harvester.js changed.

### Change 2 — north builder repairs (role.builder.js:23-60)
In the remote-duty block, when `FIND_CONSTRUCTION_SITES` is empty, a repair
duty is now inserted BEFORE the old "clear targetRoom and head home" give-up
(role.builder.js:24-57). Behavior:
- `damaged` = structures in the room that are CONTAINER or ROAD, usable
  (`my || !owner`), with `hits < hitsMax * 0.9` (role.builder.js:28-31).
- If any: pick the lowest-hits one, tie-break closest (role.builder.js:33-35).
  - If the creep carries no energy: withdraw from the nearest container in the
    room holding energy (role.builder.js:41-45), else harvest the nearest
    source (role.builder.js:47-52); move into range as needed; return.
  - Else repair it — `creep.repair(target)`, `moveTo` with `reusePath: 5` on
    ERR_NOT_IN_RANGE (role.builder.js:55-56); return.
- Only when there are no sites AND nothing damaged does the existing
  clear-targetRoom-and-head-home run (role.builder.js:58-60). Home-room builder
  behavior outside the remote block is untouched.

### Change 3 — dispatch a north builder for repairs too (config.js:491, 494)
In the north block, added the repair-need check and widened the gate:
```js
const northNeedsRepair = northSrcCont.some(c => c.hits < 120000);          // config.js:491
...
if ((northSites.length > 0 || northNeedsRepair) && northBuildersAssigned < 1) northBuilder = 1;  // config.js:494
```
`northSrcCont` is the already-computed source-adjacent container set. The
120000 threshold is a literal with a short comment (config.js:488-490). Nothing
else in the north block or the recovery latch changed.

### Change 4 — hauler targeting: full-first, closest fallback, reservations, sticky (role.hauler.js)
Added a local helper `pickHaulTarget(candidates)` (role.hauler.js:41-62), used
by BOTH withdraw selections:
- Reservations (role.hauler.js:43-47): for candidate `c`, sum
  `store.getFreeCapacity(RESOURCE_ENERGY)` over OTHER creeps with
  `memory.role === 'hauler'` and `memory.haulSrc === c.id` (any room).
  `effective(c) = used - reserved`; candidates with `effective <= 0` are dropped
  (role.hauler.js:49-52).
- Sticky (role.hauler.js:54-55): if `creep.memory.haulSrc` names a surviving
  candidate, keep it.
- Else full-first, closest fallback (role.hauler.js:56-58): prefer FULL ones
  (`getFreeCapacity === 0`), closest by range; if none full, closest surviving.
- If no candidate survives, the helper returns null and the caller falls
  through to its existing empty-container behavior (never idles in withdraw
  mode because of reservations alone).

Wired into:
- Home "Withdraw mode" buffer pick (role.hauler.js:217-225) — sets
  `creep.memory.haulSrc = best.id`; misleading "fullest harvest buffer" comment
  updated (role.hauler.js:213-216). Falls through to the storage/drops/harvest
  ladder when nothing survives.
- Route top-up pick (carrying in route room) (role.hauler.js:82-87) — now sets
  `creep.memory.haulSrc = best.id` (role.hauler.js:84) so other haulers see the
  reservation; falls through to the existing wait/head-home when all reserved.
- Route empty pick (in route room, empty) (role.hauler.js:119-124) — sets
  `creep.memory.haulSrc = best.id` (role.hauler.js:121); falls through to the
  existing drop-route/head-home when all reserved.
- Deposit-mode clear (role.hauler.js:153): `delete creep.memory.haulSrc;` at
  the top of the `used > 0` deposit branch so loaded haulers stop reserving.
  The deposit branch never deposits into buffers, so this does not reopen the
  bounce problem; the `haulSrc` spill filter (role.hauler.js) is left as-is.
Deposit-mode logic otherwise unchanged.

## Validation (all passed before deploy)

1. `node --check` on role.harvester.js, role.builder.js, role.hauler.js,
   config.js — **clean** (re-run after the scratch harness, still clean).
2. `node _validate_recovery.js` — **39 passed, 0 failed** (baseline was also
   39/0; the config north-gate change did not break any validator expectation,
   so the validator was NOT edited).
3. Scratch harness INSIDE the repo (`_scratch_fix7.js`, run then **deleted**)
   — ran the REAL modules with stubbed globals (Screeps-style bare-`require`
   resolution hooked to the local files, validator-style stubs). **11 passed,
   0 failed**:
   - (a) hauler: far FULL buffer (2000) + near partial (500), no reservations
         -> picks the FULL buffer (cF). PASS
   - (b) hauler: no full buffers -> picks the CLOSEST partial (cP). PASS
   - (c) hauler: near partial (500) fully reserved by another hauler
         (haulSrc set, free capacity 500) -> picks the other buffer (cQ). PASS
   - (d) hauler sticky: creep with haulSrc = near partial keeps it even though a
         farther buffer is fuller (cP). PASS
   - (e) harvester dump: full store, room with NO spawn, a source and a
         container within range 3 -> transfers toward the container, no idle
         moveTo. PASS
   - (f) north gate (REAL `config.getTargets` path): normal healthy home room +
         north room with a built source container at 100,000 hits and NO
         construction sites -> did not throw; `targets.northBuilder === 1` and
         `targets.northBuilderRoom === 'W9S57'`. PASS
   - (g) builder repair: builder in its targetRoom, no sites, carrying energy,
         a damaged container -> calls `repair` on it and does NOT clear
         targetRoom (stays north). PASS
   Harness file removed afterwards; no scratch file left in the repo.

## Deploy

`node _deploy.js` (branch `default`):
- Local game modules (15): build, cache, config, defense, main, role.attacker,
  role.builder, role.claimer, role.defender, role.harvester, role.hauler,
  role.looter, role.miner, role.repairer, role.upgrader.
- Currently deployed, kept whitelisted (15): the same set — **no live game
  module dropped** (local names == deployed-kept names).
- Result: `{"ok":1,"timestamp":1791643263862}` -> `[deploy] OK`.

## Live read-back confirmation (via Screeps API)

Read the live branch back through the API (same `fromConfig` auth path the
deploy script uses; credentials never inspected). Live module count: 15.
sha256 prefixes (first 16 hex) local vs live, and marker presence in the LIVE
module:

| module           | local prefix       | live prefix        | equal | markers present in live |
|------------------|--------------------|--------------------|-------|-------------------------|
| role.harvester   | `cac691e027c54ed2` | `cac691e027c54ed2` | true  | `haulers.length === 0 && spawn` |
| role.builder     | `86ff4cc060dc239e` | `86ff4cc060dc239e` | true  | `const damaged = creep.room.find(FIND_STRUCTURES`, `creep.repair(target)` |
| role.hauler      | `8dfdd58269b2f748` | `8dfdd58269b2f748` | true  | `function pickHaulTarget`, `reservations[src]`, `delete creep.memory.haulSrc` |
| config           | `cffa14330afa91d2` | `cffa14330afa91d2` | true  | `120000`, `northNeedsRepair` |

All four live modules are byte-identical to the local files and every change
marker is confirmed present on the live branch.

## Working-tree note (for Hoshi)

The repo working tree was already dirty before this run (`git status` shows
_deploy.js, build.js, defense.js, main.js, role.claimer.js, role.repairer.js,
role.upgrader.js and a large pre-existing config.js diff). I did NOT edit those
and did NOT touch them. My footprint this run is only the four files named
above, with the changes listed in each section. Deploying the working tree (as
the brief directed) means the live versions of those four modules now equal the
current local files — my FIX7 changes PLUS any pre-existing in-progress edits in
those files. All FIX7 markers are individually confirmed present in the live
bytes. No live game module was dropped (local 15 == deployed-kept 15).

## Status

DEPLOYED — all four changes validated (node --check clean on all four;
_validate_recovery.js 39/0; scratch harness 11/0 covering tests a-g, then
deleted), deployed to `default` without dropping any live game module, and
confirmed byte-identical on the live branch with all markers present. Diff is
ready for Hoshi's review.
