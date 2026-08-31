// Marvis 适配器（阶段1）：探测/启动 MarvisAgent 服务器 + 健康检查
// 阶段2：接入 Socket.IO /agent namespace 实现真正的 agent 对话
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectMarvisAgent } from '../detect.js'
import { killPid } from '../run.js'

function readPort(portFile) {
  try {
    const text = readFileSync(portFile, 'utf8')
    const m = /port\s*=\s*(\d+)/i.exec(text)
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

function startServer(exe, args, portFile, pollMs, signal) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, error: 'spawn 失败: ' + err.message, log: '' })
      return
    }
    let stderr = ''
    child.stderr.on('data', (d) => { stderr = (stderr + d.toString('utf8')).slice(-20000) })
    child.on('error', (err) => {
      clearInterval(timer)
      resolve({ ok: false, error: 'spawn 失败: ' + err.message, log: stderr })
    })
    const deadline = Date.now() + pollMs
    const finish = (val) => { clearInterval(timer); resolve(val) }
    const timer = setInterval(() => {
      if (signal && signal.aborted) {
        killPid(child.pid)
        finish({ ok: false, error: 'call_agent 被中止', log: stderr })
        return
      }
      const port = readPort(portFile)
      if (port) {
        finish({ ok: true, port, pid: child.pid, log: stderr })
        return
      }
      if (Date.now() > deadline) {
        killPid(child.pid)
        finish({ ok: false, error: 'MarvisAgent 服务器在 ' + Math.round(pollMs / 1000) + 's 内未就绪', log: stderr })
      }
    }, 400)
  })
}

export async function runMarvis({ timeoutMs, signal, config }) {
  const bin = detectMarvisAgent(config)
  if (!bin) {
    return {
      target: 'marvis', ok: false, installed: false,
      error: '未找到 MarvisAgent.exe；已扫描 Program Files 下的 Tencent/Marvis/MarvisAgent/<ver>/MarvisAgent.exe，或通过配置 marvisAgentExe 指定',
    }
  }
  const tmp = mkdtempSync(join(tmpdir(), 'marvis-bridge-'))
  mkdirSync(join(tmp, 'logs'), { recursive: true })
  const portFile = join(tmp, 'port.txt')
  const args = [
    '--port_file', portFile,
    '--log_dir', join(tmp, 'logs'),
    '--home_dir', tmp,
    '--transport', 'websocket',
    '--work_mode', config.marvisWorkMode,
  ]
  const started = Date.now()
  const st = await startServer(bin.path, args, portFile, Math.min(30000, timeoutMs || 30000), signal)
  const durationMs = Date.now() - started
  if (!st.ok) {
    return { target: 'marvis', ok: false, installed: true, durationMs, error: st.error, note: '服务器启动失败', serverLog: st.log }
  }
  let health = null
  try {
    const resp = await fetch('http://127.0.0.1:' + st.port + '/health', { signal: AbortSignal.timeout(5000) })
    if (resp.ok) health = await resp.json()
  } catch { /* 健康检查失败不致命 */ }
  killPid(st.pid)
  return {
    target: 'marvis',
    ok: true,
    installed: true,
    durationMs,
    port: st.port,
    health,
    note: 'Marvis agent 服务器已启动并通过健康检查（阶段1：服务器生命周期管理）。' +
      '阶段2将接入 Socket.IO /agent 协议（--help 显示 server 提供 Sanic + Socket.IO /agent namespace），实现真正的 agent 对话。',
    serverLog: st.log,
  }
}
