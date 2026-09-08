// 稳健性工具：文本消毒 / API 端点探测 / 系统代理发现
import { homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 清洗文本：去 ANSI 转义、控制字符、修复孤立代理项、限长
export function sanitizeText(s, maxLen = 5000) {
  if (typeof s !== 'string') return ''
  let t = s
    // ANSI CSI 序列（颜色/光标）
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // ANSI OSC 序列（标题等）
    .replace(/\x1b\][^\x07]*?(\x07|\x1b\\)/g, '')
    // 其余孤立 ESC
    .replace(/\x1b/g, '')
    // C0 控制字符（保留换行/回车/制表）
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  // 修复孤立代理项（高低代理不配对 -> U+FFFD）
  t = t
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])/g, '\ufffd')
    .replace(/(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd')
  if (t.length > maxLen) t = t.slice(0, maxLen) + '…[truncated]'
  return t
}

// 读 claude 的 ANTHROPIC_BASE_URL（settings.json env 或环境变量）
export function resolveClaudeBaseUrl() {
  if (process.env.ANTHROPIC_BASE_URL) return process.env.ANTHROPIC_BASE_URL
  try {
    const candidates = [
      join(homedir(), '.claude', 'settings.json'),
      join(homedir(), '.claude.json'),
    ]
    for (const p of candidates) {
      if (!existsSync(p)) continue
      const j = JSON.parse(readFileSync(p, 'utf8'))
      const env = j?.env || j?.settings?.env || {}
      if (typeof env.ANTHROPIC_BASE_URL === 'string' && env.ANTHROPIC_BASE_URL) {
        return env.ANTHROPIC_BASE_URL
      }
      if (typeof j.ANTHROPIC_BASE_URL === 'string' && j.ANTHROPIC_BASE_URL) return j.ANTHROPIC_BASE_URL
    }
  } catch { /* 配置不可读则跳过 */ }
  return null
}

// 探测端点可达性：服务器能响应（任意 HTTP 状态）即视为可达
export async function probeUrl(url, timeoutMs = 5000) {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'dsh-agent-bridge-probe' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: true, status: resp.status }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// 发现可用系统代理（git 全局代理 > HTTPS_PROXY 环境变量）
export function detectSystemProxy() {
  if (process.env.HTTPS_PROXY) return process.env.HTTPS_PROXY
  if (process.env.https_proxy) return process.env.https_proxy
  try {
    const r = spawnSync('git', ['config', '--global', '--get', 'http.proxy'], {
      encoding: 'utf8', timeout: 8000, windowsHide: true,
    })
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim()
  } catch { /* ignore */ }
  return null
}

// 带代理的请求环境（返回注入子进程的 env 扩展）
export function proxyEnv(proxyUrl) {
  return {
    HTTPS_PROXY: proxyUrl,
    HTTP_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    http_proxy: proxyUrl,
    all_proxy: proxyUrl,
  }
}
