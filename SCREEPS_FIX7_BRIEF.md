# SCREEPS FIX7 BRIEF — remote deposit, north repairs, hauler targeting

Approved by Jerry 2026-10-10 (scoped version: recovery-mode north access is
NOT in scope). Repo: /home/jma/screeps/screeps. Hoshi reviews before anything
is called done. NEVER git commit or git push. Work ONLY inside the repo;
never read/list/stat paths outside it (the deploy script node _deploy.js
reads the API credentials itself — never inspect them). If a tool call is
permission-rejected, skip it and CONTINUE. Write SCREEPS_FIX7_RESULT.md in
the repo root even on partial failure, stating exactly where you stopped.

Diagnosis (verified live + in code by Hoshi, tick ~77,548,253):
- W9S57 remote harvester sat FULL (250/250) beside two EMPTY containers:
  role.harvester.js findDumpTarget() returns the room spawn whenever no
  haulers are in the room; W9S57 has no spawn, so it returns undefined and
  the container-dump steps below never run. Deadlock: route haulers need a
  north container >=300 to spawn; the container needs this deposit.
- North containers at 50,000 and 70,000 of 250,000 hits, decaying, and
  nobody repairs them: role.builder.js never repairs, role.repairer.js
  never leaves home, and the north builder only spawns for construction
  SITES (containers are already built) — and heads home when sites run out.
- Hauler targeting: withdraw picks "fullest buffer" every tick with no
  reservations, so several haulers converge on one container; one withdraw
  makes it non-fullest and the rest scatter (thrash).

## Change 1 — remote harvesters can dump (role.harvester.js)

In findDumpTarget(), the cold-start branch:
  if (haulers.length === 0) {
becomes:
  if (haulers.length === 0 && spawn) {
(`spawn` is already defined at the top of findDumpTarget.) Spawn-less
(remote) rooms then fall through to the existing container steps 1-2.
Home-room behavior with a spawn present is unchanged. Nothing else in
role.harvester.js changes.

## Change 2 — north builder repairs (role.builder.js)

In the remote-duty block (memory.targetRoom set, creep in target room):
currently when FIND_CONSTRUCTION_SITES is empty the creep clears
targetRoom and heads home. Insert a repair duty BEFORE that give-up:
- damaged = structures in this room with (CONTAINER or ROAD) and
  hits < hitsMax * 0.9. If any: pick the lowest-hits one (tie: closest).
  - If the creep carries no energy: withdraw from the nearest container
    in this room holding energy (existing patterns in this file), else
    harvest the nearest source; move into range as needed. Return.
  - Else repair it (moveTo with reusePath 5 if ERR_NOT_IN_RANGE). Return.
Only when there are no sites AND nothing damaged does the existing
clear-targetRoom-and-head-home behavior run. Home-room builder behavior
outside the remote block is untouched.

## Change 3 — dispatch a north builder for repairs too (config.js)

In the north block (where northSites/northBuildersAssigned are computed),
the builder currently requires construction sites. Add repair need:
  const northNeedsRepair = northSrcCont.some(c => c.hits < 120000);
and change the gate to:
  if ((northSites.length > 0 || northNeedsRepair) && northBuildersAssigned < 1) northBuilder = 1;
(northSrcCont is already computed just above for routeHaulers.) Threshold
120000 is a literal in code with a short comment. Nothing else in the
north block or the recovery latch changes.

## Change 4 — hauler targeting: full-first, closest fallback, reservations, sticky (role.hauler.js)

Applies to BOTH withdraw selections: the home "Withdraw mode" buffer pick
and the north route-room withdraw/top-up picks (the rconts selections).
Design (implement as a small local helper used by both, e.g.
pickHaulTarget(creep, candidates), consistent with file style):

- Candidates = the branch"s existing candidate set (home: isBuffer
  containers with energy > 0; route: source-adjacent (range 1) containers
  with energy > 0). Do not widen or narrow these sets.
- Reservations: for candidate c, reserved(c) = sum of
  store.getFreeCapacity(RESOURCE_ENERGY) over OTHER creeps with
  memory.role === "hauler" and memory.haulSrc === c.id (any room — ids are
  unique). effective(c) = c.store.getUsedCapacity(RESOURCE_ENERGY) - reserved(c).
  Drop candidates with effective(c) <= 0.
- Sticky: if creep.memory.haulSrc names a surviving candidate, keep it.
- Else: among surviving candidates prefer FULL ones
  (store.getFreeCapacity(RESOURCE_ENERGY) === 0); among full ones pick the
  closest by range; if none full, pick the closest surviving candidate.
  (creep.pos.findClosestByRange is fine.)
- After choosing, set creep.memory.haulSrc = chosen.id (the home branch
  already does this; the route branch must now set it too, so the other
  haulers can see the reservation).
- Clear creep.memory.haulSrc when the hauler enters deposit mode at home
  (top of the existing used > 0 deposit branch: delete creep.memory.haulSrc)
  so loaded haulers stop reserving. The deposit branch never deposits into
  buffers, so this does not reopen the bounce problem the haulSrc spill
  filter guards against; leave that filter as-is.
- If no candidate survives (all fully reserved), fall through to whatever
  the branch did when its container list was empty (home: storage/drops/
  harvest ladder; route empty case: the existing wait/head-home logic) —
  never idle in withdraw mode because of reservations alone.
Update the misleading "fullest harvest buffer" comment to describe the new
rule briefly. Deposit-mode logic otherwise unchanged.

## Out of scope

- Recovery latch (getEconomyMode, ECO_HEALTHY_TICKS) and the recovery
  branch"s early return (north targets stay normal-mode only).
- FIX4/FIX5/FIX6 behavior: tower refill gates, north 800-energy gate,
  route hauler count rule (min(4, northFilled*2)), hauler target formula,
  hauler body sizing (Math.min(room.energyAvailable, 650)), recovery
  targets.hauler = 4.
- role.repairer.js, role.claimer.js, build.js, main.js, defense.js.

## Validation (all must pass before deploy)

1. node --check on role.harvester.js, role.builder.js, role.hauler.js,
   config.js — clean.
2. node _validate_recovery.js => 39 passed / 0 failed. (If the config
   north-gate change breaks a validator expectation, STOP and report; do
   not edit the validator in this fix.)
3. Scratch harness INSIDE the repo (deleted afterwards), running the REAL
   modules with stubbed globals (the style of _validate_recovery.js),
   asserting at minimum:
   a. Hauler pick: far FULL buffer (2000) + near partial (500), no
      reservations -> target is the FULL one.
   b. Hauler pick: no full buffers -> target is the CLOSEST partial.
   c. Hauler pick: near partial (500) fully reserved by another hauler
      (haulSrc set, free capacity 500) -> target is the other buffer.
   d. Hauler sticky: creep with haulSrc = near partial (still effective)
      keeps it even though a farther buffer is fuller.
   e. Harvester dump: stub creep with full store in a room with NO spawn,
      a source, and a container within range 3 of the source -> the module
      moves/transfers toward the container (does not idle).
   f. North gate: a getTargets-style stub where the north room has a built
      source container at 100,000 hits and no construction sites ->
      targets.northBuilder === 1. (If stubbing getTargets for the north
      block proves impractical, say so in the result file and instead
      assert the gate expression on extracted inputs — but try the real
      path first.)
   g. Builder repair: if feasible with stubs, a builder in its targetRoom
      with no sites and a damaged container repairs/withdraws instead of
      clearing targetRoom; if not feasible, state why in the result file.

## Deploy + verify

4. Deploy: node _deploy.js (branch "default"). STOP and report if any live
   game module would be dropped.
5. Read the live role.harvester, role.builder, role.hauler and config
   modules back via the Screeps API; confirm markers present
   ("haulers.length === 0 && spawn", "120000", your reservation helper)
   and report sha256 prefixes local vs live for all four modules.
6. Write SCREEPS_FIX7_RESULT.md: changes with line numbers, validation
   outputs, harness results, deploy result, live read-back, ending
   DEPLOYED or the exact failure point. Keep SCREEPS_FIX7_BRIEF.md.
