// Structural analysis of a decompiled WeChat mini-program project.
// Pure Node, no dependencies: reads the restored tree and summarizes it.
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', '.github', '.husky', '.devcontainer', '.vscode'])
const MAX_SCAN_BYTES = 4 * 1024 * 1024

function walk(root, maxFiles) {
  const out = []
  const stack = [root]
  let budget = maxFiles || 30000
  while (stack.length && budget > 0) {
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (budget <= 0) break
      budget--
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        stack.push(full)
      } else if (e.isFile()) {
        let size = 0
        try { size = fs.statSync(full).size } catch { /* ignore */ }
        out.push({ path: full, rel: path.relative(root, full).replace(/\\/g, '/'), ext: path.extname(e.name).toLowerCase(), size })
      }
    }
  }
  return out
}

function readText(p, cap) {
  try {
    const st = fs.statSync(p)
    if (st.size > (cap || MAX_SCAN_BYTES)) return null
    return fs.readFileSync(p, 'utf8')
  } catch { return null }
}

function readJson(p) {
  const t = readText(p, 8 * 1024 * 1024)
  if (!t) return null
  try { return JSON.parse(t) } catch { return null }
}

function detectTech(root, files) {
  const rel = new Set(files.map((f) => f.rel))
  const signals = []
  const uiLibs = new Set()
  let framework = 'unknown'
  let confidence = 'low'

  const hasUniRuntime = rel.has('common/vendor.js') && rel.has('common/main.js')
  if (hasUniRuntime) {
    framework = 'uni-app (Vue)'
    confidence = 'high'
    signals.push('common/vendor.js + common/main.js present (uni-app webpack runtime)')
  } else if (rel.has('app.js') && rel.has('app.json')) {
    framework = 'native WeChat mini-program'
    confidence = 'medium'
    signals.push('app.js + app.json present, no uni-app runtime found')
  }

  for (const f of files) {
    if (f.ext !== '.json') continue
    if (f.rel.endsWith('project.config.json') || f.rel.endsWith('project.private.config.json')) {
      const j = readJson(f.path)
      if (j && j.miniprogramRoot !== undefined) signals.push('project.config.json miniprogramRoot=' + j.miniprogramRoot)
    }
  }

  const uniMods = files.filter((f) => f.rel.startsWith('uni_modules/')).map((f) => f.rel.split('/')[1])
  for (const m of new Set(uniMods)) if (m) uiLibs.add(m)

  for (const f of files) {
    const b = path.basename(f.rel)
    if (/^uv-/.test(b)) uiLibs.add('uview-plus')
    if (b === 'mp-html.js' || f.rel.includes('mp-html/')) uiLibs.add('mp-html')
  }

  const vendor = files.find((f) => f.rel === 'common/vendor.js')
  if (vendor) {
    const t = readText(vendor.path, 3 * 1024 * 1024)
    if (t) {
      const m = /Vue\.version\s*=\s*["']([0-9.]+)["']/.exec(t) || /version\s*=\s*["']([0-9]+\.[0-9]+\.[0-9]+)["'][^]{0,40}Vue/.exec(t)
      if (m) signals.push('embedded Vue version marker: ' + m[1])
      if (t.includes('__webpack_require__')) signals.push('webpack module runtime present (compiled bundle)')
    }
  }
  return { framework, confidence, signals, uiLibs: Array.from(uiLibs).sort() }
}

function normalizeVariant(v) {
  if (!v) return null
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join(',')
  if (typeof v === 'object') {
    if (typeof v.default === 'string') return v.default
    if (Array.isArray(v.allUsed)) return v.allUsed.join(',')
  }
  return null
}

function extractMeta(root, files) {
  const meta = { name: null, version: null, siteUrl: null, projectName: null, libVersion: null, renderer: null, componentFramework: null, entryPagePath: null, appId: null }

  for (const f of files) {
    if (f.ext !== '.js') continue
    if (f.rel.includes('/')) continue
    if (f.size > 4096) continue
    const t = readText(f.path, 8192)
    if (!t) continue
    const name = /name\s*:\s*["']([^"']{1,60})["']/.exec(t)
    const ver = /version\s*:\s*["']([0-9][^"']{0,20})["']/.exec(t)
    const site = /siteurl\s*:\s*["'](https?:\/\/[^"']+)["']/.exec(t)
    if (name || ver || site) {
      meta.name = meta.name || (name ? name[1] : null)
      meta.version = meta.version || (ver ? ver[1] : null)
      meta.siteUrl = meta.siteUrl || (site ? site[1] : null)
      meta.metaFile = meta.metaFile || f.rel
    }
  }

  const pc = readJson(path.join(root, 'project.config.json')) || readJson(path.join(root, 'project.private.config.json'))
  if (pc) {
    meta.projectName = pc.projectname || meta.projectName
    meta.libVersion = pc.libVersion || meta.libVersion
    meta.appId = pc.appid || meta.appId
  }

  const cfg = readJson(path.join(root, 'app-config.json'))
  if (cfg) {
    meta.renderer = normalizeVariant(cfg.renderer)
    meta.componentFramework = normalizeVariant(cfg.componentFramework)
    meta.entryPagePath = cfg.entryPagePath || null
  }
  return meta
}

function extractRoutes(root, files) {
  const appJson = readJson(path.join(root, 'app.json')) || {}
  const cfg = readJson(path.join(root, 'app-config.json')) || {}
  const pages = Array.isArray(appJson.pages) ? appJson.pages.slice() : []
  const subPackages = Array.isArray(appJson.subPackages) ? appJson.subPackages.map((s) => ({ root: s.root, name: s.name || null, pages: (s.pages || []).map((p) => (s.root || '') + p) })) : []
  const tb = appJson.tabBar || null
  const tabBar = tb ? { custom: !!tb.custom, list: (tb.list || []).map((i) => ({ text: i.text, pagePath: i.pagePath })) } : null

  const pageTitles = {}
  const cfgPages = cfg.page || {}
  for (const k of Object.keys(cfgPages)) {
    const w = cfgPages[k] && cfgPages[k].window
    if (w && w.navigationBarTitleText) pageTitles[k.replace(/\.html$/, '')] = w.navigationBarTitleText
  }
  if (!pages.length && Array.isArray(cfg.pages)) for (const p of cfg.pages) pages.push(p)

  const present = new Set(files.filter((f) => f.ext === '.wxml').map((f) => f.rel.replace(/\.wxml$/, '')))
  const missing = []
  const all = pages.concat(subPackages.flatMap((s) => s.pages))
  for (const p of all) {
    const norm = p.replace(/^\.?\//, '')
    if (!present.has(norm) && !present.has(norm + '/index')) missing.push(p)
  }

  return {
    entryPagePath: appJson.entryPagePath || cfg.entryPagePath || null,
    pageCount: all.length,
    pages,
    subPackages,
    tabBar,
    pageTitles,
    pagesWithoutMarkup: missing,
  }
}

function extractAds(root, files) {
  const adFiles = []
  const unitIds = new Set()
  let count = 0
  for (const f of files) {
    if (f.ext !== '.wxml') continue
    const t = readText(f.path, 1024 * 1024)
    if (!t) continue
    const re = /<ad\b[^>]*>/g
    let m
    let hit = 0
    while ((m = re.exec(t)) !== null) {
      count++
      hit++
      const u = /unitId\s*=\s*"([^"]*)"/.exec(m[0])
      if (u) unitIds.add(u[1])
    }
    if (hit) adFiles.push({ file: f.rel, count: hit })
  }
  return { count, files: adFiles, unitIds: Array.from(unitIds) }
}

function extractEndpoints(root, files, routes) {
  const urls = new Set()
  const apis = new Set()
  const routeSet = new Set()
  for (const p of (routes && routes.pages) || []) routeSet.add(String(p).replace(/^\.?\//, ''))
  for (const sp of (routes && routes.subPackages) || []) for (const p of sp.pages || []) routeSet.add(String(p).replace(/^\.?\//, ''))
  const isPageRoute = (c) => {
    for (const r of routeSet) if (r === c || r.endsWith('/' + c)) return true
    return false
  }
  const urlRe = /https?:\/\/[A-Za-z0-9._~:\/?#\[\]@!$&'()*+,;=%-]{4,200}/g
  const apiRe = /["']((?:api|user|order|pay|shop|goods|vip|team|wallet|login|invite|article|subject|prompt|hand|sms|coupon|agent|money|withdraw|resource|course|cdkey|ad|config|share)[a-z0-9_]*(?:\/[a-z0-9_]+)+)["']/gi
  const interesting = ['.js', '.json', '.wxml']
  for (const f of files) {
    if (!interesting.includes(f.ext)) continue
    if (f.size > 3 * 1024 * 1024) continue
    if (f.rel.startsWith('uni_modules/')) continue
    const t = readText(f.path, 3 * 1024 * 1024)
    if (!t) continue
    let m
    while ((m = urlRe.exec(t)) !== null) {
      const u = m[0].replace(/[),.;]+$/, '')
      if (/w3\.org|uniapp\.dcloud|github\.com|npmjs|schema|example\.com/.test(u)) continue
      urls.add(u)
      if (urls.size > 80) break
    }
    urlRe.lastIndex = 0
    while ((m = apiRe.exec(t)) !== null) {
      if (!isPageRoute(m[1])) apis.add(m[1])
      if (apis.size > 120) break
    }
    apiRe.lastIndex = 0
  }
  return { urls: Array.from(urls).sort(), apis: Array.from(apis).sort() }
}

function extractTheme(root, files) {
  const colors = new Set()
  const sources = []
  const hexRe = /#([0-9a-fA-F]{6})\b/g
  for (const f of files) {
    if (f.ext !== '.json' && f.ext !== '.wxml' && f.ext !== '.wxss') continue
    if (f.size > 512 * 1024) continue
    const t = readText(f.path, 512 * 1024)
    if (!t) continue
    if (/theme_config|maincolor|subcolor/i.test(t)) {
      sources.push(f.rel)
      let m
      while ((m = hexRe.exec(t)) !== null) { colors.add('#' + m[1].toLowerCase()); if (colors.size > 40) break }
    }
  }
  return { colors: Array.from(colors).sort(), sources: sources.slice(0, 20) }
}

function extractPrivacy(root, files) {
  const appJson = readJson(path.join(root, 'app.json')) || {}
  let agreeHandler = false
  const filesWithPopup = []
  for (const f of files) {
    if (f.ext !== '.wxml') continue
    const t = readText(f.path, 1024 * 1024)
    if (!t) continue
    if (t.includes('agreePrivacyAuthorization')) { agreeHandler = true; filesWithPopup.push(f.rel) }
  }
  return { enabled: appJson.__usePrivacyCheck__ === true || agreeHandler, agreeHandler, files: filesWithPopup }
}

function detectStubs(root, files) {
  const stubRe = /^\s*Page\(\s*\{\s*data:\s*\{\s*\}\s*\}\s*\)\s*;?\s*$/
  const stubs = []
  for (const f of files) {
    if (f.ext !== '.js') continue
    if (f.size > 200) continue
    const t = readText(f.path, 4096)
    if (t && stubRe.test(t)) stubs.push(f.rel)
  }
  stubs.sort()
  return stubs
}

export function analyzeProject(root, opts) {
  const o = opts || {}
  const st = (() => { try { return fs.statSync(root) } catch { return null } })()
  if (!st || !st.isDirectory()) throw new Error('not a directory: ' + root)

  const files = walk(root, o.maxFiles)
  const byExt = {}
  const byDir = {}
  let bytes = 0
  for (const f of files) {
    byExt[f.ext || '(none)'] = (byExt[f.ext || '(none)'] || 0) + 1
    bytes += f.size
    const top = f.rel.includes('/') ? f.rel.split('/')[0] : '(root)'
    byDir[top] = (byDir[top] || 0) + 1
  }

  const routes = extractRoutes(root, files)
  const tech = detectTech(root, files)
  const meta = extractMeta(root, files)
  const ads = extractAds(root, files)
  const endpoints = extractEndpoints(root, files, routes)
  const theme = extractTheme(root, files)
  const privacy = extractPrivacy(root, files)
  const stubs = detectStubs(root, files)

  const notes = []
  if (stubs.length) notes.push(stubs.length + ' page script(s) are empty Page({ data: {} }) stubs - that code was NOT restored (commonly subpackage pages).')
  if (routes.pagesWithoutMarkup.length) notes.push(routes.pagesWithoutMarkup.length + ' declared route(s) have no .wxml in the output.')
  if (routes.subPackages.length) notes.push('Subpackages: ' + routes.subPackages.map((s) => s.root).join(', '))
  if (meta.siteUrl) notes.push('Backend site declared in package meta: ' + meta.siteUrl)

  const biggest = files.slice().sort((a, b) => b.size - a.size).slice(0, 10).map((f) => ({ file: f.rel, bytes: f.size }))

  return {
    root,
    meta,
    tech,
    counts: { files: files.length, bytes, byExt, byDir },
    routes,
    ads,
    privacy,
    endpoints,
    theme,
    quality: { stubPages: stubs, notes, largestFiles: biggest },
  }
}

function kb(n) { return (Math.round((n / 1024) * 10) / 10) + ' KB' }

export function renderAnalysis(a) {
  const L = []
  L.push('项目: ' + a.root)
  L.push('规模: ' + a.counts.files + ' 个文件 / ' + kb(a.counts.bytes))
  L.push('')
  L.push('## 身份与技术栈')
  L.push('- 名称: ' + (a.meta.name || '(未知)') + (a.meta.version ? '  v' + a.meta.version : ''))
  if (a.meta.siteUrl) L.push('- 站点: ' + a.meta.siteUrl)
  if (a.meta.metaFile) L.push('- 元信息来源: ' + a.meta.metaFile)
  L.push('- 框架: ' + a.tech.framework + ' (置信度 ' + a.tech.confidence + ')')
  if (a.tech.signals.length) L.push('- 依据: ' + a.tech.signals.join('; '))
  if (a.tech.uiLibs.length) L.push('- UI 库/模块: ' + a.tech.uiLibs.join(', '))
  if (a.meta.renderer) L.push('- renderer: ' + a.meta.renderer)
  if (a.meta.componentFramework) L.push('- componentFramework: ' + a.meta.componentFramework)
  if (a.meta.libVersion) L.push('- 基础库: ' + a.meta.libVersion)
  L.push('')
  L.push('## 路由')
  L.push('- 入口页: ' + (a.routes.entryPagePath || '(未声明)'))
  L.push('- 页面总数: ' + a.routes.pageCount)
  if (a.routes.tabBar) {
    L.push('- tabBar: ' + (a.routes.tabBar.custom ? '自定义(custom)' : '系统默认') + ' -> ' + a.routes.tabBar.list.map((i) => i.text).join(' / '))
  }
  for (const s of a.routes.subPackages) L.push('- 分包 ' + s.root + ': ' + s.pages.length + ' 页')
  const titled = Object.keys(a.routes.pageTitles)
  if (titled.length) L.push('- 页面标题样例: ' + titled.slice(0, 8).map((k) => { const seg = k.split('/'); return seg.slice(-2).join('/') + '=' + a.routes.pageTitles[k] }).join(', '))
  L.push('')
  L.push('## 能力与集成')
  L.push('- 广告位: ' + a.ads.count + ' 处' + (a.ads.unitIds.length ? '  unitId=' + a.ads.unitIds.join(',') : ''))
  L.push('- 隐私弹窗: ' + (a.privacy.enabled ? '有' : '无') + (a.privacy.agreeHandler ? ' (agreePrivacyAuthorization)' : ''))
  if (a.theme.colors.length) L.push('- 主题色(采样): ' + a.theme.colors.slice(0, 12).join(' '))
  if (a.endpoints.urls.length) {
    L.push('- 外链/主机 (' + a.endpoints.urls.length + '):')
    for (const u of a.endpoints.urls.slice(0, 12)) L.push('    ' + u)
  }
  if (a.endpoints.apis.length) {
    L.push('- 疑似接口路径 (' + a.endpoints.apis.length + '):')
    for (const p of a.endpoints.apis.slice(0, 24)) L.push('    ' + p)
  }
  L.push('')
  L.push('## 文件分布')
  const exts = Object.keys(a.counts.byExt).sort((x, y) => a.counts.byExt[y] - a.counts.byExt[x])
  L.push('- ' + exts.map((e) => e + ':' + a.counts.byExt[e]).join('  '))
  if (a.quality.largestFiles.length) {
    L.push('- 最大文件: ' + a.quality.largestFiles.slice(0, 5).map((f) => f.file + ' (' + kb(f.bytes) + ')').join(', '))
  }
  L.push('')
  L.push('## 还原质量提示')
  if (!a.quality.notes.length) L.push('- 未发现明显缺口')
  for (const n of a.quality.notes) L.push('- ' + n)
  if (a.quality.stubPages.length) {
    L.push('- 空壳页面清单: ' + a.quality.stubPages.slice(0, 30).join(', ') + (a.quality.stubPages.length > 30 ? ' ...' : ''))
  }
  return L.join('\n')
}
