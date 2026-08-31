// 抓包适配器：tshark（Wireshark 命令行）+ mitmproxy
import { runProcess } from '../run.js'
import { detectTools, pyScriptsDir } from '../detect.js'

export async function tsharkCapture(iface, durationSec, outFile, opts) {
  const t = detectTools(opts.config)
  if (!t.tshark) return { ok: false, error: '未找到 tshark；请安装 Wireshark（含命令行工具）' }
  const args = ['-i', iface || '1', '-a', 'duration:' + (durationSec || 30), '-w', outFile, '-q']
  const r = await runProcess(t.tshark, args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs, signal: opts.signal, maxOutputChars: opts.maxOutputChars })
  return {
    ok: !r.timedOut && r.exitCode === 0,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    truncated: r.truncated,
    stdout: r.stdout,
    stderr: r.stderr,
    note: r.exitCode === 0 ? '抓包完成: ' + outFile + '（实时抓包需要 Npcap 驱动与管理员权限）' : undefined,
  }
}

export async function tsharkRead(pcapFile, filter, opts) {
  const t = detectTools(opts.config)
  if (!t.tshark) return { ok: false, error: '未找到 tshark' }
  const args = ['-r', pcapFile]
  if (filter) args.push('-Y', filter)
  const r = await runProcess(t.tshark, args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs, signal: opts.signal, maxOutputChars: opts.maxOutputChars })
  return { ok: !r.timedOut && r.exitCode === 0, exitCode: r.exitCode, timedOut: r.timedOut, truncated: r.truncated, stdout: r.stdout, stderr: r.stderr }
}

export async function tsharkInterfaces(opts) {
  const t = detectTools(opts.config)
  if (!t.tshark) return { ok: false, error: '未找到 tshark' }
  const r = await runProcess(t.tshark, ['-D'], { cwd: opts.cwd, timeoutMs: 20000, signal: opts.signal, maxOutputChars: 20000 })
  // 无 Npcap 时 -D 可能非 0 退出但仍列出接口，只要有输出就算可用
  const ok = !r.timedOut && (r.exitCode === 0 || (r.stdout || '').trim().length > 0)
  return { ok, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, note: r.exitCode !== 0 && ok ? 'tshark 退出码 ' + r.exitCode + '（可能缺 Npcap，实时抓包不可用，但接口可列出）' : undefined }
}

// 启动 mitmdump 录制（返回进程句柄，由插件管理生命周期）
export async function mitmStart(port, outFile, opts) {
  const t = detectTools(opts.config)
  if (!t.mitmdump || !t.mitmdump.toLowerCase().endsWith('mitmdump.exe')) return { ok: false, error: '未找到 mitmdump；预期位置: ' + pyScriptsDir() + '\\mitmdump.exe' }
  const args = ['-p', String(port || 8080)]
  if (outFile) args.push('-w', outFile)
  const { spawn } = await import('node:child_process')
  const { makeSpawnArgs } = await import('../run.js')
  const { command, args: cargs, options } = makeSpawnArgs(t.mitmdump, args)
  const child = spawn(command, cargs, { cwd: opts.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: opts.env })
  let log = ''
  child.stdout.on('data', (d) => { log = (log + d.toString('utf8')).slice(-20000) })
  child.stderr.on('data', (d) => { log = (log + d.toString('utf8')).slice(-20000) })
  return { child, port: port || 8080, outFile, log: () => log }
}
