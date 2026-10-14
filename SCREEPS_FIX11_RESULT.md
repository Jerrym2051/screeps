# FIX11 Result: Storage-Aware Upgrader Gates

## Summary
Both bank-only upgrader gates now recognize that the upgrader runs off **storage**, not
the bank, and bypass when storage is deep (> 50k). The upgrader role itself is now
physically incapable of draining the bank: it takes energy only from storage (above a
1000 reserve) or source containers, and otherwise idles near the controller.

---

## Changes

### 1. Target gate — `config.js` (`_computeTargets`)

**Before** (was line 428):
```js
targets.upgrader = (room.energyAvailable < 600) ? 0 : ((haveContainer ? (srcContainersBuilt >= 2 ? (controller && controller.level < 3 ? 3 : 1) : 1) : 0));
```

**After** (now lines 428–433, incl. explanatory comment):
```js
// Storage-backed bypass: upgraders run off storage (above a 1000 reserve), not the
// bank, so the 600 bank gate does not apply when storage is deep. Below 50k storage
// the old bank gates re-engage automatically.
const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
const storageBackedUpgrader = storageEnergy > 50000;
targets.upgrader = (room.energyAvailable < 600 && !storageBackedUpgrader) ? 0 : ((haveContainer ? (srcContainersBuilt >= 2 ? (controller && controller.level < 3 ? 3 : 1) : 1) : 0));
```
The `&& !storageBackedUpgrader` clause only suppresses the `0` when storage > 50k; the
`else` branch (real target) is unchanged.

### 2. Spawn 400-reserve gate — `config.js` (`manageSpawns`)

**Before** (was line 1428):
```js
if ((role === 'upgrader' || role === 'defender') && room.energyAvailable - bodyCost(body) < 400) continue;
```

**After** (now lines 1433–1437, incl. explanatory comment; confirmed present at lines
1433–1437 in the final file):
```js
// Storage-backed upgraders are exempt from the 400-reserve: they run off storage,
// not the bank, so they don't create the 150-400 oscillation. The 50-reserve still
// applies. Defenders stay gated (they are combat creeps and don't run off storage).
const storageEnergySpawn = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
if ((role === 'upgrader' || role === 'defender') && !(role === 'upgrader' && storageEnergySpawn > 50000) && room.energyAvailable - bodyCost(body) < 400) continue;
```
The middle `!(role === 'upgrader' && storageEnergySpawn > 50000)` clause exempts only a
storage-backed upgrader. Defenders (and low-storage upgraders) still hit the 400 floor.
The 50-reserve guard (line 1426) is untouched and still applies to everyone.

### 3. Upgrader role — `role.upgrader.js`

**Before** (was lines 39–44, the bank/harvest fallback chain):
```js
const r = spawn && creep.withdraw(spawn, RESOURCE_ENERGY);
if (r === ERR_NOT_IN_RANGE) creep.moveTo(spawn);
else if (r === ERR_NOT_ENOUGH_RESOURCES || !spawn) {
  const src = creep.pos.findClosestByPath(FIND_SOURCES);
  if (src && creep.harvest(src) === ERR_NOT_IN_RANGE) creep.moveTo(src);
}
```

**After** (now lines 39–44) — idle near controller, never touch bank/sources:
```js
// No energy available anywhere. Idle near the controller (in position for when energy
// returns) — do NOT touch the spawn/extensions or sources. Storage-backed upgraders
// must be physically incapable of draining the bank, so the spawn gate bypass stays safe.
if (c) {
  if (creep.pos.getRangeTo(c) > 1) creep.moveTo(c);
}
```
- The `spawn` variable (line 9) is kept — still used by the recycle-shelving block
  (lines 15–19), which is untouched.
- The header comment (lines 1–5) was updated to describe the new storage/container-only
  behavior (comment-only; the old text claimed spawn/direct-harvest fallbacks that no
  longer exist).

---

## Constraints honored
- **Defenders stay gated** — exemption is `role === 'upgrader'` only.
- **50-reserve still applies** — line 1426 unchanged.
- **Threshold is 50000** storage energy in both gates — below it the old bank gates
  re-engage automatically.
- **`spawn` variable retained** in `role.upgrader.js` (used by the recycle block).
- **No other spawn gates, targets, or priorities changed.**
- **Not committed or pushed.** Repo stays dirty on branch `default`.

## Verification
Validator: `node _validate_recovery.js`
```
RESULT: 39 passed, 0 failed
```
Baseline before edits was also 39/39; behavior is preserved (stub storage is 25,450 <
50,000, so the bypass does not fire in the tests and upgrader target stays 0 as asserted).
`node --check` passes on both `config.js` and `role.upgrader.js`.

## Not deployed
Per the brief, no deploy was performed — Hoshi will review and deploy.
