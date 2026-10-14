# FIX12 Result: North Builder Gate + Road Filter

## Summary
Two targeted fixes unblocking the north/expansion room (W9S57):
1. `config.js` — the entire north backbone was gated by a bank-only `northBankOk` check;
   it now has a storage-backed bypass using the same 50k threshold as FIX11.
2. `role.builder.js` — the road site filter skipped roads in unowned rooms (W9S57's
   controller is level 0), permanently excluding the 25 deliberately-placed road sites;
   roads are now built in remote/expansion (unowned) rooms. The rampart gate is untouched.

---

## Changes

### 1. North bank gate — `config.js` (`_computeTargets`)

**Before** (was config.js line 480):
```js
    const nr = northRemoteRoom(room);
    const northBankOk = room.energyAvailable >= 800;
```

**After** (now config.js lines 480–484, incl. explanatory comment):
```js
    const nr = northRemoteRoom(room);
    // Storage-backed bypass (same 50k threshold as the upgrader gate): north crews
    // operate on local energy (containers/sources in the expansion room), not the home
    // bank. Only the one-time spawn cost hits the bank, guarded by the 50-reserve.
    const northStorageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
    const northBankOk = room.energyAvailable >= 800 || northStorageEnergy > 50000;
```
Logical widening only: `bank >= 800` OR `storage > 50000`. Below 50k storage the gate
reverts to the old bank-only check automatically. Harvester/hauler spawn logic is unchanged.

### 2. Road filter — `role.builder.js`

**Before** (was role.builder.js lines 104–107):
```js
  if (!site) {
    const sites = creep.room.find(FIND_CONSTRUCTION_SITES, {
      filter: s => (lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)
        && (lvl >= 2 || s.structureType !== STRUCTURE_ROAD) });
```

**After** (now role.builder.js lines 104–111, incl. explanatory comment):
```js
  if (!site) {
    // Roads are skipped pre-RCL2 only in our OWNED home room (early-game waste).
    // In remote/expansion rooms (not owned), road sites were deliberately placed by
    // build.js — build them regardless of controller level.
    const isOwnedRoom = creep.room.controller && creep.room.controller.my;
    const sites = creep.room.find(FIND_CONSTRUCTION_SITES, {
      filter: s => (lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)
        && (lvl >= 2 || !isOwnedRoom || s.structureType !== STRUCTURE_ROAD) });
```
- Rampart clause: `(lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)` — **unchanged**.
- Road clause: added `|| !isOwnedRoom ||` so unowned/expansion rooms build roads at any
  `lvl` (incl. `lvl === 0`). In the owned home room the clause reduces to the original
  `(lvl >= 2 || s.structureType !== STRUCTURE_ROAD)`.

---

## Constraints honored
- **Same 50000 storage threshold as FIX11** (consistency).
- **50-reserve still applies** to all spawns (not touched).
- **No harvester/hauler spawn-logic change** beyond the `northBankOk` gate.
- **Rampart filter not changed** (verified: no `!isOwnedRoom` precedes the RAMPART check).
- **Not committed or pushed.** Repo stays dirty on branch `main`.

## Verification
1. Validator: `node _validate_recovery.js`:
   ```
   RESULT: 39 passed, 0 failed
   ```
   (Baseline 39/39; the stub room has no north remote room / undefined storage-energy
   index, so `northBankOk` evaluates identically to before and all existing assertions
   hold.)
2. `node --check` on both modified files: `config.js OK`, `role.builder.js OK`.

## Confirmation: no other logic was touched
Only the two sites above were edited. No other spawn gates, targets, priorities, filters,
or role logic were modified. The concurrent FIX10 changes present in `config.js`/`role.builder.js`
are pre-existing working-tree state and were left alone.
