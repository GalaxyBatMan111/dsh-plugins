// 网页适配器：trafilatura（正文提取）+ crawl4ai（LLM 抓取）+ single-file/monolith（网页复刻）
import { runProcess } from '../run.js'
import { detectTools, pyScriptsDir, npmGlobalDir, toolsRoot } from '../detect.js'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

async function exec(t, bin, args, opts, envExtra) {
  const r = await runProcess(bin, args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs, signal: opts.signal, maxOutputChars: opts.maxOutputChars, env: { ...(opts.env || {}), ...(envExtra || {}) } })
  return { ok: !r.timedOut && r.exitCode === 0, exitCode: r.exitCode, timedOut: r.timedOut, truncated: r.truncated, stdout: r.stdout, stderr: r.stderr }
}

// trafilatura：URL 正文提取（markdown 输出到 stdout）
export async function pageExtract(url, opts) {
  const t = detectTools(opts.config)
  if (!t.trafilatura || !t.trafilatura.toLowerCase().endsWith('trafilatura.exe')) return { ok: false, error: '未找到 trafilatura；预期位置: ' + pyScriptsDir() + '\\trafilatura.exe' }
  const r = await exec(t, t.trafilatura, ['-u', url, '--output-format', 'markdown'], opts)
  return { ...r, url }
}

// crawl4ai：LLM 友好抓取（markdown 结构化输出）
export async function crawlPage(url, opts) {
  const t = detectTools(opts.config)
  const script = fileURLToPath(new URL('../../scripts/crawl4ai_fetch.py', import.meta.url))
  const args = ['-' + t.crawlPy, script, url]
  const r = await exec(t, 'py', args, { ...opts, timeoutMs: opts.timeoutMs || 120000 })
  // 尝试解析脚本输出的 JSON
  let parsed = null
  try {
    const lines = r.stdout.split('\n').filter((l) => l.trim().startsWith('{'))
    if (lines.length) parsed = JSON.parse(lines[lines.length - 1])
  } catch { /* 解析失败则返回原始输出 */ }
  return { ...r, url, parsed }
}

function detectEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find((p) => existsSync(p)) || null
}

// single-file：网页复刻为单个 HTML（回退 monolith）
export async function clonePage(url, outFile, opts) {
  const t = detectTools(opts.config)
  const edge = detectEdge()
  if (t.singleFile) {
    const args = [url]
    if (outFile) args.push(outFile)
    const envExtra = edge ? { CHROME_PATH: edge } : {}
    const r = await exec(t, t.singleFile, args, opts, envExtra)
    return { ...r, engine: 'single-file', url }
  }
  if (t.monolith) {
    const args = [url]
    if (outFile) args.push('-o', outFile)
    const r = await exec(t, t.monolith, args, opts)
    return { ...r, engine: 'monolith', url }
  }
  return { ok: false, error: '未找到 single-file 或 monolith' }
}
