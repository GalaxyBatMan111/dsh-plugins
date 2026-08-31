// dsh-ghidra — 让 DSH 操作 Ghidra 反编译（常驻 PyGhidra 服务器 + TCP JSON-RPC）
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from 'schemastery'
import { basename } from 'node:path'
import { jsonRequest } from './lib/socket.js'
import { detectGhidraHome, readVersion, pyghidraInstalled, importBinary, startServer, projectPaths } from './lib/ghidra.js'
import { killPid } from './lib/run.js'

export const name = 'ghidra-bridge'
export const inject = ['tools', 'jobs']

export const Config = Schema.object({
  ghidraHome: Schema.string().default(''),
  ghidraProjectDir: Schema.string().default(''),
  projectName: Schema.string().default('dsh'),
  pythonVer: Schema.string().default('3.13'),
  analysisTimeoutSec: Schema.number().default(600),
  serverStartupTimeoutMs: Schema.number().default(180000),
  maxOutputChars: Schema.number().default(100000),
  stream: Schema.boolean().default(true),
})

const OUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string' },
    jobId: { type: 'string' },
    label: { type: 'string' },
    ok: { type: 'boolean' },
    error: { type: 'string' },
    note: { type: 'string' },
    port: { type: 'integer' },
    program: { type: 'string' },
    pid: { type: 'integer' },
    result: { type: 'json' },
  },
}

function render(_args, value) {
  const parts = []
  if (value.kind === 'background') {
    parts.push('后台任务已启动: ' + value.jobId + '（' + value.label + '）')
    parts.push('导入/分析进度会流式进入该任务；完成后我会收到通知，可 job_output 读取。')
    return [{ type: 'text', text: parts.join('\n') }]
  }
  parts.push('ok=' + value.ok + (value.port ? ' port=' + value.port : '') + (value.program ? ' program=' + value.program : ''))
  if (value.error) parts.push('错误: ' + value.error)
  const r = value.result
  if (r) {
    if (r.code) parts.push('--- 反编译 ---\n' + String(r.code).slice(0, 20000) + (String(r.code).length > 20000 ? '\n[已截断]' : ''))
    else if (r.list) parts.push('--- 列表 (' + r.total + ') ---\n' + JSON.stringify(r.list).slice(0, 8000))
    else parts.push('--- 结果 ---\n' + JSON.stringify(r).slice(0, 8000))
  }
  return [{ type: 'text', text: parts.join('\n\n') }]
}

export function apply(ctx, config) {
  // 服务器状态（每次插件实例一份）
  const state = { child: null, port: null, program: null }

  const killServer = () => {
    if (state.child) { killPid(state.child.pid); state.child = null; state.port = null; state.program = null }
  }
  // 插件卸载时自动关服务器
  ctx.effect(() => () => killServer())

  const gh = detectGhidraHome(config)

  async function socketOp(payload, timeoutMs) {
    if (!state.port) throw new Error('Ghidra 服务器未运行，请先调用 ghidra_open')
    const resp = await jsonRequest(state.port, payload, timeoutMs || 30000)
    if (!resp.ok) throw new Error('Ghidra 操作失败: ' + (resp.error || '未知错误'))
    return resp.result
  }

  // 打开流程：导入（如需）→ 启动服务器 → info
  async function openFlow(binaryPath, onProgress) {
    if (!gh) throw new Error('未找到 Ghidra 安装（需含 support/analyzeHeadless.bat）；可用配置 ghidraHome 指定')
    const v = readVersion(gh.home)
    onProgress('Ghidra ' + v.version + ' @ ' + gh.home + '\n')
    if (!pyghidraInstalled(config.pythonVer)) {
      throw new Error('Python ' + config.pythonVer + ' 未安装 pyghidra；请执行: py -' + config.pythonVer + ' -m pip install pyghidra')
    }
    killServer()
    const program = await importBinary(gh, binaryPath, config, onProgress)
    const srv = await startServer(gh, program, config, onProgress)
    state.child = srv.child
    state.port = srv.port
    state.program = srv.program
    const info = await socketOp({ op: 'info' }, 30000)
    return { ok: true, port: srv.port, program: srv.program, pid: srv.child.pid, result: info }
  }

  // 后台任务版 open（流式）
  function startOpenJob(binaryPath, exec) {
    const label = 'ghidra: ' + basename(binaryPath)
    const buf = { text: '', pos: 0 }
    const push = (s) => { buf.text = (buf.text + s).slice(-config.maxOutputChars) }
    const jobId = ctx.jobs.start({
      kind: 'ghidra-open',
      label,
      owner: exec && exec.agent ? exec.agent : null,
      outputLimitBytes: config.maxOutputChars,
      run() {
        const done = (async () => {
          try {
            const res = await openFlow(binaryPath, push)
            push('[agent-bridge] === 服务器就绪 === port=' + res.port + ' program=' + res.program)
            return { status: 'completed', detail: 'port ' + res.port }
          } catch (e) {
            push('失败: ' + e.message)
            killServer()
            return { status: 'failed', detail: e.message }
          }
        })()
        return {
          cancel(reason) { push('已取消: ' + reason); killServer() },
          done,
          readOutput() {
            const delta = buf.text.slice(buf.pos)
            buf.pos = buf.text.length
            return delta
          },
        }
      },
    })
    return { kind: 'background', jobId, label }
  }

  // ---- 工具注册 ----

  ctx.tools.register(defineTool({
    name: 'ghidra_status',
    description: '检查 Ghidra 安装（路径/版本）、Python+pyghidra 是否就绪、桥接服务器是否在运行。调用其他 ghidra_* 工具前可先确认。',
    parameters: {},
    output: { schema: OUT, render },
    async execute() {
      return {
        ok: true,
        result: {
          ghidra: gh ? { home: gh.home, version: readVersion(gh.home), nonAscii: gh.nonAscii } : null,
          pyghidra: pyghidraInstalled(config.pythonVer) ? { pythonVer: config.pythonVer, installed: true } : { pythonVer: config.pythonVer, installed: false },
          server: state.port ? { running: true, port: state.port, program: state.program } : { running: false },
        },
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_open',
    description: '打开一个二进制文件：首次自动导入到 Ghidra 项目并完整分析，然后启动常驻桥接服务器；之后 ghidra_decompile / ghidra_functions / ghidra_strings / ghidra_xrefs / ghidra_info 均为毫秒级。stream=true（默认）时以后台任务方式运行（导入分析可能耗时数分钟，输出流式可见）；stream=false 则同步等待。同一时刻只服务一个程序。',
    parameters: {
      binaryPath: { type: 'string', required: true, description: '要分析的二进制文件绝对路径（PE/ELF/Mach-O 等）' },
      stream: { type: 'boolean', description: 'true（默认）= 后台任务流式；false = 同步等待' },
      timeoutMs: { type: 'integer', description: '等待上限（毫秒），仅同步模式生效' },
    },
    output: { schema: OUT, render },
    async execute(args, exec) {
      if (!args.binaryPath || !args.binaryPath.trim()) throw new Error('binaryPath 不能为空')
      const stream = args.stream === undefined ? config.stream : args.stream
      if (stream) {
        try {
          return startOpenJob(args.binaryPath, exec)
        } catch (e) {
          // jobs 不可用时退回同步
          const res = await openFlow(args.binaryPath, () => {})
          return { ...res, note: '后台任务不可用，已同步执行: ' + e.message }
        }
      }
      return openFlow(args.binaryPath, () => {})
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_info',
    description: '返回当前已打开程序的概要信息：语言/编译器/镜像基址/内存块/函数数/符号数/入口点。',
    parameters: {},
    output: { schema: OUT, render },
    async execute() { return { ok: true, result: await socketOp({ op: 'info' }) } },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_decompile',
    description: '反编译指定函数为 C 伪代码。target 可以是函数名（如 main、FUN_140001008）或十六进制地址（如 0x140001008）。',
    parameters: {
      target: { type: 'string', required: true, description: '函数名或十六进制地址' },
    },
    output: { schema: OUT, render },
    async execute(args) {
      if (!args.target || !args.target.trim()) throw new Error('target 不能为空')
      return { ok: true, result: await socketOp({ op: 'decompile', target: args.target }, 120000) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_functions',
    description: '列出程序中的函数（名称/地址/大小/thunk）。filter 按名称子串过滤；sort=name 按名称排序；max 限制条数（默认 200）。',
    parameters: {
      filter: { type: 'string', description: '按名称包含的子串过滤（可选）' },
      sort: { type: 'string', enum: ['name'], description: '排序方式（可选，目前仅 name）' },
      max: { type: 'integer', description: '最多返回条数，默认 200' },
    },
    output: { schema: OUT, render },
    async execute(args) {
      return { ok: true, result: await socketOp({ op: 'functions', ...(args.filter ? { filter: args.filter } : {}), ...(args.sort ? { sort: args.sort } : {}), ...(args.max ? { max: args.max } : {}) }) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_strings',
    description: '列出程序中的已定义字符串。filter 按内容包含过滤；minLength 最短长度（默认 4）；max 条数（默认 200）。',
    parameters: {
      filter: { type: 'string', description: '按字符串内容包含的子串过滤（可选）' },
      minLength: { type: 'integer', description: '最短长度，默认 4' },
      max: { type: 'integer', description: '最多返回条数，默认 200' },
    },
    output: { schema: OUT, render },
    async execute(args) {
      return { ok: true, result: await socketOp({ op: 'strings', ...(args.filter ? { filter: args.filter } : {}), ...(args.minLength ? { minLength: args.minLength } : {}), ...(args.max ? { max: args.max } : {}) }) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_xrefs',
    description: '查询对某函数/地址的交叉引用。direction=to 查谁引用了它（默认），from 查它引用了谁；max 条数（默认 100）。',
    parameters: {
      target: { type: 'string', required: true, description: '函数名或十六进制地址' },
      direction: { type: 'string', enum: ['to', 'from'], description: 'to=被谁引用（默认），from=引用了谁' },
      max: { type: 'integer', description: '最多返回条数，默认 100' },
    },
    output: { schema: OUT, render },
    async execute(args) {
      if (!args.target || !args.target.trim()) throw new Error('target 不能为空')
      return { ok: true, result: await socketOp({ op: 'xrefs', target: args.target, direction: args.direction || 'to', ...(args.max ? { max: args.max } : {}) }) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ghidra_close',
    description: '关闭 Ghidra 桥接服务器并释放项目锁（强杀整个进程树）。切换分析目标前先调用它。',
    parameters: {},
    output: { schema: OUT, render },
    async execute() {
      const was = state.port ? { port: state.port, program: state.program } : null
      if (state.port) {
        try { await jsonRequest(state.port, { op: 'shutdown' }, 5000) } catch { /* ignore */ }
      }
      killServer()
      return { ok: true, result: { closed: !!was, was: was } }
    },
  }))
}
