// Ghidra 环境探测 / 导入 / 常驻服务器生命周期
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { makeSpawnArgs, killPid, runProcess } from './run.js'
import { jsonRequest } from './socket.js'

function hasNonAscii(p) {
  return /[^\x00-\x7F]/.test(p)
}

const LOG4J_CONFIG =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Configuration status="WARN">\n' +
  '  <Appenders>\n' +
  '    <Console name="console" target="SYSTEM_OUT">\n' +
  '      <PatternLayout pattern="%d{ISO8601} %-5p %c{1} - %m%n"/>\n' +
  '    </Console>\n' +
  '    <File name="runlog" fileName="${sys:dsh.log4j.file}" append="false">\n' +
  '      <PatternLayout pattern="%d{ISO8601} %-5p %c{1} - %m%n"/>\n' +
  '    </File>\n' +
  '  </Appenders>\n' +
  '  <Loggers>\n' +
  '    <Logger name="org.apache" level="warn"/>\n' +
  '    <Root level="info">\n' +
  '      <AppenderRef ref="console"/>\n' +
  '      <AppenderRef ref="runlog"/>\n' +
  '    </Root>\n' +
  '  </Loggers>\n' +
  '</Configuration>\n'

export function detectGhidraHome(config) {
  const candidates = []
  if (config.ghidraHome) candidates.push(config.ghidraHome)
  candidates.push(
    'D:\\tools\\ghidra_12.1.3_PUBLIC',
    'D:\\配置文件\\ghidra_12.1.3_PUBLIC',
    'C:\\Program Files\\ghidra_12.1.3_PUBLIC',
    'C:\\Program Files (x86)\\ghidra_12.1.3_PUBLIC',
    'D:\\ghidra_12.1.3_PUBLIC'
  )
  for (const root of ['D:\\', 'D:\\tools', 'D:\\配置文件', 'C:\\Program Files', 'D:\\Program Files']) {
    try {
      for (const name of readdirSync(root)) {
        if (/^ghidra/i.test(name)) candidates.push(join(root, name))
      }
    } catch { /* 跳过 */ }
  }
  const ok = (c) => existsSync(join(c, 'support', 'analyzeHeadless.bat'))
  const ascii = candidates.find((c) => ok(c) && !hasNonAscii(c))
  const any = candidates.find(ok)
  const home = ascii || any
  return home ? { home, nonAscii: hasNonAscii(home) } : null
}

export function readVersion(home) {
  try {
    const text = readFileSync(join(home, 'Ghidra', 'application.properties'), 'utf8')
    const m = /application\.version=(.+)/.exec(text)
    const r = /application\.release\.name=(.+)/.exec(text)
    return { version: m ? m[1].trim() : '?', release: r ? r[1].trim() : '' }
  } catch {
    return { version: '?', release: '' }
  }
}

export function pyghidraInstalled(pythonVer) {
  try {
    const r = spawnSync('py', ['-' + pythonVer, '-c', 'import pyghidra'], { encoding: 'utf8', timeout: 20000, windowsHide: true })
    return r.status === 0
  } catch {
    return false
  }
}

export function envFor(home, nonAscii, tmpDir, logFile, pythonVer) {
  const env = { ...process.env, PY_PYTHON: pythonVer }
  if (nonAscii) {
    const dir = join(tmpDir, 'dsh-ghidra')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'log4j2.xml'), LOG4J_CONFIG)
    const opt = '-Dlog4j.configurationFile=' + join(dir, 'log4j2.xml') + ' -Ddsh.log4j.file=' + logFile
    env.GHIDRA_HEADLESS_JAVA_OPTIONS = opt
    env.PYGHIDRA_JAVA_OPTIONS = opt
  }
  return env
}

export function cleanLocks(projectDir, projectName) {
  // Ghidra 项目锁：进程异常退出后残留会阻塞后续启动
  for (const f of [projectName + '.lock', projectName + '.lock~']) {
    try { rmSync(join(projectDir, f), { force: true }) } catch { /* ignore */ }
  }
}

export function projectPaths(config) {
  const projectDir = config.ghidraProjectDir || join(tmpdir(), 'dsh-ghidra-projects')
  mkdirSync(projectDir, { recursive: true })
  return { projectDir, projectName: config.projectName || 'dsh' }
}

function markerFile(projectDir) {
  return join(projectDir, '.dsh-import.json')
}

function binaryStamp(p) {
  try {
    const st = statSync(p)
    return { size: st.size, mtimeMs: st.mtimeMs }
  } catch {
    return null
  }
}

export function needsImport(projectDir, binaryPath) {
  try {
    const m = JSON.parse(readFileSync(markerFile(projectDir), 'utf8'))
    if (m.binary !== binaryPath) return true
    const st = binaryStamp(binaryPath)
    return !st || m.size !== st.size || m.mtimeMs !== st.mtimeMs
  } catch {
    return true
  }
}

export async function importBinary(gh, binaryPath, config, onProgress) {
  const { projectDir, projectName } = projectPaths(config)
  cleanLocks(projectDir, projectName)
  if (!needsImport(projectDir, binaryPath)) {
    onProgress('项目已导入，跳过导入\n')
    return basename(binaryPath)
  }
  const headless = join(gh.home, 'support', 'analyzeHeadless.bat')
  const args = [projectDir, projectName, '-import', binaryPath, '-overwrite', '-analysisTimeoutPerFile', String(config.analysisTimeoutSec || 600)]
  const env = envFor(gh.home, gh.nonAscii, tmpdir(), join(projectDir, 'import.log'), config.pythonVer)
  onProgress('导入并分析 ' + basename(binaryPath) + '（首次可能耗时较长）\n')
  const r = await runProcess(headless, args, {
    cwd: projectDir,
    timeoutMs: (config.analysisTimeoutSec || 600) * 1000 + 120000,
    maxOutputChars: 50000,
    signal: undefined,
    env,
  })
  if (r.timedOut || r.exitCode !== 0) {
    throw new Error('导入失败 (exit=' + r.exitCode + '): ' + (r.stderr || r.stdout).slice(-800))
  }
  const st = binaryStamp(binaryPath)
  if (st) {
    try { writeFileSync(markerFile(projectDir), JSON.stringify({ binary: binaryPath, size: st.size, mtimeMs: st.mtimeMs })) } catch { /* ignore */ }
  }
  const summary = r.stdout.split('\n').filter((l) => /Import succeeded|Analysis succeeded|REPORT.*ERROR/i.test(l)).join('\n')
  onProgress((summary || r.stdout.slice(-400)) + '\n')
  return basename(binaryPath)
}

function writePythonSave(home, pythonVer) {
  const v = readVersion(home)
  const settingsDir = join(process.env.APPDATA || join(tmpdir(), 'appdata'), 'ghidra', 'ghidra_' + v.version + '_' + v.release)
  try {
    mkdirSync(settingsDir, { recursive: true })
    writeFileSync(join(settingsDir, 'python_command.save'), 'py\n-' + pythonVer + '\n')
  } catch { /* 写失败不致命 */ }
}

export async function startServer(gh, programName, config, onProgress) {
  const { projectDir, projectName } = projectPaths(config)
  cleanLocks(projectDir, projectName)
  const base = join(tmpdir(), 'dsh-ghidra')
  const scriptsDir = join(base, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  const scriptSrc = await readFile(fileURLToPath(new URL('../scripts/DecompileBridge.py', import.meta.url)), 'utf8')
  writeFileSync(join(scriptsDir, 'DecompileBridge.py'), scriptSrc)

  const portFile = join(base, 'port.txt')
  const logFile = join(base, 'bridge.log')
  try { rmSync(portFile, { force: true }) } catch { /* ignore */ }

  writePythonSave(gh.home, config.pythonVer)
  const env = envFor(gh.home, gh.nonAscii, tmpdir(), logFile, config.pythonVer)
  // 直接调用 pyghidra_launcher.py（绕过 pyghidraRun.bat 的 cmd 包装层，进程可追踪）
  const launcher = join(gh.home, 'Ghidra', 'Features', 'PyGhidra', 'support', 'pyghidra_launcher.py')
  const args = [launcher, gh.home, '-H', '--console', projectDir, projectName, '-process', programName, '-noanalysis',
    '-scriptPath', scriptsDir, '-postScript', 'DecompileBridge.py', portFile, logFile]

  onProgress('启动 Ghidra 服务器（JVM 初始化约 20-40 秒）...\n')
  // py 启动器是 exe，直接 spawn；taskkill /T /F 可整树清理
  const child = spawn('py', ['-' + config.pythonVer, ...args], { cwd: projectDir, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'], env })

  const startupMs = config.serverStartupTimeoutMs || 180000
  const deadline = Date.now() + startupMs
  let port = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      killPid(child.pid)
      throw new Error('Ghidra 服务器进程提前退出 (exit=' + child.exitCode + ')，日志: ' + logFile)
    }
    try {
      const text = readFileSync(portFile, 'utf8')
      const m = /\d+/.exec(text)
      if (m) { port = Number(m[0]); break }
    } catch { /* 还没写出来 */ }
    await sleep(700)
  }
  if (!port) {
    killPid(child.pid)
    throw new Error('Ghidra 服务器在 ' + Math.round(startupMs / 1000) + 's 内未就绪（未生成端口文件）')
  }
  try {
    await jsonRequest(port, { op: 'ping' }, 10000)
  } catch {
    killPid(child.pid)
    throw new Error('Ghidra 服务器 ping 失败（端口 ' + port + '）')
  }
  onProgress('服务器就绪，端口 ' + port + '\n')
  return { child, port, program: programName }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
