# SCREEPS FIX6 BRIEF — hauler throughput (bodies + recovery target)

Approved by Jerry 2026-10-10 ("Brief OpenCode: fix bodies + recovery target, then deploy").
Repo: /home/jma/screeps/screeps. Hoshi reviews the diff before anything is called done.
NEVER git commit or git push. Do not touch unrelated logic.

## Live diagnosis (verified via Screeps API, tick ~77,548,253)

- W9S58 is latched in economy "recovery" mode; recovery branch hard-caps
  targets.hauler = 2 (config.js line 340). Live diag: haT 2. FIX5 raised the
  normal-mode cap to 6 (line 493) but recovery overrides it, so haulers are
  only replaced up to 2 while latched.
- All 4 live haulers are [2 CARRY, 2 MOVE] (100 carry). Harvesters mine
  ~20/tick; both source containers sit at ~1900/2000 (full) while the bank is
  1150/1300 — energy is mined but cannot be moved fast enough.
- Body sizing cause: spawn loop builds the hauler body from
  energyCapacityAvailable (1300) => 12 CARRY/MOVE pairs costing 1200, which
  the bank gate (bodyCost > energyAvailable => skip) almost never passes; the
  low-bank caps (config.js ~1345-1353) then shrink spawns to 2-CARRY at
  bank < 500 and 1-CARRY at bank < 300. Result: haulers only ever spawn as
  100-carry minnows, and rarely.

## Change 1 — recovery-mode hauler target (config.js line 340)

In the `getEconomyMode(room) === "recovery"` branch of getTargets only:
`targets.hauler = 2;` -> `targets.hauler = 4;`
Update the adjacent comment if it pins the value 2. Nothing else in the
recovery branch changes (harvester/builder/upgrader/claimer targets stay).

## Change 2 — hauler body sizing (config.js spawn loop, ~lines 1345-1353)

Replace the two low-bank hauler cap conditionals:
  if (role === "hauler" && room.energyAvailable < 300 && body.filter(p => p === CARRY).length > 1) {
    body = buildBody("hauler", 200);
  } else if (role === "hauler" && room.energyAvailable < 500 && body.filter(p => p === CARRY).length > 2) {
    body = buildBody("hauler", 300);
  }
with a single sizing rule (keep the explanatory comment style of the file):
  // Haulers: size off the CURRENT bank, capped at 6 CARRY/MOVE pairs
  // (300 carry, 600 cost). The old capacity-sized body cost 1200 and almost
  // never passed the bank gate, so haulers only spawned as 100-carry
  // minnows via the low-bank caps and could not keep up with ~20/tick mined.
  if (role === "hauler") {
    body = buildBody("hauler", Math.min(room.energyAvailable, 650));
  }
buildBody("hauler", b) yields 1 pair at b=130, 2 pairs at b=250, 4 pairs at
b=450, 6 pairs at b>=650 — that natural scaling is the intent; the downstream
gate (bodyCost > energyAvailable => continue for haulers) stays as-is.
Do NOT change buildBody itself or any other role"s body logic.

## Out of scope (do not touch)

- Economy latch enter/exit conditions and ECO_HEALTHY_TICKS.
- Normal-mode hauler target formula (line 493), route/north haulers, the
  800-energy north gate, tower refill (FIX4), reservation ticksToEnd (FIX4),
  repairer gate (FIX3), slim-down/trim blocks.
- Any other module than config.js. main.js and role.* stay untouched.

## Validation (all must pass before deploy)

1. node --check config.js clean.
2. _validate_recovery.js pins the OLD recovery hauler target: line 101
   asserts t.hauler===2. That assertion encodes the behavior this fix
   intentionally changes, so update ONLY that expectation to
   t.hauler===4 (message text too), then run node _validate_recovery.js
   => 39 passed / 0 failed. Record the re-pin in the result file. Do not
   weaken or delete any other assertion.
3. Scratch harness INSIDE the repo (delete it afterwards) that loads the
   real buildBody logic or an exact extraction and asserts:
   buildBody("hauler", 130) -> 1 CARRY pair; (250) -> 2 pairs; (450) -> 4
   pairs; (1300) -> 6 pairs (capped by the new min() call site: assert the
   call-site expression min(energyAvailable, 650) with energyAvailable =
   1300 yields a 6-pair, 600-cost body).
   Also assert the recovery branch now yields targets.hauler === 4 (a stub
   harness like the FIX4/FIX5 ones is fine).

## Deploy + verify

4. Deploy with the repo deploy script: node _deploy.js (branch "default").
   STOP and report if the deploy would drop any live game module.
5. Read the live config module back through the Screeps API and confirm it
   contains both changes (targets.hauler = 4 in the recovery branch; the
   Math.min(room.energyAvailable, 650) hauler sizing). Report a short
   sha256 prefix of local vs live config.
6. Write SCREEPS_FIX6_RESULT.md in the repo root: what changed (with line
   numbers), validation output summary, harness result, deploy result,
   live read-back confirmation, and end with READY FOR REVIEW or DEPLOYED
   as appropriate. Do not delete SCREEPS_FIX6_BRIEF.md.


## Execution constraints (important)

- Work ONLY inside /home/jma/screeps/screeps. Never read, list, or stat
  paths outside the repo (no ~/, no config files). The deploy script
  (node _deploy.js) reads the Screeps API credentials itself — never
  inspect them.
- If any tool call is permission-rejected, skip that step and CONTINUE
  with the brief. A rejection is never a reason to stop the run.
- Write SCREEPS_FIX6_RESULT.md even if you end in a partial state, saying
  exactly where you stopped.
