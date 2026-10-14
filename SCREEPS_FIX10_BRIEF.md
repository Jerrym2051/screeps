# SCREEPS FIX10 BRIEF — invader defense response + builder/upgrader storage priority

Approved by Jerry 2026-10-11: "For screeps, theres an attack in the room above.
Lets have code to determine if we can spawn a creep to kill it. If yes, go kill
it." Plus: "oh also let builders and upgraders take energy from storage."

Runs AFTER all previous fixes are deployed (same files — never run two agents
in this repo at once). Repo: /home/jma/screeps/screeps. NEVER git commit or
push. Work ONLY inside the repo; never read/list/stat paths outside it
(node _deploy.js reads the API credentials itself). If a tool call is
permission-rejected, skip it and CONTINUE. Write SCREEPS_FIX10_RESULT.md in the
repo root even on partial failure. Do NOT deploy — stop after validation.

## Live situation (Hoshi-verified via API, tick ~77,565,100, 2026-10-11 09:28 EDT)
- NPC invader in W9S57 (north remote room): tough x2, move x5, ranged_attack x1,
  work x1, attack x1, at 28,43. Present since Oct 10 evening.
- ZERO friendly creeps left in W9S57 — the northern crew was killed.
- Home bank starved: ~296/1050. Storage fat: ~157,000.

## Diagnosis: why no defender spawned (verify each in code before changing)
1. config.js ~line 544 (confirm which room-stage branch): defender target is
   forced to 0 when `room.energyAvailable < 400`, even though hostilesCount > 0
   (hostilesCount already scans all 8 adjacent rooms, so W9S57 is covered).
2. Spawn gate ~line 1397: `(role === 'upgrader' || role === 'defender') &&
   room.energyAvailable - bodyCost(body) < 400` → skip. A 296 bank can never
   satisfy this.
3. Defender body builder bug ~line 177: `[TOUGH, MOVE, RANGED_ATTACK, HEAL]`
   costs 460 (10+50+150+250) but only 250 is subtracted from budget, so
   spawnCreep fails with ERR_NOT_ENOUGH_ENERGY. Rewrite with real part costs.
4. Death spiral: remote harvesters/haulers/builders/claimers keep spawning for
   W9S57 and walking into the invader, draining the bank so a defender can
   never be afforded.

## Change 1 — threat assessment + can-spawn determination
Add a helper (defense.js or config.js): `combatThreatRooms()` returning room
names (owned home room + visible adjacent rooms such as W9S57) containing at
least one hostile creep with `getActiveBodyparts(ATTACK) > 0 ||
getActiveBodyparts(RANGED_ATTACK) > 0`. NPC invaders count — attack parts are
what matters, not the owner name.

In manageSpawns target computation, when the threat list is non-empty (this is
the "can we spawn a killer" decision):
- Set `targets.attacker = 1` (ONE attacker per threat room, max 2 total; do not
  spawn a second while one is alive).
- Do NOT apply the `energyAvailable < 400 → 0` zeroing when combat threats are
  present (fix the line-544-style gate).
- Spawn gate (~1397): exempt `attacker`, and `defender` when threats are
  present, from the leave-400 reserve. Defense is existential — a dead colony
  needs no bank. Keep the reserve for upgraders.
- Affordability is the honest gate: minimum viable attacker body is one
  `[TOUGH, RANGED_ATTACK, MOVE, HEAL]` set = 460 energy. If
  `room.energyAvailable < 460`, do not spawn yet — the bank refills from
  storage via haulers once the meat grinder (Change 2) stops. Never send an
  under-built creep to die.

## Change 2 — break the meat grinder
While a remote room has a combat threat, skip spawning remote-bound creeps for
it: harvester / hauler / builder / claimer spawns whose memory.targetRoom (or
routeRoom) is a threatened room. Resume automatically when the room is clear.

## Change 3 — fix combat body costing
Rewrite defender/attacker body builders to subtract ACTUAL part costs
(TOUGH 10, MOVE 50, ATTACK 80, RANGED_ATTACK 150, HEAL 250, WORK 100,
CARRY 50, CLAIM 600). Attacker body: repeat
`[TOUGH, RANGED_ATTACK, MOVE, HEAL]` (460/set) while budget allows, minimum one
set; below 460 return [] (unaffordable — wait for bank refill).

## Change 4 — combat behavior (verify existing role.attacker.js, fix if broken)
- role.attacker.js hunts via getHostilesNear (own room + 8 adjacent). Verify it
  actually paths cross-room into W9S57 (creep.moveTo handles cross-room; ensure
  no home-room-only assumption blocks it).
- Kiting: keep range 3 from the target while ranged-attacking (already the
  shape of the role — keep it).
- Stand-down: when no hostiles are near, recycle the attacker (mirror the idle
  defender recycling at config.js ~897) instead of idling forever.

## Change 5 — builders/upgraders: storage FIRST
The storage branches exist (role.builder.js ~151, role.upgrader.js ~32) but are
unreachable in practice: the `cont` fallback (any container with > 0 energy)
matches first, so builders sip from income containers instead of the fat
storage, starving the hauler→bank pipeline.
- role.builder.js: move the storage branch FIRST — when `creep.room.storage`
  exists and holds more than STORAGE_RESERVE (1000), withdraw from storage
  before trying containers. Keep the existing chain as fallback, and keep the
  W9S57 behavior (no storage there → containers/mine as today).
- role.upgrader.js: same reorder — storage first above the reserve floor, then
  containers/spawn.
- Do NOT lower STORAGE_RESERVE. Do NOT touch FIX9's hauler/storage-churn logic.

## Validation (all must pass)
- `node --check` every edited file.
- `node _validate_recovery.js` → 39/39 (do not modify the validator).
- Do NOT deploy. Write SCREEPS_FIX10_RESULT.md and stop; Hoshi reviews the diff
  and deploys.
