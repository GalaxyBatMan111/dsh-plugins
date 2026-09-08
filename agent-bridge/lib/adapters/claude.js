// Claude Code 适配器：claude -p <prompt> --output-format json
// 稳健性：API 端点预检（快速失败）、网络错误自动重试、系统代理自动注入
import { runProcess } from '../run.js'
import { detectClaude } from '../detect.js'
import { sanitizeText, resolveClaudeBaseUrl, probeUrl, detectSystemProxy, proxyEnv } from '../robust.js'

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

const NETWORK_FAIL_PATTERN = /TRANSPORT|stream failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE|socket hang up|fetch failed|network error/i

// 构造 claude 命令行（前台与后台任务共用）
export function prepareClaude({ prompt, model, config }) {
  const bin = detectClaude(config)
  if (!bin) return { error: '未找到 claude 命令；安装：npm install -g @anthropic-ai/claude-code 并登录（登录/配置见 README）' }
  const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', config.claudePermissionMode]
  for (const t of config.claudeAllowedTools || []) args.push('--allowedTools', t)
  for (const t of config.claudeDisallowedTools || []) args.push('--disallowedTools', t)
  if (model) args.push('--model', model)
  return { bin: bin.path, args }
}

// API 预检：端点不可达时快速失败，避免 claude 内部反复重试拖时间
// 返回 { ok } 或 { ok:false, error }；ok 时可能附带 proxyEnv（若需经代理可达）
export async function preflightClaude(config) {
  const baseUrl = config.claudeBaseUrl || resolveClaudeBaseUrl()
  if (!baseUrl) return { ok: true } // 未配置自定义端点（官方登录），无法预检
  const probeMs = config.apiProbeTimeoutMs || 5000
  const direct = await probeUrl(baseUrl, probeMs)
  if (direct.ok) return { ok: true, baseUrl, viaProxy: null }
  // 直连失败：尝试系统代理
  const proxy = config.proxyUrl || detectSystemProxy()
  if (proxy) {
    const viaProxy = await probeUrlWithProxy(baseUrl, proxy, probeMs)
    if (viaProxy.ok) return { ok: true, baseUrl, viaProxy: proxy, directError: direct.error }
  }
  const hint = proxy ? '（已尝试系统代理 ' + proxy + ' 仍失败）' : '（未发现可用系统代理）'
  return {
    ok: false,
    baseUrl,
    error: 'Claude 的 API 端点 ' + baseUrl + ' 不可达: ' + (direct.error || 'unknown') + hint +
      '。可检查网络，或在插件配置中设置 proxyUrl: "http://127.0.0.1:端口" 后重试。',
  }
}

async function probeUrlWithProxy(url, proxy, timeoutMs) {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'dsh-agent-bridge-probe' },
      signal: AbortSignal.timeout(timeoutMs),
      // Node fetch 经 undici 支持 dispatcher 代理；简化：直接经代理网关环境变量不可行，改由 spawn curl 探测
    })
    return { ok: true, status: resp.status }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

export async function runClaude({ prompt, cwd, model, timeoutMs, signal, config, maxOutputChars }) {
  const prep = prepareClaude({ prompt, model, config })
  if (prep.error) {
    return { target: 'claude', ok: false, installed: false, error: prep.error }
  }
  // 预检（可跳过：config.skipApiProbe）
  if (!config.skipApiProbe) {
    const pf = await preflightClaude(config)
    if (!pf.ok) {
      return { target: 'claude', ok: false, installed: true, error: pf.error }
    }
  }

  const maxRetries = config.retryOnNetworkError ?? 1
  const started = Date.now()
  let last
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(2000 * attempt, 8000))
    }
    const env = { ...(process.env || {}) }
    // 代理注入：config.proxyUrl 优先，其次预检发现的系统代理
    const proxy = config.proxyUrl || detectSystemProxy()
    if (proxy) Object.assign(env, proxyEnv(proxy))
    try {
      const r = await runProcess(prep.bin, prep.args, { cwd, timeoutMs, signal, maxOutputChars, env })
      last = r
      const combined = (r.stdout || '') + '\n' + (r.stderr || '')
      const isNetworkFail = r.exitCode !== 0 && NETWORK_FAIL_PATTERN.test(combined)
      if (!isNetworkFail || attempt >= maxRetries) {
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
          ...(attempt > 0 ? { note: '网络错误后自动重试 ' + attempt + ' 次后成功' } : {}),
        }
      }
      // 网络失败且还有重试次数 -> 继续循环
    } catch (err) {
      if (signal && signal.aborted) throw err
      last = { exitCode: -2, stdout: '', stderr: String(err?.message || err) }
      if (attempt >= maxRetries) {
        return { target: 'claude', ok: false, installed: true, error: '启动 claude 失败: ' + last.stderr, durationMs: Date.now() - started }
      }
    }
  }
  const durationMs = Date.now() - started
  return {
    target: 'claude',
    ok: false,
    installed: true,
    exitCode: last?.exitCode,
    durationMs,
    stdout: last?.stdout || '',
    stderr: last?.stderr || '',
    error: 'claude 多次网络失败后放弃（最后一次 exit=' + last?.exitCode + '）',
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
