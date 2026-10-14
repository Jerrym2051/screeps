# FIX13 Brief: Predictive Creep Replacement

## What
Anticipate creep death and spawn replacements BEFORE the old creep dies, eliminating
coverage gaps. Currently the spawner waits until `liveCount < target` (creep already
dead), creating a gap of spawnTime + travelTime with no worker.

## The change (surgical — one filter function in manageSpawns)

In `manageSpawns` (config.js), where live creeps are counted per role, add a
predictive filter. A creep counts as "alive" only if it will survive longer than
the time needed to spawn and deliver its replacement.

### New helper function (add near buildBody or other spawn helpers)
```js
// Predictive replacement lead time: how many ticks before death we must start
// spawning the replacement. spawnTime = 3 ticks per body part. Remote creeps
// (targetRoom/routeRoom set) need ~150 ticks to travel from spawn to their work
// room. Buffer of 50 covers spawn queue delays.
function getReplacementLeadTime(role, creepMemory, room) {
  const body = buildBody(role, room.energyCapacityAvailable);
  const spawnTime = body.length * 3;
  const isRemote = !!(creepMemory.targetRoom || creepMemory.routeRoom);
  const travelTime = isRemote ? 150 : 0;
  return spawnTime + travelTime + 50;
}
```

### Modified live-count filter
Find every place in manageSpawns where live creeps are counted for a role, e.g.:
```js
const liveCount = Object.values(Game.creeps).filter(c => c.memory.role === role).length;
```
Change to:
```js
const liveCount = Object.values(Game.creeps).filter(c => {
  if (c.memory.role !== role) return false;
  // Predictive: a creep about to die doesn't count — its replacement must
  // already be spawning. TTL undefined (just born) counts as alive.
  const ttl = c.ticksToLive;
  if (ttl === undefined) return true;
  return ttl > getReplacementLeadTime(role, c.memory, room);
}).length;
```

Apply this to ALL role counting in manageSpawns, including:
- The main role loop
- northBuilder counting (`liveNorth`)
- routeHauler counting (`liveRoute`)
- Any other `Object.values(Game.creeps).filter` that counts by role for spawn decisions

Do NOT change:
- The spawn priority order
- The target calculations
- The spawn gates (50-reserve, 400-reserve, etc.)
- The body building logic
- Anything outside manageSpawns

## Critical edge cases (must handle)
1. **ticksToLive undefined**: Count as alive (just spawned). Do NOT exclude.
2. **No double-spawning**: After spawning a replacement, the spawner does `return`
   (one spawn per tick). The new creep will be counted once alive. The dying creep
   is excluded, so the count stays at target — no spawn spam.
3. **Spawning in progress**: If the spawn is busy (`s.spawning`), the loop already
   skips. No change needed.
4. **Remote detection**: Use `creepMemory.targetRoom || creepMemory.routeRoom`.
   Home roles (no target/route room) get travelTime=0.

## Why 150 for remote travel
Conservative estimate for spawn (W9S58) to remote room (W9S57) including pathfinding.
If too high, replacements spawn slightly early (harmless brief overlap). If too low,
gaps persist. 150 is safe.

## Constraints
- Minimal diff. Only touch the counting logic and add the helper function.
- Do NOT refactor, rename, or restructure anything else.
- Do NOT commit, push, or deploy. Hoshi reviews and deploys.
- Branch is `main`.

## Verification
1. `node _validate_recovery.js` → must be 39 passed, 0 failed.
2. `node --check config.js` → no syntax errors.
3. Grep to confirm: all role-counting filters now use the predictive check, and
   no other spawn logic was modified.

## Output
Write `SCREEPS_FIX13_RESULT.md` with:
- The exact lines changed (before/after)
- Which counting sites were updated (list them)
- Validator result (39/39)
- Confirmation that spawn priorities, targets, gates, and bodies are untouched
