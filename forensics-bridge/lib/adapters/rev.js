// 逆向适配器：radare2（r2 命令）+ RetDec（反编译）
import { runProcess } from '../run.js'
import { detectTools, toolsRoot } from '../detect.js'

async function exec(t, bin, args, opts) {
  const r = await runProcess(bin, args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs, signal: opts.signal, maxOutputChars: opts.maxOutputChars, env: opts.env })
  return {
    ok: !r.timedOut && r.exitCode === 0,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    truncated: r.truncated,
    stdout: r.stdout,
    stderr: r.stderr,
  }
}

export async function r2Info(binary, opts) {
  const t = detectTools(opts.config)
  if (!t.radare2) return { ok: false, error: '未找到 radare2；预期位置: ' + toolsRoot() + '\\radare2\\<ver>\\bin\\radare2.exe' }
  return exec(t, t.radare2, ['-q', '-c', 'iI', binary], opts)
}

export async function r2Functions(binary, opts) {
  const t = detectTools(opts.config)
  if (!t.radare2) return { ok: false, error: '未找到 radare2' }
  // aaa 自动分析后再列函数（分析耗时随文件大小增长，用 timeoutMs 控制）
  return exec(t, t.radare2, ['-q', '-c', 'aaa; afl', binary], opts)
}

export async function r2Disasm(binary, target, count, opts) {
  const t = detectTools(opts.config)
  if (!t.radare2) return { ok: false, error: '未找到 radare2' }
  const cmd = 'aaa; ' + (count ? 'pd ' + count + ' @ ' + target : 'pdf @ ' + target)
  return exec(t, t.radare2, ['-q', '-c', cmd, binary], opts)
}

export async function retdecDecompile(binary, outFile, opts) {
  const t = detectTools(opts.config)
  if (!t.retdec || !t.retdec.toLowerCase().endsWith('retdec-decompiler.exe')) return { ok: false, error: '未找到 retdec-decompiler.exe；预期位置: ' + toolsRoot() + '\\retdec\\bin' }
  const env = { ...(opts.env || {}), RETDEC_PATH: toolsRoot() + '\\retdec' }
  const args = outFile ? [binary, '-o', outFile] : [binary]
  const r = await exec(t, t.retdec, args, { ...opts, env })
  // RetDec v5 Windows 构建可能因缺少运行库崩溃（0xC0000135）
  if (r.exitCode === -1073741515) r.note = 'retdec-decompiler 崩溃(0xC0000135)，v5.0 Windows 构建环境不兼容；可改用 ghidra_decompile 或 radare2'
  return r
}
