# SCREEPS_FIX5 result

Brief: `SCREEPS_FIX5_BRIEF.md`. Context: FIX3 + FIX4 are deployed and verified live.
Jerry's call: leave the 800-energy north-expansion gate as is, but let the home room
field more haulers. Scope: touch only `config.js`. NO deploy (`_deploy.js` NOT run),
NO git commit/push.

## The change

`config.js` `getTargets` — home hauler-target per-container cap multiplier 2 → 3.

Code line (now line 493):
```
-    targets.hauler = (srcContainersBuilt > 0 ? Math.min(Math.max(2, harvesterCount * 2 + 1), Math.max(3, srcContainersBuilt * 2)) : 0) + routeHaulers;
+    targets.hauler = (srcContainersBuilt > 0 ? Math.min(Math.max(2, harvesterCount * 2 + 1), Math.max(3, srcContainersBuilt * 3)) : 0) + routeHaulers;
```

Comment block above it updated to match the new multiplier + examples:
```
-    // New rule: hard-cap haulers at 2 per BUILT source container (floor 3 so a single
-    // container keeps a spare to cover a hauler death / round-trip gap). The
-    // harvester-count term (2×count+1, floor 2) stays only as a soft LOWER bound, so
-    // a room with many harvesters per container still gets its backbone. Net effect:
-    // 2 containers → 4; 1 container → 3; 0 containers → 0.
+    // New rule: hard-cap haulers at 3 per BUILT source container (floor 3 so a single
+    // container keeps a spare to cover a hauler death / round-trip gap). The
+    // harvester-count term (2×count+1, floor 2) stays only as a soft LOWER bound, so
+    // a room with many harvesters per container still gets its backbone. Bumped 2→3
+    // per the north-expansion gate (unchanged) to move more energy per tick: bank
+    // refill, tower feeding, and repair backlog. Net effect: 2 containers → 6;
+    // 1 container → 3; 0 containers → 0.
```

Effect: W9S58's 2 built source containers now yield home hauler target 4 → 6
(`Math.max(3, 2*3)=6`, soft lower bound `harvesterCount*2+1` unchanged as a min).
1 container → 3; 0 containers → 0.

## Explicitly unchanged (per brief)
- `routeHaulers` (north route haulers) and its 2-per-container / cap-4 rule.
- The 800-energy gates (`northBankOk` and the remote-harvester spawn check).
- Hauler low-bank body caps, body sizing, spawn priorities, every other target, and
  every other file.

## Validation (all required)

### Step 1 — `node --check config.js`
```
ok  config.js
```

### Step 2 — `node _validate_recovery.js`
```
RESULT: 39 passed, 0 failed
```
(exit code 0 — no test pinned the old hauler cap; nothing edited in the test)

### Step 3 — grep: the changed line + confirm no other hauler-target computation

The changed line:
```
config.js:493:    targets.hauler = (srcContainersBuilt > 0 ? Math.min(Math.max(2, harvesterCount * 2 + 1), Math.max(3, srcContainersBuilt * 3)) : 0) + routeHaulers;
```

All `targets.hauler` assignments in `config.js` (full audit):
```
340:      targets.hauler = 2;                                   # recovery branch (backbone fixed) — out of scope
493:    targets.hauler = (... Math.max(3, srcContainersBuilt * 3) ...) + routeHaulers;   # HOME cap — THE change
552:    targets.hauler = filled > 0 ? Math.ceil(filled / 2) : 0; # outpost stage — out of scope
566:    targets.hauler = filled > 0 ? Math.ceil(filled / 2) : 0; # expansion stage — out of scope
577:    targets.hauler = filled > 0 ? Math.ceil(filled / 2) : 0; # unknown-stage fallback — out of scope
```
Line 493 is the ONLY home hauler-target computation. Lines 340/552/566/577 are
different economy/stage branches and were left unchanged as instructed.

Search for a second hauler-target computation in `main.js` / `role.*.js` / other
modules (excluding `config.js`):
```
$ grep -rn --include=*.js --exclude-dir=node_modules \
    -E "targets\.haulers?\s*=|haulers?\s*=.*Math\.(min|max)|per BUILT source container" . \
    | grep -v "^./config.js"
  (none outside config.js)
```
No hauler-target computation exists outside `config.js`. Nothing to report/change.

Observation (NOT changed, per "touch only the specified line + its comment block"):
the hauler slim-down/trim block (~lines 1005–1032) only *consumes* `targets.hauler`
(it does not compute the target). Two of its explanatory comments still cite the old
range ("targets.hauler is capped at 2" / "can be 3-4"); with the new cap the
with-containers value can now reach 6. These are read-only consumers and are outside
the brief's stated scope, so they were left untouched.

## Result
Only `config.js` changed (one code line + its comment block). Step 1 parse clean;
Step 2 39/0; Step 3 grep confirms a single home hauler-target computation and no
second one elsewhere. No deploy, no commit/push.

READY FOR REVIEW — not deployed.

## Deploy record (Hoshi, 2026-10-09 ~20:38 EDT)
Jerry approved the direction (leave 800 gate, more haulers). Deployed via _deploy.js (ok:1); live config sha256-10 81132b4e45 matches local. Post-deploy diag: haT 4 (last pre-deploy throttled sample) -> haT 6 confirmed ~20:45 EDT. No git commit/push.
