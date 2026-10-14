# SCREEPS FIX8 RESULT

## Changes

### Change 1 — critical repair outranks building (role.builder.js)

Extracted the FIX7 repair-duty body into a local `repairDuty(creep, damagedList)` helper
(`role.builder.js:17-46`) that returns `true` when a target was handled, `false` when
the list was empty. Used in two places inside the remote-duty block:

- **Step 1 — critical repair (lines 54-61):** before the construction-site check, looks
  for any usable (`my || !owner`) container in the target room with `hits < 60000`
  and routes through `repairDuty`. The literal `60000` appears at `role.builder.js:59`
  with comment `// container below this is about to decay away`. If a dying container
  is found, the builder repairs it (or fetches energy / moves toward it) and does NOT
  touch `memory.targetRoom`.

- **Step 2 — build flow (line 62-63):** if construction sites exist, falls through
  exactly as before (untouched home-room build logic).

- **Step 3 — existing FIX7 repair duty (lines 68-75):** if no sites remain, calls
  `repairDuty` with the original containers/roads filter (`hits < hitsMax * 0.9`),
  then clears `memory.targetRoom` and heads home — identical to FIX7 behavior.

Home-room builder behavior outside the remote block is unchanged. `role.repairer.js`
is not touched.

### Change 2 — remote road site cap 10 → 25 (build.js)

In `placeRemoteNorthRoads`:

- `build.js:509` — comment updated: "caps outstanding road sites at 25"
- `build.js:531` — comment updated: "Outstanding road sites cap at 25 per room"
- `build.js:548` — comment updated: "capped at 25 outstanding"
- `build.js:554` — arithmetic: `Math.max(0, 25 - roadSites.length)`

Destinations, entry-exit pathing, `_remoteRoadTiles` cache, and the never-on-a-container
rule are all unchanged.

## Validation (all passed before deploy)

| Check | Result |
|-------|--------|
| `node --check role.builder.js` | clean |
| `node --check build.js` | clean |
| `node _validate_recovery.js` | **39 passed, 0 failed** (validator untouched) |
| Scratch harness `_scratch_fix8.js` | **7 passed, 0 failed**, then deleted |

### Scratch harness details (run with stubbed globals, real `role.builder.js`)

- **a.** Builder in targetRoom, sites present, container at 50,000 hits → `repair`
  called, `build` NOT called, `memory.targetRoom` NOT deleted. ✔
- **b.** Builder in targetRoom, sites present, container at 250,000 hits → `repair`
  NOT called, `build` called (fell through to existing build flow). ✔
- **c.** Builder in targetRoom, NO sites, container at 100,000 hits (< 90 % of
  250,000) → existing FIX7 repair duty fired, `build` NOT called. ✔

### build.js grep assertion (per brief §validation)

```
build.js:509:  // ...caps outstanding road sites at 25...
build.js:548:  // ...capped at 25 outstanding.
build.js:554:  let allowed = Math.max(0, 25 - roadSites.length);
```

Cap literal is **25** at `build.js:554`.

## Deploy

`node _deploy.js` (branch `default`) — 15 game modules pushed:

```
[deploy] local game modules: build, cache, config, defense, main, role.attacker,
  role.builder, role.claimer, role.defender, role.harvester, role.hauler,
  role.looter, role.miner, role.repairer, role.upgrader
[deploy] pushing 15 modules to branch default ...
[deploy] result: {"ok":1,"timestamp":1791667873773}
[deploy] OK
```

No live game module was dropped.

## Live read-back (Screeps API, branch `default`)

| Module | Local sha256 (12-char prefix) | Live sha256 (12-char prefix) | Match | Marker |
|--------|-------------------------------|-------------------------------|-------|--------|
| `role.builder` | `b95d630ecd8e` | `b95d630ecd8e` | ✓ | `60000` present at live `:59` |
| `build` | `4aaa2a4e95ca` | `4aaa2a4e95ca` | ✓ | `25 - roadSites.length` present at live `:554` |

Both modules verified live.

## Status

**DEPLOYED** — all changes validated and live on branch `default`.
