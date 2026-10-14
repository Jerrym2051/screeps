# Colony Audit — Codebase vs. `2026-07-25 0b Autonomous Screeps Colony`

Audited: `main.js`, `config.js`, `build.js`, `defense.js`, `cache.js`, `role.*.js`, `_deploy.js`, `package.json`.
Reference doc: `docs/prompts/2026-07-25 0b Autonomous Screeps Colony.md`.

Status legend: **DONE** / **PARTIAL** / **MISSING**. Each item lists the doc requirement, our current status, and the specific gap.

The two focus areas the task called out (creep-replacement lead time, and double-counting expiring creeps vs. queued replacements) are Section 6 below and are the most important findings.

---

## FOCUS 1 — Creep replacement lead time (doc §6)

Doc requirement, verbatim:
> Replacement lead time should account approximately for: body spawn duration, travel time to its primary work area, a small safety margin.

**Status: MISSING.** There is no lead-time computation anywhere in the codebase.

Gaps:
- **Spawn duration is never computed.** A body of N parts takes `N × 3` ticks per part (Screeps: 30 ticks per body part). The code computes `bodyCost(body)` (energy) but never converts body length into spawn ticks, and never reads `spawn.spawning.remaining` to know how long the current queue item will block the spawn.
- **Travel time is never estimated.** No code measures or estimates the ticks a creep needs to walk from the spawn to its source/controller/site. `role.harvester.js` even comments on a "90-tick source↔spawn round-trip" (line 122) but that number is prose, not used in any planning calculation.
- **No safety margin.** There is no margin term; nothing analogous to `emergencyTtlThreshold` from the doc's `ColonyConfig` example (§18) exists.
- **The only TTL constant is `HARVEST_REPLACE_TTL = 100`** (`config.js:487`). It is a fixed 100-tick window applied to harvesters only, and it is *not* derived from spawn duration + travel + margin. A 3-part emergency body spawns in ~90 ticks; a 6-part 2-WORK body in ~180 ticks. A fixed 100 under-leads large bodies and over-leads small ones.
- **`nearDeath` does not trigger a replacement.** `config.js:497` sets `nearDeath = roomHarvesters.some(c => c.ticksToLive < HARVEST_REPLACE_TTL)`. This flag is used *only* in the Conserve gate (`config.js:826`) to **suppress** spawning while banking energy — the opposite of proactively spawning a replacement. Proactive replacement therefore does not happen; the code waits for `functionalHarvesterCount === 0` (the crisis path, `config.js:525`) and only then spawns. That is exactly the behavior §6 warns against: "Do not wait until a critical worker disappears before requesting its replacement."

Concrete consequence: when a harvester is the sole income source and reaches TTL 0, the spawn is idle (no replacement was pre-queued), then spends ~90–180 ticks spawning, then ~tens of ticks walking to the source. The source goes unmined for the full lead time. The doc wants the replacement already walking (or in-queue) before the old one dies.

---

## FOCUS 2 — Double-counting expiring creeps vs. queued replacements (doc §6)

Doc requirement, verbatim:
> Avoid double-counting an old creep and its replacement as permanent excess capacity.

**Status: MISSING.** The planner has no concept of "a replacement is already queued/in-progress for this expiring creep," and no `replacing` linkage.

Gaps:
- **`counts` counts every live creep regardless of TTL** (`config.js:504-511`). A harvester with 1 tick of life and a harvester with 1400 ticks both contribute `+1` to `counts.harvester`. The `need = targets[role] - counts[role]` formula (`config.js:854`) therefore treats an about-to-die creep as full permanent capacity, so no replacement is queued until after it dies.
- **No in-transit accounting.** `manageSpawns` returns early whenever the spawn is busy (`config.js:477-483`). While busy it does not count the being-spawned creep toward any role's `counts`. So the instant a replacement finishes spawning it is counted, but there is no window where "old + queued replacement" are reconciled — meaning the planner can neither (a) hold off spawning a second replacement for the same dying creep, nor (b) trust that a queued body will arrive. There is no `replacing: string` field on creep memory (the doc's `CreepMemory` example in the Assignment model section explicitly lists `replacing?: string`).
- **Recycling paths don't decrement a target either.** The surplus/weak-creep recycles (`config.js:623`, `752`, `771`, `799`) kill a creep and `return`, but the freed slot is not marked as "replacement pending," so on the next tick the normal candidate loop may or may not fill it depending on energy — creating the spawn→recycle churn the summary notes were previously fixed for harvesters.

Net: the planner cannot currently express "I have 3 harvesters, but 1 dies in 40 ticks and its replacement is 90 ticks into a 180-tick spawn," which is precisely the double-count / under-count distinction §6 asks us to get right.

---

## Section-by-section audit of the rest of the doc

### §1 Initial startup
- **PARTIAL.** Auto-discovers owned rooms without a hardcoded name — `getOwnedRooms()` scans `Game.rooms` for `controller.my` (`config.js:25-33`). **DONE.**
- Detects controller/spawn/sources/sites/creeps via per-tick `room.find`. **DONE.**
- Initializes memory safely and idempotently (`main.js:85-96`, `build.js:490-492`). **DONE.**
- Does not erase unrelated memory. **DONE.**
- **MISSING: build-version logging.** The doc wants "logs the current build version once when the release changes." There is no version/SHA constant, no `Memory._release` comparison, no `[release abc12345] activated` log. `_deploy.js` pushes code but stamps no version into the runtime.

### §2 Basic worker behavior
- **PARTIAL.** Harvest→deliver transition is capacity-based in `role.harvester.js` (harvest while `freeCapacity > 0`, dump when full) and does not oscillate every tick. **DONE.**
- Energy acquisition prefers container/source. **DONE** for harvesters.
- **DEVIATION: builder & upgrader are storage-only** (`role.builder.js:52-57`, `role.upgrader.js:23-29`). Below RCL4 there is no storage, so an empty upgrader/builder idles with no fallback to container/spawn/harvest. The doc §2 wants workers to obtain energy from containers or by harvesting when no storage exists. This also undercuts §7 (continuous early-RCL upgrading).
- **Delivery priority ordering is only loosely followed.** Hauler deposit order is spawn/extensions (most-empty first) then storage (`role.hauler.js:13-48`). The doc's order is spawn → extensions → tower → critical construction → controller → repair. **MISSING: tower is not in the hauler's refill set** — `role.hauler.js:14` only matches `STRUCTURE_EXTENSION || STRUCTURE_SPAWN`, so a tower below reserve is never actively refilled by a hauler.

### §3 Workforce planning
- **PARTIAL.** Accounts for sources, energy capacity, existing creeps, construction demand, controller level, emergency state — all present in `_computeTargets` (`config.js:206-413`).
- **MISSING: "creeps near end of life" is not an input to the target.** §3 explicitly lists "creeps near end of life" as a factor to account for. `nearDeath` is computed but, as noted in FOCUS 1, only used to suppress spawning, never to raise a target or pre-queue a replacement.
- Baseline counts are role-specific heuristics (harvesters saturate sources, etc.), not the doc's "2–3 general workers" model — acceptable (doc says "conservative heuristics," not rigid), but note we use specialized roles, not general workers. See §"capability before specialization" below.

### §4 Body construction
- **DONE.** `[WORK, CARRY, MOVE]` bootstrap floor exists (`config.js:488 prodBody`, and harvester `else` branch `config.js:154`).
- **DONE.** Bodies scale up with energy (`buildBody`, `config.js:90-177`).
- **DONE.** Does not spawn immobile bodies for work roles (MOVE is paired with each WORK/CARRY).
- **PARTIAL: "do not wait indefinitely for max energy if no viable worker exists."** The crisis path handles the zero-harvester case, but the normal candidate loop can still skip a role when `bodyCost > energyAvailable - 50` (`config.js:886`) with no viable-worker fallback for non-harvester roles.

### §5 Emergency recovery
- **PARTIAL.** Activates when functional harvesters == 0 (`config.js:525 needRescue`), spawns a bootstrap `[W,C,M]`, directs it to harvest + refill the bank, and recycles victims to fund it (`config.js:530-549`). Core loop **DONE.**
- **MISSING: emergency is harvester-only.** The doc trigger is "no viable worker can harvest and deliver energy." There is no equivalent rescue for total hauler loss, builder loss, etc. A room with harvesters but zero haulers has no emergency path.
- **MISSING: emergency mode does not suppress nonessential spawning/planning.** `build.buildPlan` and the tower/visual/telemetry passes keep running every tick/5-tick regardless of `needRescue`. The doc wants "suppress expensive planning and unnecessary visuals if CPU is constrained."
- **PARTIAL: recovery transition.** `Memory._crisisHarvester` is cleared when a functional harvester exists (`config.js:498, 590`), but there is no explicit "emergency mode cleared" log or a persisted emergency-state flag on the room (the doc §15 lists "emergency state" as durable memory).

### §7 Controller upgrading
- **PARTIAL.** Upgraders are targeted (`config.js:284`) and the harvester/builder dump into the bank that funds them.
- **MISSING: no downgrade-risk detection.** The doc wants "when downgrade risk becomes elevated: increase controller-upgrade priority, deprioritize noncritical construction/repair." The code never reads `controller.ticksToDowngrade`. "Anti-downgrade" appears only in comments (`config.js:263, 820`); the actual rule is a static "keep ≥1 upgrader once a container exists," not a response to measured downgrade risk.
- **BUG-ADJACENT: the upgrader priority boost is inverted.** `config.js:857` adds `+50` to the upgrader's priority number when `controller.level < 2`. Since priority `0 = highest`, `+50` makes the upgrader spawn *later*, i.e. it is *deprioritized* at the lowest levels — the opposite of "upgrader gets a boost when controller level is low" stated in the adjacent comment (`config.js:856`).
- **BLOCKER from §2:** because upgraders are storage-only, at RCL1–3 they idle when empty, so "continuous progress through early RCL levels" (§7 expected result) is not actually achieved by the upgrader role.

### §8 Construction planning
- **DONE (strong).** Terrain-aware (`build.js:93-94, 131-132, 182-183`), avoids duplicate sites (`makeSite` checks `LOOK_STRUCTURES`/`LOOK_CONSTRUCTION_SITES`, `build.js:21`), respects per-RCL limits (extensions `= level*5`, `build.js:160`), RCL-gated placement (extensions ≥2, tower ≥3, storage ≥4, links ≥5, extractor ≥6), incremental/low-cadence (buildPlan throttled to every 5 ticks, `main.js:164`).
- **DONE: avoids blocking spawn/sources.** `SPAWN_CLEAR_RADIUS` (`build.js:4,12-16`); source containers spiral outward from the source.
- **MISSING: does not avoid room exits.** `placeRoads` deliberately routes a road *to* the north exit (`build.js:313-316`, pinning tile `18,1`). The doc §8 says construction must "avoid exits." (This is intentional for expansion, but it is a divergence from the doc's rule and worth an explicit carve-out.)
- **MISSING: does not avoid blocking the controller.** No controller-clear check exists in `makeSite`/placement; only the spawn has a clear radius.
- **NOTE: out-of-scope structures.** Observer (§"do not implement ... observer logic"), links, extractor, and multi-room expansion are all implemented, which the doc explicitly places outside the RCL1→early-RCL4 scope. Not a defect, but the code is further along the doc's "leave clean seams" line than the doc's "do not implement now."

### §9 Building priorities
- **PARTIAL.** Builder targets source containers first, then extensions, then other sites, then upgrades when idle (`role.builder.js:14-40, 67-75`). Extensions are prioritized over bank-buffer containers/roads (`build.js:37-39`). 
- **MISSING: no explicit tower-over-road / spawn-replacement precedence.** The doc's order (spawn replacement → tower → extensions → containers → storage → roads) is not encoded as a single priority function; it emerges from `buildPlan` call order (`build.js:494-502`) plus the builder's ad-hoc site selection. There is no "spawn replacement" build path at all.

### §10 Repairs
- **PARTIAL.** `role.repairer.js` repairs ramparts/walls/towers/roads/containers below 90% hits (`role.repairer.js:31-39`).
- **MISSING: critical-structure-first ordering.** The doc wants critically-damaged spawn/extensions/tower/containers prioritized; the repairer sorts purely by lowest absolute `hits` (`role.repairer.js:37`), so a nearly-destroyed road can outrank a lightly-damaged tower.
- **MISSING: wall/rampart bounding.** The doc says "Do not attempt to maximize wall or rampart hit points" and "Do not repair walls or ramparts beyond a low starter threshold." The repairer drives walls/ramparts toward `hitsMax * 0.9` with no cap threshold.

### §11 Tower behavior
- **PARTIAL.** Priority attack → heal → repair is implemented (`defense.js:70-79`).
- **MISSING: energy reserve threshold.** The doc wants repair only "when tower energy is above a reserve threshold." `defense.js:69` skips the tower entirely below `10` energy — a bare "can it fire once" guard, not a defensive reserve. Repairs run whenever any structure is damaged, draining the tower.
- **MISSING: prefer important infrastructure repairs.** `defense.js:76-79` repairs the most-damaged `FIND_MY_STRUCTURES` of any type (including roads/ramparts), not critical infrastructure first.

### §12 Dead creep memory cleanup
- **DONE.** `main.js:56-58` deletes `Memory.creeps[name]` for every name not in `Game.creeps`, each tick. Bounded, correct.
- **PARTIAL: cadence.** Runs every tick (fine for correctness), but the doc suggests "at an appropriate cadence" — a per-tick full sweep is acceptable but not throttled.

### §13 CPU-aware behavior
- **PARTIAL.** There is a manual opt-in profiler (`Memory._prof`, `main.js:51-53, 220-232`) and some throttles (status 50t, buildPlan 5t, expansion 25t, road caches). `cache.js` memoizes `room.find` per tick.
- **MISSING: no automatic CPU-budget degradation.** Nothing reads `Game.cpu.tickLimit` / `Game.cpu.bucket` to skip lower-priority subsystems under pressure. The doc lists tower/emergency/harvesting/upgrade as must-preserve and planning/repair/visuals/telemetry as droppable — that tiering does not exist.
- **MISSING: per-subsystem CPU telemetry by default** (the profiler is off unless `Memory._prof=1`).

### §14 Tick-local room snapshot
- **PARTIAL.** `cache.js` is a tick-scoped `room.find` memo, and `getTargets` memoizes per `(room, tick)` (`config.js:195-204`).
- **MISSING: a single shared ColonySnapshot.** There is no one object per tick holding creeps/spawns/sources/controller/energy/sites/damaged/hostiles/available-energy/capacity/RCL that all planners read. Instead `_computeTargets` and `manageSpawns` each re-`room.find` (e.g. containers are scanned in `_computeTargets` `config.js:215` AND again in `manageSpawns` `config.js:515` AND again for `cE` `config.js:797`). Individual creeps still call broad `room.find` themselves (e.g. `role.harvester.js:125,134`, `role.builder.js:30`).
- **MISSING: testability.** Because there is no snapshot object, tests cannot inject a simplified colony state without mocking `Game`/`room.find` globally.

### §15 Memory strategy
- **PARTIAL.** Persists durable-ish state (source assignments in `Memory.rooms[].sources`, room stage/priority, `claimedAt`, `recycle` flags, `targetRoom`, `sourceId`). Does not persist live objects — uses IDs/coords/room names. Good.
- **MISSING: schema version.** No `Memory._schema` / version field anywhere.
- **MISSING: migrations.** No migration module; the doc explicitly requires "Add migrations for schema changes" and a tested idempotent migration.
- **MISSING: no persisted workforce-planning state or emergency state.** Targets are recomputed each tick (fine), but there is no `Memory.rooms[r].workforce`/`emergency` record the doc lists as reasonable persistent state.
- **PARTIAL: unbounded memory risk.** Several `Memory._*` debug/telemetry arrays exist (`Memory._profResult` capped at 30 — good; `Memory.rooms[r]._roadLocked` grows monotonically, `build.js:336-346` — bounded by room tiles, acceptable). No grossly unbounded logs in Memory by default.

### §16 In-game observability
- **PARTIAL.** Console telemetry exists and is fairly rich (`reportStatus`, `config.js:415-471`).
- **MISSING: RoomVisual.** No `new RoomVisual(...)` anywhere — the doc's compact on-room panel (RCL / Mode / Energy / Workers actual-vs-desired / assignments / sites / CPU / release) is entirely absent.
- **MISSING: state-change logging discipline.** The doc says "Log on significant state changes, not every tick." Current code logs every tick during normal operation: `[CRISIS]` (`config.js:527`) fires unconditionally each spawn call, `[MANAGE]` candidates/trying/buildBody lines (`config.js:862,866,884`) fire on every non-busy spawn tick, and `[CLAIM_DEBUG]`/`[CLAIM3]` fire per-claimer-tick. This is the "one line per creep per tick" noise the doc warns against.
- **MISSING: release shown in logs/visual** (ties to §1 version gap).

### §17 Manual inspection commands
- **MISSING.** No `global.ai = { status, setVisuals, forceReplan }`. The doc's read-only console API is not implemented. (`monitor.js`/`logstream.js` are external Node tooling, not the in-game `global.ai` surface.)

### §18 Configuration
- **MISSING: typed config with named defaults.** There is no `ColonyConfig` object. The doc's named knobs (`visualsEnabled`, `statusLogInterval`, `emergencyTtlThreshold`, `towerEnergyReserve`, `repairThreshold`, `controllerEmergencyThreshold`, `planningCadence`) are either absent or hardcoded magic numbers scattered across files: `HARVEST_REPLACE_TTL=100` (`config.js:487`), tower reserve `10` (`defense.js:69`), repair `0.9` (`role.repairer.js:34`), energy gates `500/400/350/300/290/210/260` (`config.js:876,799,752,771,887,827,828`), claimer gate `700` (`config.js:840`), cadences `50/25/5` (`config.js:419`, `main.js:182,164`).

---

## Cross-cutting model gaps

### Capability before specialization (doc "Design principle")
- **DEVIATION (intentional).** The doc's first iteration favors a small set of flexible `worker`/`emergency-worker` roles with a `WorkType` assignment (`harvest|deliver|build|upgrade|repair`) and a `mode: acquire|work` field. Our code is fully specialized into 10 roles (`config.js:2`) with per-role files and per-role energy logic. This is a legitimate later-stage architecture, but it means the doc's "assignment model" is only partly realized:
  - **Source assignment: DONE** — `memory.sourceId` is set and honored (`config.js:578-581, 891-898`, `role.harvester.js:137-139`).
  - **Work assignment / `mode`: MISSING** — there is no `memory.assignment`/`memory.mode`; state is implicit in store-fullness per role.
  - **`replacing` linkage: MISSING** (see FOCUS 2).
  - **Assignment invalidation: PARTIAL** — targets are re-picked per tick (implicitly invalidated), but there is no explicit invalidation on "target full / completed / no longer needs repair" beyond the inline checks in each role.

### Decision priorities (doc "Decision priorities")
- **PARTIAL.** Colony-level spawn ordering is expressed via `ROLE_PRIORITY` (`config.js:4-17`) + `need` sort (`config.js:861`), which approximates "recover harvest → logistics → build → upgrade." But it is not the doc's situation-driven list (defend → recover → harvest → refill → prevent-downgrade → build → upgrade → repair), and there is no explicit priority function for hostile-defense-first or downgrade-prevention-first. Worker-level delivery priority is embedded in each role's control flow rather than a shared, testable ordered policy.

### Testing requirements (doc "Testing requirements" + "Definition of done")
- **MISSING (largest overall gap).** `package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`. There is no test framework, no `test/` directory, no typecheck/lint config. The doc requires TDD with unit tests for workforce planning, body building, worker state, emergency recovery, construction, priorities, runtime safety, and memory, plus five integration scenarios (A–E). None exist.
  - The one exception: `_validate_recovery.js` is a hand-rolled host-side assertion harness (not a real framework, not wired to `npm test`) covering the crisis-recovery path. It partially exercises Scenario-B-style logic but is not the doc's required suite.
  - **Scenario E (expiring critical worker)** — the exact §6 focus — has no test and, as shown in FOCUS 1/2, no implemented behavior to test.

### Performance expectations (doc "Performance expectations")
- **PARTIAL.** `cache.js` + `getTargets` memoization + throttled buildPlan/expansion/status reduce repeated scans. Path reuse (`reusePath`) is used broadly. But: no per-tick shared snapshot (§14), and several roles still call `room.find`/`findClosestByPath` per creep per tick. No unbounded Memory arrays found.

### Deployment safety (doc "Deployment safety")
- **PARTIAL.** `_deploy.js` fetches existing deployed modules and overlays local ones (preserves foreign modules), and runs a content guard (u5 check) before pushing — good defensive behavior. But it deploys straight to the `default` branch with no test/typecheck/lint/build gate (there is nothing to run) and no release-version stamp. The doc says "Do not deploy automatically unless ... all required conditions are met" and "Run all tests / typecheck / lint / production build" — none are automated.

### Architecture (doc "Architectural direction" / "Recommended structure")
- **DEVIATION (acceptable, flagging for completeness).** We use a flat JS module layout (`config.js`, `main.js`, `build.js`, `defense.js`, `cache.js`, `role.*.js`) rather than the `src/colony|workforce|creeps|construction|structures|memory|visualization` TS tree with `ColonyController`/`ColonySnapshot`/`WorkforcePlanner`/`SpawnManager` boundaries. The conceptual boundaries exist only loosely: `getTargets`≈WorkforcePlanner, `manageSpawns`≈SpawnManager, `main.js` loop≈CreepExecutor/StructureRunner. No `ColonySnapshot`, no `ColonyState`, no `ColonyTelemetry` module, no `visualization/`.

---

## Prioritized gap summary (what to build first, for review only — nothing deployed)

1. **§6 creep-replacement lead time** (FOCUS 1) — compute `leadTime = bodyLength×30 + travelEstimate + margin`; pre-queue a replacement when `creep.ticksToLive <= leadTime`. Highest gameplay impact (kills the source-dark window).
2. **§6 double-count / in-transit accounting** (FOCUS 2) — treat a queued/being-spawned replacement as satisfying the expiring creep's slot (add `memory.replacing`, exclude near-death creeps from permanent `counts` for the role they hold).
3. **§2/§7 storage-only drain roles idle at RCL1–3** — give upgrader/builder a container/harvest fallback so early-RCL upgrading is continuous (currently blocked by the storage-only change).
4. **§7 downgrade-risk detection** — read `controller.ticksToDowngrade`; fix the inverted `+50` upgrader boost (`config.js:857`).
5. **§11 tower energy reserve + important-infrastructure-first repair** — raise the reserve threshold and filter repair targets to critical structures.
6. **§10 repair bounding + critical-first ordering** — cap wall/rampart targets; sort by criticality, not raw hits.
7. **§5 broaden emergency beyond harvesters** (haulers/builders) and suppress planning/visuals/telemetry during emergency.
8. **§14 single tick-local snapshot object** shared by all planners (extend `cache.js` into a real snapshot; remove the triple container scans).
9. **§15/§16/§17/§18 foundational**: memory schema version + migrations, `RoomVisual` panel, `global.ai` console API, and a typed `ColonyConfig` replacing the scattered magic numbers.
10. **§16 logging discipline** — convert per-tick `[CRISIS]`/`[MANAGE]`/`[CLAIM*]` logs to state-change-only.
11. **Testing** — stand up a framework + the doc's required unit/integration suites (especially Scenario E), and gate `_deploy.js` on them.
12. **§1 release version stamping** — inject a SHA/version at deploy and log it once per release change.
