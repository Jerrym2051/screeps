# FIX11 Brief: Storage-Aware Upgrader Gates

## Problem
The upgrader spawn is blocked by two bank-only gates, but the upgrader runs off storage (352k energy available), not the bank. The gates look at the wrong wallet.

**Gate 1 — Target** (config.js ~line 428):
```js
targets.upgrader = (room.energyAvailable < 600) ? 0 : ((haveContainer ? (srcContainersBuilt >= 2 ? (controller && controller.level < 3 ? 3 : 1) : 1) : 0));
```
Bank is 361–463 → target forced to 0. No upgrader spawns.

**Gate 2 — Spawn 400-reserve** (config.js ~line 1427):
```js
if ((role === 'upgrader' || role === 'defender') && room.energyAvailable - bodyCost(body) < 400) continue;
```
Even if the target were 1, this blocks the spawn when bank < 400 + bodyCost.

## Why the gates are wrong
From role.upgrader.js: upgraders pull from storage FIRST (above a 1000-energy reserve). With 352k in storage, the upgrader's ongoing operation is fully funded. The only bank hit is the one-time spawn cost, which the 50-reserve already guards. The "drain" rationale behind both gates doesn't apply.

## Changes required

### 1. Target gate (in getTargets, ~line 428)
Compute storage energy and add a storage-backed bypass:
```js
const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
const storageBackedUpgrader = storageEnergy > 50000;
targets.upgrader = (room.energyAvailable < 600 && !storageBackedUpgrader) ? 0 : ((haveContainer ? (srcContainersBuilt >= 2 ? (controller && controller.level < 3 ? 3 : 1) : 1) : 0));
```
Add a brief comment explaining: storage-backed upgraders run off storage, not the bank, so the 600 bank gate doesn't apply.

### 2. Spawn gate (in manageSpawns, ~line 1427)
Exempt storage-backed upgraders from the 400-reserve:
```js
// Storage-backed upgraders are exempt from the 400-reserve: they run off storage,
// not the bank, so they don't create the 150-400 oscillation. The 50-reserve still applies.
const storageEnergySpawn = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
if ((role === 'upgrader' || role === 'defender') && !(role === 'upgrader' && storageEnergySpawn > 50000) && room.energyAvailable - bodyCost(body) < 400) continue;
```

### 3. role.upgrader.js — container/storage ONLY (Jerry)
The upgrader must NEVER withdraw from the spawn/extensions (bank) and NEVER
direct-harvest. It may only take energy from storage (above the 1000 reserve)
or from containers. Rationale: since the spawn gates now allow upgraders on a
low bank (storage-backed), the upgrader must be physically incapable of draining
the bank, or the bypass defeats its own protection.

Current fallback chain to remove (lines ~36-44):
```js
  const r = spawn && creep.withdraw(spawn, RESOURCE_ENERGY);
  if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
  else if (r === ERR_NOT_ENOUGH_RESOURCES || !spawn) {
    const src = creep.pos.findClosestByPath(FIND_SOURCES);
    if (src && creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
  }
```
Replace with: if neither storage (above reserve) nor any container has energy,
move toward the controller and idle there (in position for when energy returns).
Do not touch the spawn, extensions, or sources. Keep the existing recycle-shelving
block at the top untouched.

## Constraints
- **Defenders stay gated.** They are combat creeps and do not run off storage. Only the upgrader gets the exemption.
- **50-reserve still applies** to upgraders (don't remove or weaken it).
- **Threshold is 50000** storage energy. If storage drops below this, the old bank gates re-engage automatically.
- The `spawn` variable in role.upgrader.js is still used by the recycle block — do not remove the variable, only the withdraw/harvest fallback chain.
- Do NOT change any other spawn gates, targets, or priorities.
- Do NOT commit or push. The repo stays dirty on branch `default`.

## Verification
1. Run the validator — must be 39/39 passed, 0 failed.
2. Do NOT deploy. Hoshi will review and deploy.

## Output
Write a result file to `SCREEPS_FIX11_RESULT.md` in the repo root with:
- What was changed (file, line numbers, before/after)
- Validator result (39/39 or failures)
- Confirmation that no other logic was touched
