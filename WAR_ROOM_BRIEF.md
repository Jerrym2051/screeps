# Screeps War Room — Build Brief

## What
A live web dashboard for Jerry's Screeps colony, served from the big Pi. He opens
it in a browser (laptop or phone) via Tailscale. Think mission control for the colony.

## Project location
`/home/jma/projects/screeps-war-room/` (new directory, separate from the game code
in `/home/jma/screeps/screeps/`).

## Tech
- Node.js server (Express is fine, or native http — your call)
- Polls the Screeps API every 15 seconds using the existing `screeps-api` npm
  package (already installed at `/home/jma/screeps/screeps/node_modules/screeps-api`).
  Auth: `ScreepsAPI.fromConfig('main', 'agent-manual-deploy')`, shard2.
- Stores time-series history in a local JSON file (or SQLite if you prefer) —
  the longer it runs, the better the graphs get. Keep at least 7 days of 15s samples.
- Single-page frontend. Vanilla JS + a lightweight chart library (or canvas —
  your call, but it should look good, dark theme, sleek).
- Listen on all interfaces (0.0.0.0) on port 8090 so it's reachable via Tailscale
  at `100.87.114.19:8090`.
- Must survive restarts: write a simple start script and document how to run it.
  (systemd setup is a nice-to-have, not required for v1.)

## Dashboard sections (build all of these)

### 1. Header status bar
- Current game tick, tick rate
- Controller: level, progress to next level, ticks to downgrade
- GCL (global control level) progress
- Bank: energyAvailable / energyCapacityAvailable
- Storage: energy stored

### 2. Energy graphs (the money charts)
- Bank energy over time (line chart, with 1h / 6h / 24h / 7d range selectors)
- Storage energy over time (same ranges)
- Estimated income in energy/tick (computed from bank delta)

### 3. Creep roster
- Live count per role vs target (e.g., harvester 8/1, upgrader 0/1, builder 1/2)
- Pull targets from `Memory` diagnostics (`_diag`) or compute from game state
- Highlight roles that are below target in red/amber

### 4. Spawn status
- What's currently spawning (creep name, role, time remaining)
- Spawn energy / capacity
- Whether the spawn is idle (alert if idle with unmet targets)

### 5. Room cards
- **W9S58 (home):** bank, storage, spawn energy, extensions filled/total,
  tower energy, controller progress
- **W9S57 (expansion):** reservation status, controller level, source containers
  (hits / max hits), construction sites remaining (by type), creeps present,
  energy in containers

### 6. Alerts
Compute and display active alerts:
- Bank dropping fast (negative trend over last 30 min)
- Controller within 5000 ticks of downgrade
- Hostiles detected in any room
- Spawn idle with unmet creep targets
- Any container below 60000 hits (about to decay)
- Storage below 50000 (the FIX11/FIX12 gate threshold)

### 7. Event feed
Recent notable events with timestamps (detect by polling and diffing):
- Creep spawned (role)
- RCL up / controller progress milestones
- Invader/hostile detected or cleared
- Construction site completed
- Container built

### 8. Room map (eye candy)
- A grid visualization of W9S58 (50x50) showing:
  - Structures (spawn, extensions, storage, towers, containers) as colored squares
  - Creeps as dots, colored by role, at their live positions
- Updates with each poll. Doesn't need to be pixel-perfect — a clean schematic is fine.

### 9. Energy flow
- Simple diagram: Sources → Containers → Storage → Spawn/Extensions
- Show current energy in each stage

### 10. Colony health score
- One number (0-100) summarizing: bank trend, creep target coverage,
  downgrade timer, active alerts
- Document the formula in a comment so Jerry can tweak it

## Design
- Dark theme, sleek and stealthy (Jerry's aesthetic — nothing bright)
- Mobile-responsive (he'll check on his phone)
- Auto-refresh every 15 seconds without full page reload
- No auth needed (Tailscale network is the access control)

## Constraints
- Do NOT touch `/home/jma/screeps/screeps/` (the game code). Read-only access
  to the Screeps API.
- Do NOT commit or push anything.
- Poll respectfully: 15-second intervals, not faster.

## Verification
1. Server starts without errors: `node server.js` (or whatever the entry point is)
2. Dashboard loads in a browser and shows live data (test with curl if no browser)
3. History file is created and grows with each poll
4. All 10 sections render (even if some show "no data yet" on first run)

## Output
Write `WAR_ROOM_README.md` in the project root with:
- What was built (features, tech choices)
- How to start the server
- The URL to open (http://100.87.114.19:8090)
- What's stubbed or "no data yet" vs fully working
