# Screeps Deploy Result — 2026-10-08

Approved by Jerry (explicit, 2026-10-08). Reviewed by Hoshi. No git commit/push performed.
Branch: `default`. Tooling: `_deploy.js` (module whitelist respected).

## Scope deployed
- hauler cap in `config.js`
- north expansion (W9S58 → W9S57) across `config.js`, `role.claimer.js`, `role.harvester.js`, `role.hauler.js`, `role.builder.js`, `build.js`

## Step 1 — `node --check` (every repo-root game module; main_backup.js + *_harness excluded)
All files parsed OK. No syntax errors.

```
OK   build.js
OK   cache.js
OK   config.js
OK   defense.js
OK   _deploy.js
OK   logstream.js
SKIP main_backup.js
OK   main.js
OK   monitor.js
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
OK   _validate_recovery.js
```
No `*_harness` files exist in the repo root.

## Step 2 — `node _validate_recovery.js` (gate: 39 passed, 0 failed)
```
RESULT: 39 passed, 0 failed
EXIT=0
```
Gate satisfied. Proceeded to deploy.

## Step 3a — pre-deploy whitelist drop check (read-only `api.code.get('default')`)
Live modules before deploy (15): `build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner, role.repairer, role.upgrader`.

Every live module is inside `_deploy.js`'s whitelist. **No live module would be dropped** (main_backup is not live). Safe to deploy.

## Step 3b — `node _deploy.js`
```
[deploy] local game modules: build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.looter, role.miner, role.repairer, role.upgrader
[deploy] currently deployed (kept whitelisted): build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner, role.repairer, role.upgrader
[deploy] pushing 15 modules to branch default ...
[deploy] result: {"ok":1,"timestamp":1791469819614}
[deploy] OK
EXIT=0
```
Modules uploaded (15): build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner, role.repairer, role.upgrader.

## Step 4 — live read-back (`api.code.get('default')`)
Live module names (15): `build, cache, config, defense, main, role.attacker, role.builder, role.claimer, role.defender, role.harvester, role.hauler, role.looter, role.miner, role.repairer, role.upgrader`.

Confirmations:
- `config.js` contains `"northNeighbor"`: **FOUND**
- `config.js` contains the capped hauler line: **FOUND**
  ```
  targets.hauler = (srcContainersBuilt > 0 ? Math.min(Math.max(2, harvesterCount * 2 + 1), Math.max(3, srcContainersBuilt * 2)) : 0) + routeHaulers;
  ```
- `role.claimer.js` contains `"canClaimController"`: **FOUND**

## Warnings / notes
- None. Deploy succeeded, all gates passed, live read-back matches intended changes.
- Hoshi: remove this file after review.
