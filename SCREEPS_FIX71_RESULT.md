# SCREEPS FIX7.1 RESULT -- exclude self from hauler reservations

## Change
role.hauler.js line 42, inside pickHaulTarget():
  before: filter(c => c && c.memory && c.memory.role === "hauler")
  after:  filter(c => c && c.name !== creep.name && c.memory && c.memory.role === "hauler")
Only code change. Nothing else in role.hauler.js; no other module touched.

## Validation
- node --check role.hauler.js: clean.
- node _validate_recovery.js: 39 passed, 0 failed (validator untouched).
- The opencode agent run completed validation but stopped before
  deploy/read-back; Hoshi completed the remaining steps directly.

## Deploy
- node _deploy.js (branch "default"): pushed 15 modules, 0 dropped
  (local 15 == deployed 15, whitelist intact).
- Deploy timestamp: 1791667066812.

## Read-back (live, via Screeps API)
- live role.hauler sha256 prefix: a109f907864cbf85 -- matches local.
- live contains the self-exclusion marker: true.

Status: DEPLOYED.
