# SCREEPS FIX6 RESULT — hauler throughput (bodies + recovery target)

Date: 2026-10-10. Repo: /home/jma/screeps/screeps. Branch deployed: `default`.
Per brief: NEVER git commit/push (none done). I edited only two files — config.js
(the two changes below) and _validate_recovery.js (the re-pin). main.js, role.*,
build.js, defense.js, _deploy.js were NOT edited by me; see the working-tree note
below. The one validator re-pin described by the brief was applied.

## Changes made

### Change 1 — recovery-mode hauler target (config.js:340)
In the `getEconomyMode(room) === "recovery"` branch of `getTargets` only:
- `targets.hauler = 2;` -> `targets.hauler = 4;`  (config.js:340)
The adjacent block comment (config.js:331-336) describes storage-backed haulers
refilling the bank; it does not pin the literal value 2, so no comment edit was
required. Nothing else in the recovery branch changed (harvester/builder/
upgrader/claimer/looter/miner/repairer/defender/attacker targets untouched).

### Change 2 — hauler body sizing (config.js:1345-1351)
Replaced the two low-bank hauler cap conditionals (old lines 1345-1353:
`if (role==='hauler' && energyAvailable<300 ...) buildBody('hauler',200)` /
`else if (... <500 ...) buildBody('hauler',300)`) with the single sizing rule:

```js
// Haulers: size off the CURRENT bank, capped at 6 CARRY/MOVE pairs
// (300 carry, 600 cost). The old capacity-sized body cost 1200 and almost
// never passed the bank gate, so haulers only spawned as 100-carry
// minnows via the low-bank caps and could not keep up with ~20/tick mined.
if (role === 'hauler') {
  body = buildBody('hauler', Math.min(room.energyAvailable, 650));
}
```

buildBody itself untouched; the downstream hauler bank gate
(`bodyCost > energyAvailable => continue`) left as-is. No other role's body
logic touched. Out-of-scope items (economy latch, ECO_HEALTHY_TICKS, normal-mode
hauler formula, north haulers/gate, tower refill, reservation ticksToEnd,
repairer gate, slim-down/trim) not modified.

### Validator re-pin (as the brief directed)
_validate_recovery.js:101 — `assert(t.hauler===2, ... hauler target=2 ...)`
re-pinned to `assert(t.hauler===4, ... hauler target=4 ...)` (message text
updated too). This encodes the behavior Change 1 intentionally alters. No other
assertion weakened or deleted.

## Validation (all passed before deploy)

1. `node --check config.js` -> clean.
2. `node _validate_recovery.js` -> **39 passed, 0 failed**. Recovery TEST 1 now
   asserts hauler target=4 across banks 100/400/700 (all ok); targets remain
   stable across banks; harvester=1 / builder=1 / upgrader=0 unchanged.
3. Scratch harness (created in-repo, run, then deleted) -> **11 passed, 0 failed**:
   - buildBody('hauler',130) -> 1 CARRY pair (cost 100)
   - buildBody('hauler',250) -> 2 pairs (cost 200)
   - buildBody('hauler',450) -> 4 pairs (cost 400)
   - call-site `Math.min(1300,650)` = 650 -> buildBody('hauler',650) -> 6 pairs, 600 cost
   - recovery branch (bank 100, 1 built source container, latched recovery):
     targets.hauler === 4; harvester/builder/upgrader unchanged (1/1/0)
   Harness file removed afterwards (no scratch file left in repo).

## Deploy

`node _deploy.js` (branch `default`).
- Local game modules (15): build, cache, config, defense, main, role.attacker,
  role.builder, role.claimer, role.defender, role.harvester, role.hauler,
  role.looter, role.miner, role.repairer, role.upgrader.
- Currently deployed, kept whitelisted (15): same set — **no live game module
  dropped** (local == deployed names; the deploy overlays local onto the kept
  set).
- Result: `{"ok":1,"timestamp":1791641302595}` -> `[deploy] OK`.

## Live read-back confirmation (via Screeps API)

Read the live `config` module back through the API (same fromConfig auth the
deploy script uses; credentials never inspected).
- local  config.js sha256 prefix: `260ef90c5c650db4`
- live   config module sha256 prefix: `260ef90c5c650db4`
- live === local: **true** (byte-identical)
- recovery `targets.hauler = 4;` present in live: **true**
- `Math.min(room.energyAvailable, 650)` present in live: **true**
-> Both changes confirmed live.

## Working-tree note (for Hoshi)

The repo working tree was already dirty before this run. `git status` shows
build.js, main.js, defense.js, role.*.js, _deploy.js and most of config.js
(723-line diff) as modified — those are pre-existing in-progress changes I did
NOT make and did NOT touch. `git diff config.js` confirms my only footprint is
the two intended edits: `+ targets.hauler = 4;` (recovery branch) and the
`+ ... Math.min(room.energyAvailable, 650)` sizing block. The normal-mode hauler
formula change visible in the config.js diff is pre-existing and out-of-scope
per the brief; I left it untouched.

Consequence of deploying the working tree as the brief directed (`node
_deploy.js`): the live `config` module now equals the current local file
(sha256 prefix `260ef90c5c650db4`), i.e. my two FIX6 changes PLUS the
pre-existing in-progress edits. Both FIX6 changes are individually confirmed
present in that bytes. No live game module was dropped (local 15 == deployed-kept
15, same names).

## Status

DEPLOYED — both config.js changes validated (node --check clean; _validate_
recovery.js 39/0; scratch harness 11/0), deployed to `default` without dropping
any live game module, and confirmed byte-identical on the live branch. Diff is
ready for Hoshi's review.
