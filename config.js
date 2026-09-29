// config.js - body builder, population targets, spawn planner, multi-room manager
const ROLES = ['harvester','upgrader','claimer','defender','repairer','hauler','builder','attacker','looter','miner'];
// Threat-model priority: 0 = highest, 100 = lowest. Lower = spawn first.
const ROLE_PRIORITY = {
  harvester:  0,  // energy foundation — always first
  hauler:     4,  // logistics — must establish BEFORE builder/upgrader drain the
                  // bank during the container cold-start (upgrader/builder pull from
                  // the spawn, so a late hauler starves and the bank can't recover)
  builder:    5,  // container/income unlock — must beat the upgrader pre-RCL3
  upgrader:   6,  // permanent RCL/GCL climb (1 held for the downgrade timer)
  claimer:   10,  // claim new rooms
  defender:  15,  // room defense
  repairer:  20,  // ramparts/walls/roads
  attacker:  40,  // offense
  looter:    50,  // pickup drops
  miner:     60,  // RCL 6+ minerals
};
const allies = [];

function spawn(room) { return room.find(FIND_MY_SPAWNS)[0]; }

function getOwnedRooms() {
  const rooms = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) { rooms.push(room); }
  }
  rooms.sort((a, b) => getRoomPriority(a.name) - getRoomPriority(b.name));
  return rooms;
}

function getHomeRoom() {
  const spawns = _.filter(Game.structures, s => s.structureType === STRUCTURE_SPAWN && s.my);
  if (spawns.length) return spawns[0].room;
  if (Memory.rooms) {
    for (const name in Memory.rooms) {
      if (Memory.rooms[name].stage === 'home') return Game.rooms[name];
    }
  }
  return Object.values(Game.rooms)[0] || null;
}

function getRoomStage(room) {
  const name = room.name;
  const mem = Memory.rooms?.[name];
  const hasSpawn = room.find(FIND_MY_SPAWNS).length > 0;
  const c = room.controller;
  if (!c) return 'unknown';
  if (c.my) {
    if (hasSpawn) return 'home';
    return 'expansion';
  }
  if (mem && mem.stage === 'home') return 'home';
  if (mem && mem.stage === 'expansion') return 'expansion';
  return 'outpost';
}

function getRoomPriority(roomName) {
  const mem = Memory.rooms?.[roomName];
  if (mem && mem.priority !== undefined) return mem.priority;
  const homeRoom = getHomeRoom();
  if (homeRoom && homeRoom.name === roomName) return 0;
  if (homeRoom) {
    const rm = roomName.match(/^([WE])(\d+)([NS])(\d+)$/);
    const hm = homeRoom.name.match(/^([WE])(\d+)([NS])(\d+)$/);
    if (rm && hm) {
      return Math.abs(parseInt(rm[2]) - parseInt(hm[2])) + Math.abs(parseInt(rm[4]) - parseInt(hm[4]));
    }
  }
  return 999;
}

function buildBody(role, budget) {
  budget = Math.max(0, budget - 10);
  if (budget <= 0) return [];
  const b = [];
  if (role === 'claimer') {
    if (budget >= 350) { b.push(CLAIM, MOVE); }
    return b;
  }
  if (role === 'defender') {
    if (budget < 200) return [];
    if (budget >= 250) { b.push(TOUGH, MOVE, RANGED_ATTACK, HEAL); budget -= 250; }
    else if (budget >= 200) { b.push(TOUGH, MOVE, ATTACK); budget -= 200; }
    while (budget >= 50) { b.push(MOVE); budget -= 50; }
    return b;
  }
  if (role === 'repairer') {
    if (budget < 200) return [];
    while (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
    return b;
  }
  // attacker: ranged combat body - tough for survivability, ranged attack + heal
  if (role === 'attacker') {
    if (budget < 300) return [];
    while (budget >= 300) { b.push(TOUGH, RANGED_ATTACK, MOVE, HEAL); budget -= 300; }
    if (budget >= 150) { b.push(TOUGH, RANGED_ATTACK, MOVE); budget -= 150; }
    if (budget >= 100) { b.push(TOUGH, MOVE); budget -= 100; }
    return b;
  }
  // upgrader: big CARRY to maximize energy per trip, fewer trips back to spawn
  if (role === 'upgrader') {
    if (budget < 250) return [];
    while (budget >= 250) { b.push(WORK, CARRY, CARRY, MOVE); budget -= 250; }
    if (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
    return b;
  }
  // harvester: WORK-priority. A single 1-WORK/1-CARRY body only nets ~1.25/tick
  // after travel — barely enough for one upgrader, so a builder (or any creep
  // death) tips the room into an energy crash + slim-down thrash. 2 WORK harvests
  // ~4/tick; with CARRY for a delivery buffer ONE harvester sustains upgrader +
  // builder. Keep the 1-WORK/1-CARRY body only as the low-energy emergency floor.
  if (role === 'harvester') {
    if (budget < 200) return [];
    if (budget >= 340) { b.push(WORK, WORK, CARRY, CARRY, MOVE); budget -= 350; } // 2W2C (energy 350)
    else if (budget >= 290) { b.push(WORK, WORK, CARRY, MOVE); budget -= 300; }   // 2W1C (energy 300)
    else { b.push(WORK, CARRY, MOVE); budget -= 200; }                            // 1W1C emergency floor
    while (budget >= 150) { b.push(WORK, CARRY); budget -= 150; }                 // scale up with room
    return b;
  }
  // Haulers are pure logistics (carry+move, no WORK) — using the generic isWork path
  // required budget>=200, so at a starved bank (<200) buildBody returned [] and no
  // hauler ever spawned, leaving the source containers full and harvesters overflowing.
  // A [CARRY,MOVE] pair spawns at bank 100 and scales to carry 250 at 500+.
  const isWork = ['builder','miner'].includes(role);
  if (isWork) {
    if (budget < 200) return [];
    while (budget >= 200) { b.push(WORK, CARRY, MOVE); budget -= 200; }
    if (budget >= 100) { b.push(CARRY, MOVE); }
  } else {
    while (budget >= 100) { b.push(CARRY, MOVE); budget -= 100; }
  }
  return b;
}

function countRemoteSources(room) {
  const m = room.name.match(/^([WE])(\d+)([NS])(\d+)$/);
  if (!m) return 0;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  let count = 0;
  for (const [dx, dy] of dirs) {
    const neighborName = m[1] + (parseInt(m[2]) + dx) + m[3] + (parseInt(m[4]) + dy);
    const neighbor = Game.rooms[neighborName];
    if (!neighbor || !neighbor.controller || !neighbor.controller.my) continue;
    // Skip if neighbor has hostiles
    if (defense.getHostiles(neighbor).length > 0) continue;
    count += neighbor.find(FIND_SOURCES).length;
  }
  return count;
}

function getTargets(room) {
  const sources = room.find(FIND_SOURCES);
  const controller = room.controller;
  const sites = room.find(FIND_CONSTRUCTION_SITES).length;
  const drops = room.find(FIND_DROPPED_RESOURCES).length;
  // Containers our creeps can actually use = ours OR neutral/ownerless (in this
  // server transfers to ownerless containers work, and we built the ones here).
  // Using FIND_MY_STRUCTURES missed them, so `filled` stayed 0 and hauler+upgrader
  // were gated off forever even though a container held 2000 energy.
  const containers = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) });
  const filled = containers.filter(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0).length;
  const stage = getRoomStage(room);

  let hostiles = room.find(FIND_HOSTILE_CREEPS);
  const m = room.name.match(/^([WE])(\d+)([NS])(\d+)$/);
  if (m) {
    const [, wS, wN, nS, nN] = m;
    const w = parseInt(wN), n = parseInt(nN);
    const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dx, dy] of dirs) {
      const nm = wS+(w+dx)+nS+(n+dy);
      const r = Game.rooms[nm];
      if (r) hostiles = hostiles.concat(r.find(FIND_HOSTILE_CREEPS));
    }
  }
  const hostilesCount = hostiles.length;
  const hasFort = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART }).length > 0;

  const targets = {};
  // Each source has 3000 energy, refills every 300 ticks = 10 energy/tick
  const ENERGY_PER_TICK = 3000 / 300; // 10 energy/tick per source
  if (stage === 'home') {
    // Use energyCapacityAvailable (grows with extensions) not energyAvailable (current stock)
    const budget = Math.max(room.energyAvailable, room.energyCapacityAvailable);
    // Count remote sources from adjacent rooms for multi-room harvesting
    const remoteSources = countRemoteSources(room);
    const totalSources = sources.length + Math.min(remoteSources, 4);
    // SATURATE each source: it regens ~10/tick and each WORK harvests ~2/tick, so
    // ~5 WORK fully mines it; +1 for travel overhead so the source is always being
    // harvested. Budget limits body SIZE, NOT the harvester COUNT — the old code
    // capped the count by affordability (floor(budget/bodyCost)=1), starving the
    // source to a single weak harvester -> ~2/tick income -> the collapse cycle.
    // 1 source regens ~10/tick and each WORK mines ~2/tick, so ~5 WORK fully mines
    // it. With 2-WORK bodies that's ~2-3 harvesters; +1 for travel. The old +3/max(4)
    // over-provisioned to 6 harvesters on a single source -> 6x300 spawn churn that
    // ate the bank the upgrader needs. Cap tighter so surplus energy funds RCL3.
    const WORK_TO_SATURATE = 5;
    const workPerBody = Math.max(1, buildBody('harvester', budget).filter(p => p === WORK).length);
    const harvestersPerSource = Math.min(5, Math.max(3, Math.ceil(WORK_TO_SATURATE / workPerBody) + 1));
    targets.harvester = totalSources * harvestersPerSource
      + Math.max(0, containers.length - filled);
    // Upgraders must run to hold the controller against its downgrade timer (~8k
    // ticks) and push RCL. Scaled by surplus so they only take energy the
    // harvester+builder foundation isn't using: 1 always (anti-downgrade), +1 at
    // >=400 bank, +1 at >=500. The harvesters now dump into the 550 pool, so the
    // bank can fund them. Builder (container/income) is priority 5 — above the
    // upgrader — so the income unlock completes before the upgrader drains the
    // bank. One builder pre-container (minimal drain), two once the source
    // container is filled (hauler unlock imminent). Upgrader is withheld until
    // the container is built: a 1-WORK upgrader drains ~1/tick against only
    // ~1.6/tick carry-trip income, which collapses the pre-container bank and
    // starves the builder mid-build. Once the container exists the harvesters
    // dump at the source and income jumps, so the upgrader is affordable again.
    const haveContainer = filled > 0;
    // Updaters: 5 at RCL2 (rush RCL3 — the bank is capped at 550 and harvesters
    // overflow into containers, so the surplus income is best spent on the
    // controller), 2 at RCL3+ (where expansion/defence competes for energy). The
    // old bank-gated formula churned (3 at 550 -> 1 at 300) and culled upgraders.
    targets.upgrader = haveContainer ? (controller && controller.level < 3 ? 5 : 2) : 0;
    targets.builder = 2; // keep two builders on the source container pre-unlock (income pool can fund a
                       // 2-WORK + 1-WORK pair = 3 build/tick against the 5000-progress site); the
                       // pre-container builder-upgrade recycles <2-WORK builders for 2-WORK ones.
    // Haulers are sized to the energy flowing INTO the containers (the harvest rate),
    // not to the energy flowing OUT (consumer drain) — otherwise a momentarily-full
    // source container spawns a stack of haulers that idle once it drains, OR too few
    // haulers are built and the containers stay full while harvesters overflow into
    // dropped energy. Harvest = ~2 energy/WORK/tick, and one hauler (c.50 carry,
    // ~10-tick round trip) lifts ~5/tick, so one hauler per ~5 WORK-harvest.
    const harvesterWork = (Object.values(Game.creeps).filter(cr => cr.room && cr.room.name === room.name).reduce((n, cr) => n + (cr.memory.role === 'harvester' ? cr.body.filter(p => p === WORK).length : 0), 0));
    // Floor of 2: one source (~10/tick) needs 2 haulers to drain it even with small
    // bodies; cap 3. Sized by live harvester WORK so it scales up as bodies grow.
    targets.hauler = filled > 0 ? Math.min(3, Math.max(2, Math.ceil(harvesterWork * 2 / 5))) : 0;
    targets.claimer = (controller && !controller.my) ? 1 : 0;
    // Reclaim dropped energy: once a container exists (free bank boost), OR while
    // pre-container if harvesters are overflowing (pool swings) and a big pile is
    // decaying — recycling that waste beats letting it rot. Gate on pile size so a
    // lone 10-unit drop doesn't pull a creep off productive work. Scale the worker
    // count with the pile so a big spill (e.g. energy a removed construction site
    // released from a withheld builder) is reclaimed before it stalls the economy.
    const droppedAmt = room.find(FIND_DROPPED_RESOURCES).reduce((n, r) => n + r.amount, 0);
    targets.looter = ((filled > 0 || droppedAmt >= 200) && droppedAmt > 0)
      ? Math.min(3, Math.ceil(droppedAmt / 500)) : 0;
    const minerals = room.find(FIND_MINERALS);
    targets.miner = 0;
    if (minerals.length) {
      const hasExt = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTRACTOR }).length > 0;
      if (hasExt) targets.miner = 1;
    }
    targets.defender = hostilesCount ? Math.min(hostilesCount, 5) : (room.controller && room.controller.level >= 4 ? 1 : 0);
    targets.attacker = hostilesCount ? Math.min(Math.ceil(hostilesCount / 2), 3) : 0;
    // Repairers only after the container+hauler loop is live (a no-WORK repairer
    // pre-container just drains the spawn's pull; repair the existing rampart later).
    targets.repairer = (filled > 0 && hasFort) ? 1 : 0;
  } else if (stage === 'outpost') {
    const budget = Math.max(room.energyAvailable, room.energyCapacityAvailable);
    const maxAffordable = Math.max(1, Math.floor(budget / 250));
    targets.harvester = Math.min(sources.length * Math.ceil(ENERGY_PER_TICK / (1 * 0.9) * 2), maxAffordable)
      + Math.max(0, containers.length - filled);
    targets.upgrader = 0;
    targets.builder = 2;
    targets.hauler = filled > 0 ? Math.ceil(filled / 2) : 0;
    targets.claimer = (controller && !controller.my) ? 1 : 0;
    targets.looter = 0;
    targets.defender = hostilesCount ? Math.min(hostilesCount, 3) : 1;
    targets.attacker = hostilesCount ? Math.min(Math.ceil(hostilesCount / 2), 2) : 0;
    targets.miner = 0;
    targets.repairer = 0;
  } else if (stage === 'expansion') {
    const budget = Math.max(room.energyAvailable, room.energyCapacityAvailable);
    const maxAffordable = Math.max(1, Math.floor(budget / 250));
    targets.harvester = Math.min(sources.length * Math.ceil(ENERGY_PER_TICK / (1 * 0.9) * 2), maxAffordable)
      + Math.max(0, containers.length - filled);
    targets.upgrader = 1;
    targets.builder = 2;
    targets.hauler = filled > 0 ? Math.ceil(filled / 2) : 0;
    targets.claimer = (controller && !controller.my) ? 1 : 0;
    targets.looter = 0;
    targets.miner = 0;
    targets.defender = hostilesCount ? Math.min(hostilesCount, 4) : 1;
    targets.attacker = hostilesCount ? Math.min(Math.ceil(hostilesCount / 2), 2) : 0;
    targets.repairer = hasFort ? 1 : 0;
  } else {
    targets.harvester = sources.length * 2;
    targets.upgrader = 1;
    targets.builder = 2;
    targets.hauler = filled > 0 ? Math.ceil(filled / 2) : 0;
    targets.claimer = 0;
    targets.looter = 0;
    targets.miner = 0;
    targets.defender = 1;
    targets.attacker = 0;
    targets.repairer = 0;
  }
  // Haulers only MOVE energy (never consume it), so enable them as soon as a source
  // container is filled (the filled>0 rule above) — even at RCL<3. This is the
  // efficient "store the harvest in a container, haul it to the spawn" path that
  // delivers the source's full ~10/tick with far fewer carry-trips than harvesters
  // alone (a lone harvester moves only ~1/tick once travel is counted). Builders stay
  // affordable and spawn priority (harvester=0) still fills harvesters first — no collapse.
  // Cap upgraders at 3 — they don't scale with room size
  targets.upgrader = Math.min(targets.upgrader || 0, 3);
  return targets;
}

function reportStatus(room) {
  // Throttled to once per 50 ticks: surfaces the main bottlenecks so the log
  // stream shows exactly what the room is starved on (energy, role deficits,
  // dropped resources, construction backlog, CPU, spawn backlog).
  if (Memory._statusTick && Game.time - Memory._statusTick < 50) return;
  Memory._statusTick = Game.time;
  const counts = {};
  const roomCreeps = Object.values(Game.creeps).filter(c => c.room.name === room.name);
  for (const c of roomCreeps) counts[c.memory.role] = (counts[c.memory.role] || 0) + 1;
  const targets = getTargets(room);
  const deficit = [];
  for (const role of ROLES) {
    const d = (targets[role] || 0) - (counts[role] || 0);
    if (d > 0) deficit.push(role + '+' + d);
  }
  const dropped = room.find(FIND_DROPPED_RESOURCES).reduce((n, r) => n + r.amount, 0);
  const sites = room.find(FIND_CONSTRUCTION_SITES).length;
  const contStruct = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) });
  const contFilled = contStruct.filter(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0).length;
  const contSites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
  const contProg = contSites.length ? Math.max(...contSites.map(s => s.progress)) : 0;
  const sources = room.find(FIND_SOURCES);
  const sp = room.find(FIND_MY_SPAWNS)[0];
  const spawning = sp && sp.spawning ? ('busy:' + (sp.spawning.name || 'creep')) : 'idle';
  const stage = getRoomStage(room);
  console.log('[STATUS ' + room.name + ' t=' + Game.time + ' rcl' +
    (room.controller ? room.controller.level : 0) + ' ' + stage + '] ' +
    'energy ' + room.energyAvailable + '/' + room.energyCapacityAvailable +
     ' prog ' + (room.controller && room.controller.progressTotal ? room.controller.progress + '/' + room.controller.progressTotal : '-') +
    ' creeps ' + roomCreeps.length +
    ' deficit ' + (deficit.length ? deficit.join(',') : 'none') +
    ' dropped ' + dropped +
    ' sites ' + sites +
    ' cont ' + contStruct.length + 'u/' + contFilled + 'f/' + contProg + '/' + (contSites.length ? contSites[0].progressTotal : 0) +
     ' harvesters ' + (counts.harvester || 0) + '/' + sources.length +
     ' TGT h' + (targets.harvester || 0) + ' ha' + (targets.hauler || 0) + ' u' + (targets.upgrader || 0) + ' b' + (targets.builder || 0) + ' l' + (targets.looter || 0) +
     ' hlr(' + (counts.hauler || 0) + 'x' + roomCreeps.filter(cr=>cr.memory.role==='hauler').reduce((n,cr)=>n+cr.store.getUsedCapacity(RESOURCE_ENERGY),0) + ') ' +
     'upg(' + (counts.upgrader || 0) + ') ' +
     ' cpu ' + Math.round(Game.cpu.getUsed()) + '/' + (Game.cpu.limit || 100) +
     ' spawn ' + spawning);
}

function manageSpawns(room) {
  const s = spawn(room);
  if (!s) return;
  reportStatus(room);
  if (s.spawning !== null && s.spawning !== undefined) {
    if (!Memory._spawnBusyTicks) Memory._spawnBusyTicks = 0;
    Memory._spawnBusyTicks++;
    if (Memory._spawnBusyTicks > 50) console.log('spawn STUCK:', s.spawning && s.spawning.name, 'forcing idle');
    if (!Memory._spawnWasBusy) { Memory._spawnWasBusy = true; console.log('spawn BUSY:', s.spawning && s.spawning.name, 'energy', room.energyAvailable); }
    return;
  } else { Memory._spawnWasBusy = false; Memory._spawnBusyTicks = 0; }
  // Harvester resilience state (recovery logic below consumes these).
  // Use the runtime's real BODYPART_COST so the thresholds are correct even
  // on servers with non-standard body part prices.
  const HARVEST_REPLACE_TTL = 100;
  const prodBody = [WORK, CARRY, MOVE];
  const bodyCost = b => b.reduce((n, p) => n + (BODYPART_COST[p] || 0), 0);
  const prodCost = bodyCost(prodBody);
  const hasCarry = c => Array.isArray(c.body) && c.body.some(p => p.type === CARRY);
  const roomHarvesters = Object.values(Game.creeps).filter(c => c.memory.role === 'harvester' && c.room.name === room.name);
  const liveHarvesterCount = roomHarvesters.length;
  const functionalHarvesterCount = roomHarvesters.filter(hasCarry).length;
  const nonFunctionalHarvester = liveHarvesterCount > 0 && functionalHarvesterCount === 0
    ? roomHarvesters.find(c => !hasCarry(c)) : null;
  const nearDeath = roomHarvesters.some(c => typeof c.ticksToLive === 'number' && c.ticksToLive < HARVEST_REPLACE_TTL);
  if (functionalHarvesterCount > 0) Memory._crisisHarvester = false;

  const targets = getTargets(room);
  const controller = room.controller;
  const stage = getRoomStage(room);
  const counts = {};
  for (const name in Game.creeps) { const r = Game.creeps[name].memory.role; counts[r] = (counts[r] || 0) + 1; }
  // Built source containers (the income unlock). `filled` from getTargets is not in
  // this scope, so compute the container count here (a built container, even empty,
  // means harvesters can dump at the source and the upgrader is affordable again).
  const contStruct = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER && (s.my || !s.owner) }).length;

   // Harvester crisis recovery (prevents the energy-death deadlock):
  //  - Proactive: a FUNCTIONAL harvester nearing end-of-life -> spawn its
  //    replacement BEFORE it dies (prodBody=[W,C,M]); never use a [WORK,MOVE]
  //    body (no CARRY -> never harvests).
  //  - Reactive: zero FUNCTIONAL harvesters (incl. a stuck non-functional one)
  //    -> if energy can't yet afford prodCost, recycle a victim (a non-harvester
  //    >=2 parts, OR the non-functional harvester itself) to raise it, then
  //    spawn; else emit a CRISIS log (unrecoverable w/o player aid).
  const needRescue = functionalHarvesterCount === 0
    || (nearDeath && liveHarvesterCount <= (targets.harvester || 0));
  if (needRescue && (targets.harvester || 0) > 0) {
    if (room.energyAvailable < prodCost) {
      if (functionalHarvesterCount === 0 && typeof s.recycleCreep === 'function') {
        const victims = Object.values(Game.creeps)
          .filter(c => c.room.name === room.name && c.body.length >= 2 &&
            (c.memory.role !== 'harvester' || !hasCarry(c)));
        if (victims.length) {
          const victim = victims.reduce((a, b) => (a.body.length > b.body.length ? a : b));
          if (s.recycleCreep(victim) === OK) {
            console.log('Recycled', victim.name, '(crisis)', hasCarry(victim) ? '' : 'non-functional harvester', 'to fund harvester, energy', room.energyAvailable);
            return;
          }
        }
        if (!Memory._crisisHarvester) {
          Memory._crisisHarvester = true;
          console.log('CRISIS', nonFunctionalHarvester ? 'non-functional' : 'zero', 'harvesters, energy', room.energyAvailable,
            '< prodCost', prodCost, ', no creeps to recycle — room stalled');
        }
        return;
      }
      // Near-death only & too broke to replace yet: let the living FUNCTIONAL
      // harvester keep collecting so a replacement can be afforded next tick.
    } else {
       // Spawn a replacement from whatever energy is banked. No energy gate: the
       // extensions are now being filled by the harvesters themselves (top-off on a
       // full spawn), so the pool climbs to energyCapacityAvailable (550 here) and
       // buildBody scales this body UP to 2-WORK (work,work,carry,move @ 300) instead
       // of carry-trip 1-WORK at 200. (functionalHarvesterCount === 0 stays the
       // true crisis path, still allowed on a 1-WORK emergency prodBody below.)
        let body = buildBody('harvester', room.energyAvailable);
        if (!body.length) body = prodBody;
        // Keep the source worked even when the bank is low: allow a 1-WORK
        // emergency replacement while functional harvesters are critically few
        // (<4), so dying harvesters get replaced instead of the count collapsing.
        // Only gate to >=2 WORK (to let the bank climb) when we already have enough
        // functional harvesters. (functionalHarvesterCount===0 is always allowed
        // via the crisis path above.)
        const workCount = body.filter(p => p === WORK).length;
        if (workCount < 2 && functionalHarvesterCount >= 4) {
          return;
        }
      const memory = { role: 'harvester' };
      const sources = room.find(FIND_SOURCES);
      let bestSrc = null, min = Infinity;
      for (const src of sources) {
        const n = Object.values(Game.creeps).filter(c => c.memory.role === 'harvester' && c.memory.sourceId === src.id).length;
        if (n < min) { min = n; bestSrc = src; }
      }
      if (bestSrc) memory.sourceId = bestSrc.id;
      const result = s.createCreep(body, 'harvester' + Game.time, memory);
      if (typeof result !== 'string') console.log('spawn failed:', result, 'for harvester emergency', 'body', body.join('/'), 'energy', room.energyAvailable);
      else { console.log('spawned', result, 'role harvester emergency', 'body', body.join('/'), 'energy', room.energyAvailable); Memory._crisisHarvester = false; }
      return;
    }
  }

  // Economy slim-down: when critically starved (< prodCost), shed replaceable
  // creeps so the spawn can bank energy for the next RCL gate (harvester or
  // upgrader). NEVER touches harvesters — a worker's position is a noisy idle
  // signal (a creep carrying a full load to the spawn, or walking empty to its
  // source, is far from the source and would be mis-flagged), and killing one
  // severs the energy supply = death spiral. Gated by a memory cooldown so at
  // most one creep is shed per ~15 ticks (no workforce nuking).
  if (room.energyAvailable < prodCost && typeof s.recycleCreep === 'function' && Game.time - (Memory._slimTick || 0) >= 15) {
    Memory._slimTick = Game.time;
    // (a) standing DEFENDER with no hostiles -> pure drain right now.
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length === 0) {
      const defs = Object.values(Game.creeps)
        .filter(c => c.memory.role === 'defender' && c.room.name === room.name && c.body.length >= 2);
      if (defs.length) {
        const victim = defs.reduce((a, b) => (a.ticksToLive > (b.ticksToLive || 0) ? a : b));
        if (s.recycleCreep(victim) === OK) {
          console.log('Recycled idle defender', victim.name, 'no hostiles, energy', room.energyAvailable);
          return;
        }
      }
    }
    // (b) removed: previously recycled a builder whenever the upgrader was
    // momentarily absent to "bank for RCL". In practice it thrashed builders on
    // every upgrader TTL gap (spawn builder -> upgrader dies -> (b) kills the
    // builder -> upgrader respawns -> ...), so the source container never
    // finished and income stayed carry-limited (~5/tick). Redundant anyway:
    // ROLE_PRIORITY already spawns the upgrader (5) before any builder (30),
    // so harvester income funds the upgrader first without killing builders.
    // (c) Bootstrap income: pre-container the UPGRADER is the drain that must go
    //     (a 1-WORK upgrader consumes ~1/tick vs ~1.6/tick carry-trip income, so it
    //     collapses the bank and starves the container builder mid-build). Shed the
    //     upgrader — NOT the builder — to stop the bleed; the builder is the income
    //     unlock and must survive to finish the container. Once a container exists,
    //     harvesters dump at the source, income jumps, and the upgrader respawns.
    if (controller && controller.level < 3 && contStruct === 0 && (counts.upgrader || 0) > 0) {
      const upgs = Object.values(Game.creeps)
        .filter(c => c.memory.role === 'upgrader' && c.room.name === room.name && c.body.length >= 2);
      if (upgs.length) {
        const victim = upgs.reduce((a, b) => (a.ticksToLive > (b.ticksToLive || 0) ? a : b));
        if (s.recycleCreep(victim) === OK) {
          console.log('Bootstrap: recycled upgrader', victim.name, 'pre-container to stop drain, energy', room.energyAvailable);
          return;
        }
      }
    }
    // (d) Post-container only: shed a surplus builder (only if >1) to bank the next
    //     harvester while a deficit exists. NEVER touch builders before the source
    //     container is built — the builder is the only thing that can finish it,
    //     and recycling it mid-build is what stalled the container and spiraled the
    //     room (a builder dies, isn't replaced at full bank, harvester deaths follow).
    if (controller && controller.level < 3 && contStruct > 0 && (targets.harvester || 0) > (counts.harvester || 0) && (counts.builder || 0) > 1) {
      const blds = Object.values(Game.creeps)
        .filter(c => c.memory.role === 'builder' && c.room.name === room.name && c.body.length >= 2);
      if (blds.length > 1) {
        const victim = blds.reduce((a, b) => (a.ticksToLive > (b.ticksToLive || 0) ? a : b));
        if (s.recycleCreep(victim) === OK) {
          console.log('Bootstrap: recycled builder', victim.name, 'to fund harvester (harv', (counts.harvester || 0) + '/' + targets.harvester + ') energy', room.energyAvailable);
          return;
        }
      }
    }
  }

  // Pre-container builder upgrade: the source container costs 5000 build progress,
  // and a 1-WORK builder caps at 1 build/tick (hours to finish). When the pool can
  // afford a 2-WORK builder (cost 410), recycle any living builder with <2 WORK so a
  // 2-WORK builder can spawn — doubling the build rate. This runs whenever the pool
  // has the energy (not just during the <prodCost slim-down).
  if (controller && controller.level < 3 && contStruct === 0 && room.energyAvailable >= 410 && typeof s.recycleCreep === 'function') {
    const weakBlds = Object.values(Game.creeps)
      .filter(c => c.memory.role === 'builder' && c.room.name === room.name &&
        c.body.filter(p => p.type === WORK).length < 2);
    if (weakBlds.length) {
      const victim = weakBlds[0];
      if (s.recycleCreep(victim) === OK) {
        console.log('Upgrade: recycled weak builder', victim.name, 'for a 2-WORK builder, energy', room.energyAvailable);
        return;
      }
    }
  }

  // Conserve: hold ALL spawns while starving, banking for the role the room needs
  // next so a replaceable worker doesn't steal the energy meant for it:
  //  - a functional harvester nearing death that can't yet be replaced, or
  //  - builder under target and bank<210 (bank for the container/income unlock
  //    first — finishing it is what lifts the bank so 2-WORK bodies become
  //    affordable), or
  //  - once the builder is on the site, bank for the anti-downgrade upgrader
  //    when RCL<3 (need ~260 available) so the banked energy isn't spent on a
  //    second builder before the upgrader exists.
  const BUILDER_BODY_COST = 200;
  const UPGRADER_BODY_COST = 250;
  if (
    (nearDeath && functionalHarvesterCount <= (targets.harvester || 0) && room.energyAvailable < prodCost) ||
    ((counts.builder || 0) < (targets.builder || 0) && room.energyAvailable < BUILDER_BODY_COST + 10) ||
    ((counts.builder || 0) >= (targets.builder || 0) && (counts.upgrader || 0) === 0 && controller && controller.level < 3 && room.energyAvailable < UPGRADER_BODY_COST + 10)
  ) {
    return;
  }

  // Build a list of roles that still need more creeps, with their priority
  // If a role has reached its target (need <= 0), priority becomes 100 (lowest)
  const candidates = [];
  for (const role of ROLES) {
    const need = (targets[role] || 0) - (counts[role] || 0);
    if (need <= 0) continue; // at target — effectively priority 100
    // upgrader gets a boost when controller level is low
    const upgBoost = (role === 'upgrader' && controller && controller.level < 2) ? 50 : 0;
    candidates.push({ role, priority: ROLE_PRIORITY[role] + upgBoost, need });
  }
  // Sort by priority ascending (0 = highest), then by need descending for ties
  candidates.sort((a, b) => a.priority - b.priority || b.need - a.need);

  // Try to spawn the highest-priority role that can afford a body
  for (const { role } of candidates) {
    if (role === 'claimer' && room.energyAvailable < 350) continue;
    // No energy gates on income/drain roles: buildBody already returns [] below
    // prodCost (200) for harvesters/builders, so they only spawn when affordable.
    // With the extensions being filled the pool climbs to 550, so buildBody scales
    // harvesters/builder up to 2-WORK automatically as energyAvailable rises.
    const body = buildBody(role, room.energyAvailable);
    if (body.length === 0) continue;
    // Pre-container: don't replace a lost harvester with another 1-WORK body while
    // functional harvesters still run — a 1-WORK spawn (~200) just resets the bank
    // to ~0 and perpetuates the carry-trip thrash, blocking the climb to 290+.
    // Wait for a 2-WORK body (>=290) the live harvesters are banking toward.
     // Pre-container: keep the source worked by allowing 1-WORK replacements
     // whenever functional harvesters drop below 4 (so the count can't collapse),
     // but bank for a >=2-WORK body when we have enough harvesters.
     if (role === 'harvester' && room.energyAvailable < 290 && functionalHarvesterCount >= 4) continue;
    // Pick best source for harvesters
    const memory = { role };
    if (role === 'harvester') {
      const sources = room.find(FIND_SOURCES);
      let bestSrc = null, min = Infinity;
      for (const src of sources) {
        const n = Object.values(Game.creeps).filter(c => c.memory.role === 'harvester' && c.memory.sourceId === src.id).length;
        if (n < min) { min = n; bestSrc = src; }
      }
      if (bestSrc) memory.sourceId = bestSrc.id;
    }
    const result = s.createCreep(body, role + Game.time, memory);
    if (typeof result !== 'string') console.log('spawn failed:', result, 'for', role, 'energy', room.energyAvailable);
    else console.log('spawned', result, 'role', role, 'energy', room.energyAvailable, 'spawning', s.spawning);
    return;
  }
}

module.exports = { buildBody, getTargets, manageSpawns, allies, getOwnedRooms, getHomeRoom, getRoomStage, getRoomPriority };
