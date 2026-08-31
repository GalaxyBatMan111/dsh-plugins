// 后台任务运行器：供 ctx.jobs.start 使用。
// 职责：启动子进程、增量缓冲输出（readOutput 消费增量）、cancel、超时、
// 周期性向所属 agent 注入进度、结束时附加解析出的最终结果。
import { spawn } from 'node:child_process'
import { makeSpawnArgs, killPid } from './run.js'
import { parseClaudeOutput } from './adapters/claude.js'
import { parseCodexOutput } from './adapters/codex.js'

export class AgentRun {
  constructor({ target, bin, args, cwd, timeoutMs, agent, progressInjectMs = 15000, maxOutputChars = 100000 }) {
    this.target = target
    this.buffer = ''
    this.readPos = 0
    this.maxOutputChars = maxOutputChars
    this.truncated = false
    this._settled = false
    this._cancelled = false
    this._cancelReason = null
    this._spawnError = null
    this.startedAt = Date.now()
    this.done = new Promise((resolve) => { this._resolveDone = resolve })

    let child
    try {
      const { command, args: cargs, options } = makeSpawnArgs(bin, args)
      child = spawn(command, cargs, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, ...options })
    } catch (err) {
      this._spawnError = err
      child = null
    }
    this.child = child
    if (child) {
      child.stdout.on('data', (d) => this._append(d.toString('utf8')))
      child.stderr.on('data', (d) => this._append(d.toString('utf8')))
      child.on('error', (err) => { this._spawnError = err; this._finish(null) })
      child.on('close', (code) => this._finish(code))
    } else {
      queueMicrotask(() => this._finish(null))
    }

    if (timeoutMs && timeoutMs > 0) {
      this.timer = setTimeout(() => this._kill('超时 (' + Math.round(timeoutMs / 1000) + 's)'), timeoutMs)
    }

    if (agent && progressInjectMs > 0) {
      this.injectTimer = setInterval(() => {
        try {
          const tail = this.buffer.slice(-300).trim()
          if (!tail) return
          const secs = Math.round((Date.now() - this.startedAt) / 1000)
          agent.inject({
            content: '[agent-bridge] ' + this.target + ' 运行中 ' + secs + 's：' + tail,
            source: { kind: 'plugin', plugin: 'agent-bridge' },
          })
        } catch { /* agent 可能已 dispose，忽略 */ }
      }, progressInjectMs)
    }
  }

  _append(s) {
    if (this.buffer.length + s.length <= this.maxOutputChars) {
      this.buffer += s
      return
    }
    const overflow = this.buffer.length + s.length - this.maxOutputChars
    this.buffer = this.buffer.slice(overflow) + s
    this.readPos = Math.max(0, this.readPos - overflow)
    this.truncated = true
  }

  // 消费自上次调用以来的输出增量（ctx.jobs readOutput 通道）
  takeDelta() {
    const delta = this.buffer.slice(this.readPos)
    this.readPos = this.buffer.length
    return delta
  }

  cancel(reason) {
    if (this._settled) return
    this._cancelled = true
    this._cancelReason = reason || '已取消'
    if (this.child) killPid(this.child.pid)
    else this._finish(null)
  }

  _kill(reason) {
    this.cancel(reason)
  }

  _finish(code) {
    if (this._settled) return
    this._settled = true
    clearTimeout(this.timer)
    clearInterval(this.injectTimer)

    const marker = this._finalMarker()
    if (marker) this._append(marker)

    let status = 'completed'
    let detail
    if (this._cancelled) {
      status = 'killed'
      detail = this._cancelReason || undefined
    } else if (this._spawnError) {
      status = 'failed'
      detail = 'spawn 失败: ' + this._spawnError.message
    } else if (code !== 0) {
      status = 'failed'
      detail = 'exit code: ' + code
    }
    this._resolveDone({ status, ...(detail ? { detail } : {}) })
  }

  // 结束时把解析出的最终结果作为一段标记追加进输出流
  _finalMarker() {
    try {
      const parsed = this.target === 'claude' ? parseClaudeOutput(this.buffer) : parseCodexOutput(this.buffer)
      if (parsed && parsed.text) {
        return '\n[agent-bridge] === 最终结果 ===\n' + parsed.text.slice(0, 8000)
      }
    } catch { /* 解析失败则不加标记 */ }
    return ''
  }
}
