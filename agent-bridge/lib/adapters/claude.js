// Claude Code 适配器：claude -p <prompt> --output-format json
import { runProcess } from '../run.js'
import { detectClaude } from '../detect.js'

export function parseClaudeOutput(stdout) {
  const lines = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i])
      if (obj && obj.type === 'result') {
        return {
          type: 'result',
          isError: !!obj.isError,
          text: typeof obj.result === 'string' ? obj.result : JSON.stringify(obj.result ?? null),
          usage: obj.usage ?? null,
          durationMs: obj.durationMs ?? null,
        }
      }
    } catch { /* 非 JSON 行 */ }
  }
  return null
}

// 构造 claude 命令行（前台与后台任务共用）
export function prepareClaude({ prompt, model, config }) {
  const bin = detectClaude(config)
  if (!bin) return { error: '未找到 claude 命令；安装：npm install -g @anthropic-ai/claude-code 并登录' }
  const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', config.claudePermissionMode]
  for (const t of config.claudeAllowedTools || []) args.push('--allowedTools', t)
  for (const t of config.claudeDisallowedTools || []) args.push('--disallowedTools', t)
  if (model) args.push('--model', model)
  return { bin: bin.path, args }
}

export async function runClaude({ prompt, cwd, model, timeoutMs, signal, config, maxOutputChars }) {
  const prep = prepareClaude({ prompt, model, config })
  if (prep.error) {
    return { target: 'claude', ok: false, installed: false, error: prep.error }
  }
  const started = Date.now()
  let r
  try {
    r = await runProcess(prep.bin, prep.args, { cwd, timeoutMs, signal, maxOutputChars })
  } catch (err) {
    if (signal && signal.aborted) throw err
    return { target: 'claude', ok: false, installed: true, error: '启动 claude 失败: ' + err.message, durationMs: Date.now() - started }
  }
  const durationMs = Date.now() - started
  return {
    target: 'claude',
    ok: !r.timedOut && r.exitCode === 0,
    installed: true,
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    durationMs,
    truncated: r.truncated,
    stdout: r.stdout,
    stderr: r.stderr,
    result: parseClaudeOutput(r.stdout),
  }
}
