'use strict'
const fs = require('fs')
const path = require('path')
const { ScreepsAPI } = require('screeps-api')

const BASE = process.cwd()
const BRANCH = 'default'

;(async () => {
  const api = await ScreepsAPI.fromConfig('main', 'agent-manual-deploy')

  // 1) Discover local tracked .js modules (flat repo: module name = filename sans .js)
  const local = {}
  for (const f of fs.readdirSync(BASE)) {
    if (!f.endsWith('.js')) continue
    const mod = f.slice(0, -3)
    local[mod] = fs.readFileSync(path.join(BASE, f), 'utf8')
  }
  console.log('[deploy] local modules:', Object.keys(local).join(', '))

  // 2) Fetch what screeps.com currently has, preserve any deployed module we don't
  //    own locally (defensive — there shouldn't be any beyond logstream/monitor).
  let deployed = {}
  try {
    const res = await api.code.get(BRANCH)
    if (res && res.modules) {
      // res.modules is { "module.name": source }
      deployed = res.modules || {}
    } else if (res && res.code) {
      deployed = res.code || {}
    }
  } catch (e) {
    console.warn('[deploy] could not fetch existing code (first deploy?):', e.message)
  }
  console.log('[deploy] currently deployed modules:', Object.keys(deployed).join(', '))

  // 3) Overlay local files onto the deployed set.
  const modules = Object.assign({}, deployed, local)

  // 4) Confirm config.js (the pending u5 change) is included and correct.
  if (typeof modules.config === 'string') {
    const u5 = modules.config.includes('controller.level < 3 ? 5 : 2')
    console.log('[deploy] config.js u5 present:', u5)
    if (!u5) {
      console.error('[deploy] ERROR: u5 change missing in config.js — aborting.')
      process.exit(1)
    }
  }

  console.log('[deploy] pushing', Object.keys(modules).length, 'modules to branch', BRANCH, '...')
  const res = await api.code.set(BRANCH, modules)
  console.log('[deploy] result:', JSON.stringify(res))
  console.log('[deploy] OK')
})().catch(e => {
  console.error('[deploy] FAILED:', e.message)
  process.exit(1)
})
