# SCREEPS FIX8 BRIEF — north builder repair-first + remote road cap

Approved by Jerry 2026-10-10 ("Queue FIX8: builder repair-first + road cap
raise"). Runs AFTER FIX7.1 is deployed (same files — never run two agents in
this repo at once). Repo: /home/jma/screeps/screeps. NEVER git commit or
push. Work ONLY inside the repo; never read/list/stat paths outside it
(node _deploy.js reads the API credentials itself). If a tool call is
permission-rejected, skip it and CONTINUE. Write SCREEPS_FIX8_RESULT.md in
the repo root even on partial failure.

Live context (verified by Hoshi, tick ~77,549,3xx):
- W9S57 near container (10,000 hits) decayed to destruction; planner
  re-sited it and the source harvester is rebuilding it. Far container at
  ~15,000 hits and decaying (~50 hits/tick reserved-room rate).
- FIX7 builder repair duty only fires when there are ZERO construction
  sites; sites exist (container + 10 road sites), so the builder builds
  while the far container keeps decaying.
- placeRemoteNorthRoads caps outstanding road sites at 10 per room; all 10
  slots sit at 0 progress on the entry leg, so the final leg to the far
  source container is never sited.

## Change 1 — critical repair outranks building in the north (role.builder.js)

In the remote-duty block (memory.targetRoom set), restructure the priority
when the creep is IN the target room to:

  1. CRITICAL REPAIR: if any usable (my || !owner) CONTAINER in the room
     has hits < 60000, repair the lowest-hits such container, using the
     FIX7 repair-duty energy logic (empty: withdraw from the nearest
     container in the room holding energy, else harvest the nearest
     source; move into range; return). This runs BEFORE the construction
     site check, so a dying container outranks all building.
  2. Else if construction sites exist: existing build flow (fall through
     exactly as today).
  3. Else the existing FIX7 repair duty (containers/roads, hits <
     hitsMax * 0.9) and the existing clear-targetRoom-and-head-home.

Implement by extracting the existing repair-duty body into a small local
helper (e.g. repairDuty(creep, damagedList) returning true when handled)
used by both step 1 and step 3, or by duplicating the few lines — file
style tolerates either; keep it readable. The 60000 threshold is a literal
with a short comment (e.g. // container below this is about to decay away).
Home-room builder behavior outside the remote block is untouched.
role.repairer.js is NOT changed (no dedicated north repairer in this fix).

## Change 2 — remote road site cap 10 -> 25 (build.js)

In placeRemoteNorthRoads: the outstanding-road-site cap goes from 10 to 25.
Update both the arithmetic (allowed = Math.max(0, 25 - roadSites.length))
and the comments that say 10. Nothing else changes: destinations (sources
with a built or sited container), entry-exit pathing, the
_remoteRoadTiles cache, and the never-on-a-container-tile rule stay as-is.

## Out of scope

- config.js entirely (the north builder dispatch gate already fires on
  sites > 0 or a source container < 120000, which covers dispatch before
  the 60000 critical line).
- Recovery latch, FIX4/5/6/7/7.1 behavior, role.harvester/role.hauler/
  role.repairer/main/defense changes.

## Validation (all must pass before deploy)

1. node --check role.builder.js and build.js — clean.
2. node _validate_recovery.js => 39 passed / 0 failed (validator untouched).
3. Scratch harness INSIDE the repo (deleted afterwards), running the REAL
   role.builder.js with stubbed globals, asserting:
   a. Builder in targetRoom, construction sites present, container at
      50,000 hits -> calls repair (or moveTo toward the container) and
      does NOT delete memory.targetRoom.
   b. Control: builder in targetRoom, sites present, all containers
      >= 200,000 hits -> falls through to the existing build behavior
      (does not repair).
   c. Builder in targetRoom, NO sites, container at 100,000 hits (below
      90% of 250,000) -> existing FIX7 repair duty still fires.
   For build.js, a grep-level assertion in the result file that the cap
   literal is 25 is acceptable (note it as such).

## Deploy + verify

4. node _deploy.js (branch "default"). STOP and report if any live game
   module would be dropped.
5. Read live role.builder and build back via the Screeps API; confirm the
   markers (60000 in role.builder; the 25 cap in build) and report
   sha256 prefixes local vs live for both modules.
6. Write SCREEPS_FIX8_RESULT.md: changes with line numbers, validation,
   harness results, deploy, read-back, ending DEPLOYED or the exact
   failure point. Keep this brief.
