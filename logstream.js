'use strict'

const fs = require('fs')
const path = require('path')

const { ScreepsAPI } = require('screeps-api')

const LOG_DIR = path.join(__dirname, 'logs')
const CONSOLE_LOG = path.join(LOG_DIR, 'console.log')
const ERROR_LOG = path.join(LOG_DIR, 'errors.log')

// Cap each log file at MAX_BYTES and keep the most recent MAX_BACKUPS copies.
const MAX_BYTES = 5 * 1024 * 1024
const MAX_BACKUPS = 3

class RotatableLogger {
  constructor (filePath) {
    this.filePath = filePath
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  }

  write (text) {
    if (!text) return
    const fd = fs.openSync(this.filePath, 'a')
    fs.appendFileSync(fd, text)
    fs.closeSync(fd)
    this.rotate()
  }

  rotate () {
    let stats
    try {
      stats = fs.statSync(this.filePath)
    } catch (e) {
      return
    }
    if (stats.size <= MAX_BYTES) return

    // Shift existing backups: .{n-1} -> .{n}, then move current into .1
    for (let i = MAX_BACKUPS; i >= 1; i--) {
      const src = i === 1 ? this.filePath : `${this.filePath}.${i - 1}`
      const dest = `${this.filePath}.${i}`
      if (fs.existsSync(src)) {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        fs.renameSync(src, dest)
      }
    }
    // Create a fresh empty file; oldest backup ( .{MAX_BACKUPS}) is dropped.
    fs.writeFileSync(this.filePath, '')
  }
}

const consoleLog = new RotatableLogger(CONSOLE_LOG)
const errorLog = new RotatableLogger(ERROR_LOG)

function timestamp () {
  return new Date().toISOString()
}

async function main () {
  // `fromConfig('main', 'logstream')` loads server "main" from ~/.screeps.yml
  // and indexes the appConfig named "logstream" (harmless if absent).
  const api = await ScreepsAPI.fromConfig('main', 'logstream')

  api.socket.on('error', (err) => {
    errorLog.write(`[${timestamp()}] socket error: ${err && err.message ? err.message : err}\n`)
  })

  api.socket.on('connected', () => {
    consoleLog.write(`[${timestamp()}] socket connected\n`)
  })

  api.socket.on('disconnected', () => {
    consoleLog.write(`[${timestamp()}] socket disconnected\n`)
  })

  await api.socket.connect()

  // Subscribe to console output (re-subscribed automatically on reconnect).
  await api.socket.subscribe('console', (event) => {
    const data = event && event.data

    if (!data) return

    const lines = []

    if (data.error) {
      errorLog.write(`[${timestamp()}] console error: ${data.error}\n`)
    }

    if (data.messages) {
      if (Array.isArray(data.messages.log) && data.messages.log.length) {
        lines.push(...data.messages.log.map((l) => `[log] ${l}`))
      }
      if (Array.isArray(data.messages.results) && data.messages.results.length) {
        lines.push(...data.messages.results.map((l) => `[result] ${l}`))
      }
    }

    if (lines.length) {
      const tick = data.tick != null ? data.tick : (data.gameTime != null ? data.gameTime : '?')
      consoleLog.write(`[${timestamp()} #${tick}] ${lines.join('\n')}\n`)
    }
  })
}

main().catch((err) => {
  errorLog.write(`[${timestamp()}] fatal: ${err && err.stack ? err.stack : err}\n`)
  process.exit(1)
})
