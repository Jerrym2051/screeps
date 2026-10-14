# FIX12 Brief: North Builder Gate + Road Filter

## Problem 1: No builder in W9S57 (north/expansion room)
The entire north-room block is gated by `northBankOk = room.energyAvailable >= 800`
(config.js ~line 480). Bank is 361–463, so NO north builder, harvesters, or haulers
get assigned. W9S57 has 26 construction sites (25 roads + 1 container) and 0 of our
creeps.

But the north builder operates on LOCAL energy (W9S57 containers/sources) — it does
not drain the home bank after spawning. Only the one-time spawn cost hits the bank.
Same blind spot as the FIX11 upgrader gate.

### Change required (config.js ~line 480)
Make `northBankOk` storage-aware, using the same 50k threshold as FIX11:
```js
// Before:
const northBankOk = room.energyAvailable >= 800;
// After:
// Storage-backed bypass (same 50k threshold as the upgrader gate): north crews
// operate on local energy (containers/sources in the expansion room), not the home
// bank. Only the one-time spawn cost hits the bank, guarded by the 50-reserve.
const northStorageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
const northBankOk = room.energyAvailable >= 800 || northStorageEnergy > 50000;
```
Add a brief comment explaining the rationale.

## Problem 2: Road filter blocks expansion-room roads
In role.builder.js (~line 106-107):
```js
filter: s => (lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)
  && (lvl >= 2 || s.structureType !== STRUCTURE_ROAD)
```
W9S57's controller is level 0 (reserved, not owned), so `lvl >= 2` is false and EVERY
road site is permanently excluded. The gate was meant to skip early roads in the
HOME room, but it also kills roads in expansion rooms where build.js deliberately
placed them.

### Change required (role.builder.js ~line 106-107)
Allow roads when the room isn't owned by us (remote/expansion room):
```js
// Before:
filter: s => (lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)
  && (lvl >= 2 || s.structureType !== STRUCTURE_ROAD)
// After:
// Roads are skipped pre-RCL2 only in our OWNED home room (early-game waste).
// In remote/expansion rooms (not owned), road sites were deliberately placed by
// build.js — build them regardless of controller level.
const isOwnedRoom = creep.room.controller && creep.room.controller.my;
filter: s => (lvl >= 3 || s.structureType !== STRUCTURE_RAMPART)
  && (lvl >= 2 || !isOwnedRoom || s.structureType !== STRUCTURE_ROAD)
```
Do NOT change the rampart gate — ramparts in unowned rooms are useless (no
controller to activate them).

## Constraints
- Use the same 50000 storage threshold as FIX11 for consistency.
- Do NOT change harvester/hauler spawn logic beyond the northBankOk gate.
- Do NOT change the rampart filter.
- The 50-reserve still applies to all spawns.
- Do NOT commit or push. The repo stays dirty on branch `main`.
- Do NOT deploy. Hoshi will review and deploy.

## Verification
1. Run the validator — must be 39/39 passed, 0 failed.
2. `node --check` on both modified files.

## Output
Append to `SCREEPS_FIX11_RESULT.md` (or create `SCREEPS_FIX12_RESULT.md`) with:
- What was changed (file, line numbers, before/after)
- Validator result
- Confirmation that no other logic was touched
