# Screeps FIX10 Result — 2026-10-11

## What happened
- Two OpenCode agent runs (pids 88786, 88869/89724) died silently without
  writing this file and without implementing the brief. Hoshi implemented
  FIX10 directly on the Pi after verifying the agent path had failed twice.
- Backups of pre-edit files: /tmp/config.js.bak-fix10,
  /tmp/role.builder.js.bak-fix10, /tmp/role.upgrader.js.bak-fix10.

## Live situation at implementation time
- The W9S57 NPC invader (2 TOUGH/5 MOVE/1 RANGED_ATTACK/1 WORK/1 ATTACK) was
  GONE by ~11:35 EDT — left or despawned. No attacker needed right now.
- Bank recovered on its own to 1200/1050; storage at 164,418. Colony already
  re-establishing the north (claimer in W9S57).

## Changes (all in the live `default` branch, 15/15 modules verified)
1. **Threat determination** (`config.js`): `combatThreatRooms` — home + 8
   adjacent rooms scanned for hostiles with active ATTACK/RANGED_ATTACK parts.
2. **Spawn-a-killer** (`config.js`): when threats exist, `targets.attacker = 1`
   regardless of bank level or stage. Affordability = 460 body minimum +
   standard 50-reserve at the spawn gate (honest gate, no fake reserve).
3. **Body costing fixed** (`config.js`): defender and attacker builders now
   subtract REAL part costs (460 per [TOUGH,MOVE,RANGED_ATTACK,HEAL] set).
   The old code subtracted 250/300 for a 460-cost body, so spawnCreep failed
   with ERR_NOT_ENOUGH_ENERGY every time.
4. **Meat grinder closed** (`config.js`): claimer, remote harvesters, route
   haulers, and north builders are all skipped while their target room is in
   `combatThreatRooms`.
5. **Attacker stand-down** (`config.js`): idle defender/attacker recycling now
   covers attackers and checks adjacent rooms, not just home-room hostiles.
6. **Storage-first energy** (`role.builder.js`, `role.upgrader.js`): storage
   above the 1000 reserve is now the FIRST energy source; containers/spawn are
   fallbacks. Rooms without storage (W9S57) skip straight to containers.
7. **Attacker combat** (`role.attacker.js`): verified — hunts via
   `defense.getHostilesNear` (own room + 8 neighbors, covers W9S57 from W9S58),
   paths cross-room with moveTo, idles at spawn when clear. No change needed.

## Validation & deploy
- `node --check`: clean on all edited files.
- `node _validate_recovery.js`: **39 passed, 0 failed**.
- Deployed via `node _deploy.js` → `{"ok":1}`; read-back: 15/15 module
  hashes match, all FIX10 markers present live.

## Expected live behavior
- No threat now → `targets.attacker = 0`, nothing spawns. Correct.
- Next invader: one 460-minimum attacker spawns once bank ≥ 510, hunts in
  home + adjacent rooms, recycles when the threat clears and energy is tight.
- Builders/upgraders now draw upgrade/build energy from storage first.
