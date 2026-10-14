# SCREEPS FIX9 BRIEF — sticky route tags + walk-home fallback

Approved by Jerry 2026-10-10 ("Queue FIX9 after FIX7.1 and FIX8"). Runs
AFTER FIX8 is deployed (same files — never run two agents in this repo at
once). Repo: /home/jma/screeps/screeps. NEVER git commit or push. Work ONLY
inside the repo; never read/list/stat paths outside it (node _deploy.js
reads the API credentials itself). If a tool call is permission-rejected,
skip it and CONTINUE. Write SCREEPS_FIX9_RESULT.md in the repo root even on
partial failure.

Live diagnosis by Hoshi (tick 77,550,700, verified via API + Memory read):
- Home bank at 700 < 800, so the whole north backbone block in config.js is
  skipped: remoteTargetRoom = null -> targets.routeRoom = null.
- The config `else` release branch then wipes memory.routeRoom/homeRoom from
  EVERY empty hauler — including ones already deployed north waiting by the
  north containers.
- When the bank recovers >= 800, the retag loop only tags empty haulers AT
  HOME. North-deployed haulers keep no tag.
- An untagged hauler that fills up in W9S57 (no spawn) hits deposit-mode
  step 5 ("hold near the spawn"), finds no spawn, moves nowhere, and parks
  forever. Live: two 6-CARRY haulers full at 300/300 and one at 77/300
  stationary in W9S57; home source containers at 1850 and 2000 energy with
  only one 3-CARRY hauler working them.

## Change 1 — route tags survive a bank flicker (config.js)

In the route-hauler assignment section, the `else` branch (no north route
demand, i.e. targets.routeRoom falsy) currently releases EVERY empty hauler
with a stale routeRoom tag. Narrow it: only release haulers currently in
the home room:

  for (const c of Object.values(Game.creeps)) {
    if (c.memory.role === hauler && c.memory.routeRoom &&
        c.store.getUsedCapacity(RESOURCE_ENERGY) === 0 &&
        c.room && c.room.name === room.name) {
      delete c.memory.routeRoom; delete c.memory.homeRoom;
    }
  }

North-deployed haulers keep their tags through a bank flicker and resume
route duty (full -> head home) when the bank recovers. True abandonment of
the expansion is still cleaned up by the in-role deletes (role.hauler.js
"container destroyed" and "no energy north" branches). Do NOT change the
tagging/over-tag trim logic in the `if (targets.routeRoom)` branch.

## Change 2 — deposit fallback: walk home when there is no spawn (role.hauler.js)

Deposit-mode step 5 ("No bank room and nowhere to spill: hold near the
spawn") currently does nothing when the room has no spawn, parking a loaded
hauler forever. Change it so a carrying hauler in a spawnless room walks to
the home room instead:

  // 5) No bank room and nowhere to spill: if this room has no spawn (remote
  //    room), a carrying hauler must not park — walk to the home room and
  //    deposit there next tick. Untagged north haulers stranded by a bank
  //    flicker recover on their own this way.
  if (!spawn) {
    const homeName = creep.memory.homeRoom ||
      (Object.values(Game.spawns)[0] && Object.values(Game.spawns)[0].room.name);
    if (homeName && creep.room.name !== homeName) {
      creep.moveTo(new RoomPosition(25, 25, homeName), { reusePath: 5 });
      return;
    }
  }
  if (spawn && creep.pos.getRangeTo(spawn) > 1) creep.moveTo(spawn, { reusePath: 5 });
  return;

Place the new block immediately before the existing hold-near-spawn line.
Nothing else in deposit mode changes.

## Out of scope

- The north backbone 800-energy gate itself (unchanged).
- The route tag counting/trim in the `if (targets.routeRoom)` branch.
- Recovery latch, FIX4/5/6/7/7.1/8 behavior, role.harvester/role.builder/
  role.repairer/main/defense changes.

## Validation (all must pass before deploy)

1. node --check config.js and role.hauler.js — clean.
2. node _validate_recovery.js => 39 passed / 0 failed (validator untouched).
3. Scratch harness INSIDE the repo (deleted afterwards), running the REAL
   config.js target section and role.hauler.js with stubbed globals:
   a. Bank < 800 (targets.routeRoom falsy): an EMPTY hauler in the north
      room WITH a routeRoom tag keeps it; an EMPTY hauler at home with a
      routeRoom tag loses it (existing behavior preserved).
   b. Untagged FULL hauler in a spawnless room (stub Game.spawns with one
      spawn in W9S58): calls moveTo toward a RoomPosition in W9S58 (does
      not park).
   c. Control: full hauler at home with a spawn nearby keeps the existing
      hold/transfer behavior (no moveTo to another room).

## Deploy + verify

4. node _deploy.js (branch "default"). STOP and report if any live game
   module would be dropped.
5. Read live config and role.hauler back via the Screeps API; confirm the
   markers (home-room-only release in config; the walk-home fallback in
   role.hauler step 5) and report sha256 prefixes local vs live for both.
6. Write SCREEPS_FIX9_RESULT.md: changes with line numbers, validation,
   harness results, deploy, read-back, ending DEPLOYED or the exact
   failure point. Keep this brief.

## Change 3 -- surplus shuttle: bank full -> storage / central container (role.hauler.js)

Requirement from Jerry (2026-10-10): once spawn AND extensions are full,
haulers must actively move energy from source containers into storage or
the central (spawn-side, non-buffer) container, instead of idling or
feeding the tower first. Live symptom: bank full (spawn 300/300, 19 of 20
extensions full), source containers full at 2000/2000, haulers not
shuttling the surplus into storage (73945 energy, nowhere near full).

### 3a. Deposit mode reorder
Current order: 0) critTower emergency, 1) bank, 2) tower-from-surplus,
3) storage, 4) spill container, 5) hold near spawn.
New order: 0) critTower emergency (UNCHANGED - tower below 300 still
refills first so defense never goes dark), 1) bank (UNCHANGED), 2) NEW
surplus shuttle: when NO bank structure (spawn/extension) has free
capacity, deposit into storage if it has free capacity and room for the
load (keep the existing storage condition), else into the spawn-side
central container (the existing spill selection: non-buffer container
with free capacity, closest to spawn), 3) tower-from-surplus (existing
cE >= 1500 and energyAvailable >= 400 gates UNCHANGED, now runs only
when storage/central have no room), 4) hold near spawn (UNCHANGED, plus
the Change 2 walk-home fallback for spawnless rooms).
Effect: surplus goes to storage/central container BEFORE the tower
drinks it. Accepted tradeoff: tower refills slower when the bank is
full; the sub-300 emergency refill still jumps the queue.

### 3b. Withdraw mode: stop the storage churn when the bank is full
The storage-liquidity branch (withdraw FROM storage to refill the bank)
currently fires whenever energyAvailable < energyCapacityAvailable,
even when the bank is all but full (live: 1281/1300) - the hauler then
shuttles storage -> bank for a few energy while full source containers
wait. Tighten its gate: only draw from storage when the bank has
meaningful room, i.e.
  creep.room.energyAvailable < creep.room.energyCapacityAvailable - 100
When the bank is full, an empty hauler skips the storage draw and keeps
draining source buffers (existing buffer logic, unchanged).

### Harness additions (in-repo scratch, deleted afterwards)
d. Full hauler, bank full, tower with free capacity, storage with free
   capacity -> transfer/moveTo targets STORAGE (not the tower).
e. Full hauler, bank full, storage full or no room for the load ->
   targets the spawn-side central (non-buffer) container.
f. Empty hauler, bank within 100 of capacity, source buffers full ->
   withdraws from a source buffer (does NOT withdraw from storage).
g. Control: tower below 300 energy and pool >= 600 -> critTower
   emergency refill still fires first (existing behavior preserved).

## Out of scope (appended)
- The 800-energy north backbone gate (unchanged).
- Tower surplus-gate thresholds (unchanged, only reordered).
- STORAGE_RESERVE = 1000 floor (unchanged).
