// monitor.js - host-side log watcher.
// Tails logs/console.log and logs/errors.log, matches known regression /
// anti-pattern signatures, deduplicates findings via a per-key cooldown, and
// writes structured findings to logs/findings.log (+ echoes to stdout) so the
// agent can see "what to improve" surfaced automatically from the stream.
//
//   Usage:  source ~/.nvmrc-load.sh && node monitor.js
//   Detached:  nohup bash -c 'source ~/.nvmrc-load.sh && exec node monitor.js' \
//              >/home/jma/screeps/screeps/logs/monitor.out 2>&1 &
//
// State (file offsets + last-seen finding times) is persisted to
// logs/.monitor.state.json so restarts resume without re-scanning the backlog.
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname);
const WATCHED = [
  { name: 'console', file: 'console.log' },
  { name: 'errors', file: 'errors.log' },
];
const STATE_FILE = path.join(BASE, 'logs', '.monitor.state.json');
const OUT_FILE = path.join(BASE, 'logs', 'findings.log');
const POLL_MS = 2000;            // how often to poll the log files
const COOLDOWN_MS = 60_000;      // min gap between identical findings

// Rule: { match: RegExp, severity: 'warn'|'error'|'info', finding: (line, name) => string }
// finding() lets a rule derive a normalised key+text from the raw line. If a
// finding() returns undefined for a line, the rule does not fire on that line.
const RULES = [
  {
    match: /Invalid arguments in RoomPosition constructor/i,
    severity: 'error',
    finding: () => ({ key: 'bad_roomposition', text: 'RoomPosition created with out-of-range coordinates' }),
  },
  {
    match: /spawn failed/i,
    severity: 'warn',
    finding: (line) => {
      const m = line.match(/spawn failed: (-?\d+|ERR_[\w_]+) for (\w+)/);
      return m ? { key: 'spawn_failed:' + m[2], text: 'spawn failed for role ' + m[2] + ': ' + m[1] } : undefined;
    },
  },
  {
    match: /spawn STUCK/i,
    severity: 'error',
    finding: () => ({ key: 'spawn_stuck', text: 'spawn has been busy >50 ticks (stuck)' }),
  },
  {
    match: /spawn BUSY/i,
    severity: 'info',
    finding: (line) => {
      const m = line.match(/energy (\d+)/);
      return { key: 'spawn_busy', text: 'spawn busy with energy ' + (m ? m[1] : '?') };
    },
  },
  {
    match: /CRISIS/i,
    severity: 'warn',
    finding: (line) => {
      const m = line.match(/CRISIS\s+(\S+)\s+harvesters, energy (\d+)/);
      return m ? { key: 'crisis:' + m[1], text: 'harvester crisis (' + m[1] + '), energy ' + m[2] + ' < prodCost' }
        : { key: 'crisis', text: 'harvester crisis reported' };
    },
  },
  {
    match: /ERR_|error:/i,
    severity: 'error',
    finding: (line) => ({ key: 'game_error', text: 'engine/return error: ' + line.replace(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\s*\[log\]\s*/g, '').trim() }),
  },
  {
    match: /CPU|cpu (\d+)\/(\d+)/i,
    severity: 'warn',
    finding: (line) => {
      const m = line.match(/cpu (\d+)\/(\d+)/);
      if (!m) return undefined;
      const used = +m[1], limit = +m[2];
      return used > limit * 0.85
        ? { key: 'cpu_high', text: 'CPU near/over limit: ' + used + '/' + limit }
        : undefined;
    },
  },
  {
    match: /\[STATUS .+\] energy \d+\/\d+ deficit [^n]/,
    severity: 'warn',
    finding: (line) => {
      const m = line.match(/deficit\s+(\S+)/);
      return { key: 'role_deficit', text: 'role deficit: ' + (m ? m[1] : 'present') };
    },
  },
  {
    match: /dropped \d+/,
    severity: 'warn',
    finding: (line) => {
      const m = line.match(/dropped (\d+)/);
      const amt = m ? +m[1] : 0;
      return amt > 200 ? { key: 'dropped_energy', text: 'dropped energy uncollected: ' + amt } : undefined;
    },
  },
  {
    match: /Recycled (idle )?(defender|builder|harvester)/i,
    severity: 'info',
    finding: (line) => {
      const m = line.match(/Recycled(?: idle)? (\w+) (\S+)/);
      return m ? { key: 'slimed_down:' + m[1], text: 'shed ' + m[1] + ' ' + m[2] + ' to bank energy for RCL growth' }
        : { key: 'slimed_down', text: 'reclaimed a creep' };
    },
  },
];

let state;
function loadState() {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { state = {}; }
  if (!state.offsets) state.offsets = {};
  if (!state.last) state.last = {};
  return state;
}

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8'); } catch (_) {}
}

function now() { return Date.now(); }

function readNew(name, file) {
  const full = path.join(BASE, 'logs', file);
  let fd;
  try { fd = fs.openSync(full, 'r'); } catch (e) { return []; }
  let stat;
  try { stat = fs.fstatSync(fd); } catch (e) { fs.closeSync(fd); return []; }
  const size = stat.size;
  const last = state.offsets[name];
  // Cold start (no recorded offset): begin tailing at end-of-file so we only
  // surface NEW issues rather than replaying the whole backlog.
  if (!last) { state.offsets[name] = size; fs.closeSync(fd); return []; }
  // If the file shrank (rotation/truncation), skip to the end of the new file
  // rather than replaying the old (now-gone) content.
  const start = size < last ? size : last;
  if (start >= size) { fs.closeSync(fd); return []; }
  const len = size - start;
  const buf = Buffer.alloc(len);
  let read = 0;
  while (read < len) {
    const n = fs.readSync(fd, buf, read, len - read, start + read);
    if (n <= 0) break;
    read += n;
  }
  fs.closeSync(fd);
  state.offsets[name] = start + read;
  const text = buf.slice(0, read).toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return text.split('\n').filter(l => l.length > 0);
}

function emit(finding, raw) {
  const ts = new Date().toISOString();
  const line = '[' + ts + '] [' + finding.severity.toUpperCase() + '] [' + finding.key + '] ' + finding.text + '  | raw: ' + raw.trim().slice(0, 200);
  fs.appendFileSync(OUT_FILE, line + '\n');
  console.log(line);
}

function processLines(lines, sourceName) {
  for (const raw of lines) {
    // Strip the in-game timestamp/role prefix to normalise matching text.
    const text = raw.replace(/^\[.*?\]\s*\[log\]\s*/, '');
    for (const rule of RULES) {
      if (!rule.match.test(text) && !rule.match.test(raw)) continue;
      const res = rule.finding(text) || (rule.finding === undefined ? null : null);
      if (res === undefined || res === null) continue;
      const f = { key: res.key, severity: rule.severity, text: res.text };
      const last = state.last[f.key] || 0;
      if (now() - last < COOLDOWN_MS) continue;
      state.last[f.key] = now();
      emit(f, raw);
    }
  }
}

console.log('[monitor] watching', WATCHED.map(w => w.file).join(', '), '->', OUT_FILE);
setInterval(() => {
  loadState();
  for (const w of WATCHED) {
    const lines = readNew(w.name, w.file);
    if (lines.length) processLines(lines, w.name);
  }
  saveState();
}, POLL_MS);
