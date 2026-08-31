// 进程工具：进程树清理 + Windows .cmd/.bat 引号处理
import { spawn } from 'node:child_process'

export function killPid(pid) {
  if (!pid) return
  try { process.kill(pid) } catch { /* 已退出 */ }
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

export function runProcess(cmd, args, { cwd, timeoutMs, signal, maxOutputChars = 100000, env }) {
  return new Promise((resolve, reject) => {
    const { command, args: cargs, options } = makeSpawnArgs(cmd, args)
    let child
    try {
      child = spawn(command, cargs, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env || process.env, ...options })
    } catch (err) { reject(err); return }
    let stdout = '', stderr = '', truncated = false, settled = false
    const append = (buf, target) => {
      const s = buf.toString('utf8')
      if (target.length + s.length > maxOutputChars) { target += s.slice(0, Math.max(0, maxOutputChars - target.length)); truncated = true }
      else target += s
      return target
    }
    child.stdout.on('data', (d) => { stdout = append(d, stdout) })
    child.stderr.on('data', (d) => { stderr = append(d, stderr) })
    let timer = null
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        killPid(child.pid)
        resolve({ exitCode: -1, stdout, stderr, truncated, timedOut: true })
      }, timeoutMs)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      killPid(child.pid)
      reject(new Error('aborted'))
    }
    if (signal) {
      if (signal.aborted) { onAbort(); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.on('error', (err) => { if (settled) return; settled = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); reject(err) })
    child.on('close', (code) => { if (settled) return; settled = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); resolve({ exitCode: code, stdout, stderr, truncated, timedOut: false }) })
  })
}
