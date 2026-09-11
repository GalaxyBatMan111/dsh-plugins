// Locate WeChat mini-program packages (wxapkg) in the local WeChat cache.
// The glob roots mirror wedecode's own winGlob/macGlob/linuxGlob tables.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const APP_MAIN_PACKAGE_NAMES = ['__app__.wxapkg', 'app.wxapkg']

const WIN_ROOTS = [
  'C:/Users/*/weixin/WeChat Files',
  'C:/Users/*/Documents/WeChat Files/Applet',
  'C:/Users/*/Documents/xwechat_files',
  'C:/Users/*/AppData/Roaming/*/xwechat/radium/Applet/packages',
  'C:/Users/*/AppData/Roaming/*/xwechat/radium/users',
  'D:/WeChat Files/Applet',
  'E:/WeChat Files/Applet',
  'F:/WeChat Files/Applet',
]

const MAC_ROOTS = [
  '/Users/*/Library/Containers/*/Data/.wxapplet/packages',
  '/Users/*/Library/Containers/*/Data/Documents/app_data/radium/Applet/packages',
  '/Users/*/Library/Containers/*/Data/Documents/app_data/radium/users/*/applet/packages',
]

const LINUX_ROOTS = [
  '/home/*/.config/WeChat/Applet',
]

export function defaultScanRoots() {
  const p = os.platform()
  if (p === 'win32') return WIN_ROOTS.slice()
  if (p === 'darwin') return MAC_ROOTS.slice()
  if (p === 'linux') return LINUX_ROOTS.slice()
  return []
}

function expandGlob(pattern, budget) {
  const raw = pattern.replace(/\\/g, '/').replace(/\/+$/, '')
  let base = ''
  let rest = raw
  const drive = /^([A-Za-z]:)(\/.*)?$/.exec(raw)
  if (drive) {
    base = drive[1] + path.sep
    rest = (drive[2] || '').replace(/^\//, '')
  } else if (raw.startsWith('/')) {
    base = path.sep
    rest = raw.replace(/^\//, '')
  }
  const segs = rest.split('/').filter(Boolean)
  const out = []
  const walk = (dir, i) => {
    if (budget.n <= 0) return
    if (i >= segs.length) { budget.n--; out.push(dir); return }
    const seg = segs[i]
    if (seg === '*') {
      let entries = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        let isDir = e.isDirectory()
        if (!isDir && e.isSymbolicLink()) {
          try { isDir = fs.statSync(path.join(dir, e.name)).isDirectory() } catch { isDir = false }
        }
        if (isDir) walk(path.join(dir, e.name), i + 1)
      }
      return
    }
    walk(path.join(dir, seg), i + 1)
  }
  walk(base || '.', 0)
  return out
}

function findMainPackagesUnder(root, budget) {
  const found = []
  const stack = [{ dir: root, depth: 0 }]
  while (stack.length) {
    if (budget.n <= 0) break
    const cur = stack.pop()
    if (cur.depth > 8) continue
    let entries
    try { entries = fs.readdirSync(cur.dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (budget.n <= 0) break
      budget.n--
      const full = path.join(cur.dir, e.name)
      if (e.isDirectory()) { stack.push({ dir: full, depth: cur.depth + 1 }); continue }
      if (APP_MAIN_PACKAGE_NAMES.includes(e.name.toLowerCase())) found.push(full)
    }
  }
  return found
}

function isAppId(name) {
  return /^wx[0-9a-f]{16}$/i.test(name)
}

function nearestAppId(dir) {
  let cur = dir
  for (let i = 0; i < 4 && cur; i++) {
    const base = path.basename(cur)
    if (isAppId(base)) return base
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return ''
}

function dirStats(dir) {
  let bytes = 0
  let files = 0
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { const s = dirStats(full); bytes += s.bytes; files += s.files }
      else { try { bytes += fs.statSync(full).size; files++ } catch { /* ignore */ } }
    }
  } catch { /* unreadable */ }
  return { bytes, files }
}

/**
 * Scan the default WeChat cache roots (plus any extra roots) for mini-program packages.
 * Returns entries sorted newest-first.
 */
export function scanPackages(opts) {
  const o = opts || {}
  const roots = []
  for (const r of (o.extraRoots || [])) if (r && r.trim()) roots.push(r.trim())
  for (const r of defaultScanRoots()) roots.push(r)

  const seen = new Set()
  const packages = []
  const scannedRoots = []

  for (const root of roots) {
    const budget = { n: 20000 }
    for (const dir of expandGlob(root, budget)) {
      let exists = false
      try { exists = fs.statSync(dir).isDirectory() } catch { exists = false }
      if (!exists) continue
      scannedRoots.push(dir)
      const inner = { n: 40000 }
      for (const pkg of findMainPackagesUnder(dir, inner)) {
        const key = pkg.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const storagePath = path.dirname(pkg)
        let stat = null
        try { stat = fs.statSync(pkg) } catch { /* ignore */ }
        let dirStat = { bytes: 0, files: 0 }
        try { dirStat = dirStats(storagePath) } catch { /* ignore */ }
        let subPackages = 0
        try {
          for (const e of fs.readdirSync(storagePath)) if (e.toLowerCase().endsWith('.wxapkg')) subPackages++
        } catch { /* ignore */ }
        packages.push({
          appId: nearestAppId(storagePath) || path.basename(storagePath),
          wxapkgPath: pkg,
          storagePath,
          sizeBytes: stat ? stat.size : 0,
          dirBytes: dirStat.bytes,
          dirFiles: dirStat.files,
          subPackageCount: Math.max(0, subPackages - 1),
          mtimeMs: stat ? stat.mtimeMs : 0,
          mtime: stat ? new Date(stat.mtimeMs).toISOString() : null,
        })
      }
    }
  }
  packages.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const max = o.max && o.max > 0 ? o.max : 50
  return { packages: packages.slice(0, max), total: packages.length, scannedRoots }
}

export function latestPackage(opts) {
  const r = scanPackages(Object.assign({}, opts, { max: 1 }))
  return r.packages[0] || null
}
