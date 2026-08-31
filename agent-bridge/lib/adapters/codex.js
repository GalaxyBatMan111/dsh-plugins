// Codex 适配器：codex exec <prompt> --json [--full-auto]
import { runProcess } from '../run.js'
import { detectCodex } from '../detect.js'

export function parseCodexOutput(stdout) {
  const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  let last = null
  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object') last = obj
    } catch { /* 非 JSON 行 */ }
  }
  if (!last) return null
  const text =
    last.text ||
    (last.message && (last.message.text || last.message.content)) ||
    (last.summary ? (typeof last.summary === 'string' ? last.summary : JSON.stringify(last.summary)) : null)
  return { type: 'result', text: text ? String(text) : JSON.stringify(last), raw: last }
}

// 构造 codex 命令行（前台与后台任务共用）
export function prepareCodex({ prompt, model, config }) {
  const bin = detectCodex(config)
  if (!bin) return { error: '未找到 codex 命令；安装：npm install -g @openai/codex 并登录（codex login）' }
  const args = ['exec', prompt, '--json']
  if (config.codexFullAuto) args.push('--full-auto')
  if (model) args.push('--model', model)
  return { bin: bin.path, args }
}

export async function runCodex({ prompt, cwd, model, timeoutMs, signal, config, maxOutputChars }) {
  const prep = prepareCodex({ prompt, model, config })
  if (prep.error) {
    return { target: 'codex', ok: false, installed: false, error: prep.error }
  }
  const started = Date.now()
  let r
  try {
    r = await runProcess(prep.bin, prep.args, { cwd, timeoutMs, signal, maxOutputChars })
  } catch (err) {
    if (signal && signal.aborted) throw err
    return { target: 'codex', ok: false, installed: true, error: '启动 codex 失败: ' + err.message, durationMs: Date.now() - started }
  }
  const durationMs = Date.now() - started
  return {
    target: 'codex',
    ok: !r.timedOut && r.exitCode === 0,
    installed: true,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    durationMs,
    truncated: r.truncated,
    stdout: r.stdout,
    stderr: r.stderr,
    result: parseCodexOutput(r.stdout),
  }
}
