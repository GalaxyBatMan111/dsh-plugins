// Process helpers for the wxapkg bridge: spawn wrapper with timeout + Windows process-tree kill.
import { spawn } from 'node:child_process'

export function killPid(pid) {
  if (!pid) return
  try { process.kill(pid) } catch { /* already gone */ }
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch { /* ignore */ }
  }
}

function cmdQuote(a) {
  if (/[\s"&|<>^()%!]/.test(a)) return '"' + a.replace(/"/g, '\\"') + '"'
  return a
}

export function makeSpawnArgs(cmd, args) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)) {
    const line = '"' + cmd + '"' + (args.length ? ' ' + args.map(cmdQuote).join(' ') : '')
    return { command: line, args: [], options: { shell: true } }
  }
  return { command: cmd, args, options: {} }
}

/**
 * Run a process to completion, capturing bounded stdout/stderr.
 * Never rejects on a non-zero exit; resolves with the exit code instead.
 */
export function runProcess(cmd, args, opts) {
  const o = opts || {}
  const cwd = o.cwd || process.cwd()
  const timeoutMs = o.timeoutMs || 0
  const maxOutputChars = o.maxOutputChars || 200000
  const onData = o.onData || null
  return new Promise((resolve, reject) => {
    const built = makeSpawnArgs(cmd, args)
    let child
    try {
      child = spawn(built.command, built.args, Object.assign({
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: o.env || process.env,
      }, built.options))
    } catch (err) { reject(err); return }

    let stdout = ''
    let stderr = ''
    let truncated = false
    let settled = false
    const append = (buf, which) => {
      const s = buf.toString('utf8')
      if (onData) { try { onData(s) } catch { /* ignore */ } }
      if (which === 'out') {
        if (stdout.length + s.length > maxOutputChars) { stdout += s.slice(0, Math.max(0, maxOutputChars - stdout.length)); truncated = true }
        else stdout += s
      } else {
        if (stderr.length + s.length > maxOutputChars) { stderr += s.slice(0, Math.max(0, maxOutputChars - stderr.length)); truncated = true }
        else stderr += s
      }
    }
    child.stdout.on('data', (d) => append(d, 'out'))
    child.stderr.on('data', (d) => append(d, 'err'))

    let timer = null
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        killPid(child.pid)
        resolve({ exitCode: -1, stdout, stderr, truncated, timedOut: true, pid: child.pid })
      }, timeoutMs)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      killPid(child.pid)
      reject(new Error('aborted'))
    }
    const signal = o.signal
    if (signal) {
      if (signal.aborted) { onAbort(); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve({ exitCode: code, stdout, stderr, truncated, timedOut: false, pid: child.pid })
    })
  })
}

/** Spawn without waiting; the caller wires up stdio and completion. */
export function spawnProcess(cmd, args, opts) {
  const o = opts || {}
  const built = makeSpawnArgs(cmd, args)
  return spawn(built.command, built.args, Object.assign({
    cwd: o.cwd || process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: o.env || process.env,
  }, built.options))
}
