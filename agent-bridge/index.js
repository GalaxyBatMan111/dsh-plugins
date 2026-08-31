// dsh-agent-bridge — 让 DSH 调用本机其他 AI 编码 agent（Claude Code / Codex / Marvis）
// 参考：dsh-plugin-dev 技能 references/tools.md（工具约定）
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from 'schemastery'
import { runClaude } from './lib/adapters/claude.js'
import { runCodex } from './lib/adapters/codex.js'
import { runMarvis } from './lib/adapters/marvis.js'
import { prepareClaude } from './lib/adapters/claude.js'
import { prepareCodex } from './lib/adapters/codex.js'
import { detectAgents } from './lib/detect.js'
import { AgentRun } from './lib/agent-run.js'

export const name = 'agent-bridge'
export const inject = ['tools', 'jobs']

export const Config = Schema.object({
  // 二进制路径覆盖（留空 = 自动探测）
  claudeBin: Schema.string().default(''),
  codexBin: Schema.string().default(''),
  marvisAgentExe: Schema.string().default(''),
  // Marvis 服务器工作模式：cloud=云端 / local=私有 / lite=轻量
  marvisWorkMode: Schema.union(['cloud', 'local', 'lite']).default('lite'),
  // 默认工作目录与超时
  defaultCwd: Schema.string().default(''),
  defaultTimeoutMs: Schema.number().default(900000),
  maxTimeoutMs: Schema.number().default(3600000),
  maxOutputChars: Schema.number().default(100000),
  // 流式：后台任务 + 增量输出（readOutput / job_output）
  stream: Schema.boolean().default(true),
  // 后台任务周期性向 agent 注入进度（毫秒；0 = 关闭）
  progressInjectMs: Schema.number().default(15000),
  // Claude Code 权限
  claudePermissionMode: Schema.union(['default', 'acceptEdits', 'plan', 'bypassPermissions']).default('acceptEdits'),
  claudeAllowedTools: Schema.array(Schema.string()).default([]),
  claudeDisallowedTools: Schema.array(Schema.string()).default([]),
  // Codex 自动批准
  codexFullAuto: Schema.boolean().default(true),
})

const callOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string' },
    jobId: { type: 'string' },
    label: { type: 'string' },
    target: { type: 'string' },
    ok: { type: 'boolean' },
    installed: { type: 'boolean' },
    exitCode: { type: 'integer' },
    timedOut: { type: 'boolean' },
    durationMs: { type: 'integer' },
    truncated: { type: 'boolean' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    result: { type: 'json' },
    error: { type: 'string' },
    note: { type: 'string' },
    port: { type: 'integer' },
    health: { type: 'json' },
    serverLog: { type: 'string' },
  },
}

function renderCall(_args, value) {
  const parts = []
  if (value.kind === 'background') {
    parts.push('后台任务已启动: ' + value.jobId + '（' + value.label + '）')
    parts.push('输出会流式进入该任务；完成后我会收到通知。可用 job_output 读取增量，job_kill 取消。')
    return [{ type: 'text', text: parts.join('\n') }]
  }
  let head = '目标=' + value.target + ' ok=' + value.ok
  if (value.durationMs != null) head += ' 耗时=' + (value.durationMs / 1000).toFixed(1) + 's'
  if (value.exitCode != null) head += ' exit=' + value.exitCode
  if (value.timedOut) head += ' [超时]'
  parts.push(head)
  if (value.error) parts.push('错误: ' + value.error)
  if (value.note) parts.push('说明: ' + value.note)
  if (value.stdout) parts.push('--- stdout ---\n' + value.stdout + (value.truncated ? '\n[输出已截断]' : ''))
  if (value.stderr) parts.push('--- stderr ---\n' + value.stderr)
  if (value.result && value.result.text) parts.push('--- 结果摘要 ---\n' + String(value.result.text).slice(0, 5000))
  return [{ type: 'text', text: parts.join('\n\n') }]
}

function renderStatus(_args, value) {
  const lines = ['外部 agent 状态:']
  for (const [key, a] of Object.entries(value.agents || {})) {
    if (a.installed) lines.push('  ' + key + ': 已安装 @ ' + a.path + (a.version ? ' (v' + a.version + ')' : ''))
    else lines.push('  ' + key + ': 未安装 (' + (a.error || '?') + ')')
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

// 前台同步执行（stream=false 或流式不可用时的回退）
async function runForeground(args, { cwd, timeoutMs, config }) {
  if (args.target === 'claude') {
    return runClaude({ prompt: args.prompt, cwd, model: args.model, timeoutMs, signal: null, config, maxOutputChars: config.maxOutputChars })
  }
  if (args.target === 'codex') {
    return runCodex({ prompt: args.prompt, cwd, model: args.model, timeoutMs, signal: null, config, maxOutputChars: config.maxOutputChars })
  }
  return runMarvis({ timeoutMs, signal: null, config })
}

// 后台流式执行：ctx.jobs.start 注册任务，立即返回 jobId 句柄
function startJob(ctx, args, { cwd, timeoutMs, config, exec }) {
  const label = args.target + ': ' + String(args.prompt).replace(/\s+/g, ' ').trim().slice(0, 80)
  const prep =
    args.target === 'claude' ? prepareClaude({ prompt: args.prompt, model: args.model, config })
    : prepareCodex({ prompt: args.prompt, model: args.model, config })
  if (prep.error) {
    return { kind: 'result', target: args.target, ok: false, installed: false, error: prep.error }
  }
  const jobId = ctx.jobs.start({
    kind: 'agent-bridge',
    label,
    owner: exec.agent,
    outputLimitBytes: config.maxOutputChars,
    run() {
      const run = new AgentRun({
        target: args.target,
        bin: prep.bin,
        args: prep.args,
        cwd,
        timeoutMs,
        agent: exec.agent,
        progressInjectMs: config.progressInjectMs,
        maxOutputChars: config.maxOutputChars,
      })
      return {
        cancel(reason) { run.cancel(reason) },
        done: run.done,
        readOutput() { return run.takeDelta() },
      }
    },
  })
  return { kind: 'background', jobId, label }
}

export function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: 'call_agent',
    description: '调用本机安装的其他 AI 编码 agent 执行一个任务（prompt），等待其完成后返回结果。' +
      'target=claude 调用 Claude Code（headless 模式 claude -p，权限模式可配置，默认 acceptEdits）；' +
      'target=codex 调用 OpenAI Codex CLI（codex exec 非交互模式）；' +
      'target=marvis 调用腾讯 Marvis（阶段1：MarvisAgent 服务器生命周期与健康检查）。' +
      'stream=true（默认）时任务以后台任务方式运行并流式返回输出：工具立即返回 { kind: "background", jobId }，' +
      '增量输出可经 job_output 读取，完成时会收到通知；stream=false 时同步等待完整结果。' +
      '适合：把子任务交给另一个 agent 独立完成、交叉验证、或使用其擅长的能力。' +
      '注意：被调用 agent 以本机用户身份运行，可能读写/执行文件，请按任务需要谨慎使用。',
    parameters: {
      target: {
        type: 'string',
        required: true,
        enum: ['claude', 'codex', 'marvis'],
        description: '要调用的 agent：claude | codex | marvis',
      },
      prompt: {
        type: 'string',
        required: true,
        description: '交给对方 agent 的任务描述（完整、自包含，最好包含工作目录、验收标准）',
      },
      cwd: {
        type: 'string',
        description: '对方 agent 的工作目录（绝对路径）。缺省用插件配置 defaultCwd，再缺省用当前工作目录',
      },
      model: {
        type: 'string',
        description: '模型覆盖（如 claude 的 sonnet/opus，codex 的 gpt-5 等）。可选',
      },
      timeoutMs: {
        type: 'integer',
        description: '等待上限（毫秒）。缺省用插件配置 defaultTimeoutMs，超过 maxTimeoutMs 会被钳制',
      },
      stream: {
        type: 'boolean',
        description: 'true（默认）= 后台任务流式输出，立即返回 jobId，增量经 job_output 读取；false = 同步等待完整结果',
      },
    },
    output: { schema: callOutputSchema, render: renderCall },
    async execute(args, exec) {
      const cwd = args.cwd || config.defaultCwd || process.cwd()
      const timeoutMs = Math.min(args.timeoutMs || config.defaultTimeoutMs, config.maxTimeoutMs)
      if (!args.prompt || !String(args.prompt).trim()) throw new Error('prompt 不能为空')
      const stream = args.stream === undefined ? config.stream : args.stream
      // marvis 阶段1 为快速检查，无需后台
      if (stream && args.target !== 'marvis') {
        try {
          return startJob(ctx, args, { cwd, timeoutMs, config, exec })
        } catch (err) {
          const res = await runForeground(args, { cwd, timeoutMs, config })
          return { ...res, kind: 'result', note: '后台任务不可用，已退回同步执行: ' + err.message }
        }
      }
      const res = await runForeground(args, { cwd, timeoutMs, config })
      return { ...res, kind: 'result' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_status',
    description: '检查本机安装了哪些外部 agent（Claude Code / Codex / Marvis）及其路径、版本，返回结构化清单。调用其他 agent 前可先用它确认可用性。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          agents: { type: 'json' },
        },
      },
      render: renderStatus,
    },
    async execute() {
      const agents = await detectAgents(config)
      return { ok: true, agents }
    },
  }))
}
