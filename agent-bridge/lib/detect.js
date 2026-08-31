// 探测本机安装的 agent 二进制
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export function findOnPath(name) {
  const cmd = process.platform === 'win32' ? 'where.exe' : 'which'
  let r
  try {
    r = spawnSync(cmd, [name], { encoding: 'utf8', windowsHide: true })
  } catch {
    return null
  }
  if (!r || r.status !== 0 || !r.stdout) return null
  const lines = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (!lines.length) return null
  // Windows 上优先 .cmd/.exe/.bat，避免 .ps1（不能直接 spawn）
  return lines.find((l) => /\.(cmd|exe|bat)$/i.test(l)) || lines[0]
}

export function versionOf(bin, args = ['--version']) {
  try {
    const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
    let r
    if (isCmd) {
      const line = '"' + bin + '"' + (args.length ? ' ' + args.map((a) => (/[\s"&|<>^()%!]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a)).join(' ') : '')
      r = spawnSync(line, { encoding: 'utf8', timeout: 15000, windowsHide: true, shell: true })
    } else {
      r = spawnSync(bin, args, { encoding: 'utf8', timeout: 15000, windowsHide: true })
    }
    if (!r || r.status !== 0) return null
    return (r.stdout || '').trim().split(/\r?\n/)[0] || null
  } catch {
    return null
  }
}

export function detectClaude(config) {
  if (config.claudeBin) return { path: config.claudeBin, source: 'config' }
  const p = findOnPath('claude')
  return p ? { path: p, source: 'path' } : null
}

export function detectCodex(config) {
  if (config.codexBin) return { path: config.codexBin, source: 'config' }
  const p = findOnPath('codex')
  return p ? { path: p, source: 'path' } : null
}

export function detectMarvisAgent(config) {
  if (config.marvisAgentExe) return { path: config.marvisAgentExe, source: 'config' }
  const roots = [
    'D:\\Program Files\\Tencent\\Marvis',
    'D:\\Program Files (x86)\\Tencent\\Marvis',
    'C:\\Program Files\\Tencent\\Marvis',
    'C:\\Program Files (x86)\\Tencent\\Marvis',
  ]
  let best = null
  let bestKey = null
  for (const root of roots) {
    const agentRoot = join(root, 'MarvisAgent')
    if (!existsSync(agentRoot)) continue
    let entries = []
    try { entries = readdirSync(agentRoot) } catch { continue }
    for (const ver of entries) {
      const exe = join(agentRoot, ver, 'MarvisAgent.exe')
      if (!existsSync(exe)) continue
      const key = ver.split('.').map((n) => parseInt(n, 10) || 0)
      if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        best = exe
        bestKey = key
      }
    }
  }
  return best ? { path: best, source: 'scan' } : null
}

export async function detectAgents(config) {
  const out = {}
  const claude = detectClaude(config)
  out.claude = claude
    ? { installed: true, path: claude.path, source: claude.source, version: versionOf(claude.path) }
    : { installed: false, error: '未找到 claude 命令；安装：npm install -g @anthropic-ai/claude-code 并登录' }
  const codex = detectCodex(config)
  out.codex = codex
    ? { installed: true, path: codex.path, source: codex.source, version: versionOf(codex.path) }
    : { installed: false, error: '未找到 codex 命令；安装：npm install -g @openai/codex 并登录（codex login）' }
  const marvis = detectMarvisAgent(config)
  out.marvis = marvis
    ? { installed: true, path: marvis.path, source: marvis.source }
    : { installed: false, error: '未找到 MarvisAgent.exe（扫描 D:/C: Program Files 下的 Tencent/Marvis/MarvisAgent）' }
  return out
}
