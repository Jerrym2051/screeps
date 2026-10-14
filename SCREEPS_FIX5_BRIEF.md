# SCREEPS_FIX5_BRIEF — allow more haulers (home hauler cap up)

Context: FIX3 + FIX4 are deployed and verified live. Jerry's call: leave the
800-energy north-expansion gate exactly as is, but let the home room field
more haulers (logistics throughput is the bottleneck — the bank refills
slowly and the tower/container backlog wants more carrying capacity).
Working tree only until review. NO deploy (`_deploy.js` must NOT be run),
NO git commit/push. Touch only `config.js`.

## The change

In `config.js`, the hauler target is computed in `getTargets` (~line 490):

```js
targets.hauler = (srcContainersBuilt > 0 ? Math.min(Math.max(2, harvesterCount * 2 + 1), Math.max(3, srcContainersBuilt * 2)) : 0) + routeHaulers;
```

Change the per-container cap multiplier from 2 to 3, i.e.
`Math.max(3, srcContainersBuilt * 2)` → `Math.max(3, srcContainersBuilt * 3)`.

With W9S58's 2 built source containers the home hauler target goes 4 → 6.
Update the explanatory comment block above this computation (the
"New rule: hard-cap haulers at 2 per BUILT source container..." text) so it
matches the new multiplier and its examples (2 containers → 6; 1 container
→ 3). Keep the reasoning style; note the bump was requested to move more
energy per tick (bank refill + tower feeding + repair backlog).

## Explicitly unchanged

- `routeHaulers` (north route haulers) and its 2-per-container / cap-4 rule.
- The 800-energy gates (`northBankOk` and the remote-harvester spawn check).
- Hauler low-bank body caps, body sizing, spawn priorities, every other
  target, and every other file.

## Validation (all required)

1. `node --check config.js` — clean.
2. Run `_validate_recovery.js` — expect 39 passed / 0 failed. If any test
   pins the old hauler cap, STOP and report it in the result instead of
   editing the test.
3. Grep to show the changed line and confirm no other hauler-target
   computation exists elsewhere (check main.js / role files for a second
   place that caps haulers; report if found, do not change it).
4. Write `SCREEPS_FIX5_RESULT.md` with the diff and validation output,
   ending with: READY FOR REVIEW — not deployed.
