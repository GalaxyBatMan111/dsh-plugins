# dsh-agent-bridge

让 DeepSeek Harness（DSH）直接调用你本机安装的其他 AI 编码 agent：
Claude Code、Codex、腾讯 Marvis。

只装 DSH 这一侧即可：外部 agent 对插件来说只是命令行程序，它们不需要安装任何东西、
也不需要知道是谁在调用。调用方向是单向的（DSH → 外部 agent）。

## 它提供什么工具

| 工具 | 作用 |
| --- | --- |
| call_agent | 调用指定 agent 执行一个任务（prompt），流式或同步返回结果 |
| agent_status | 检查本机各 agent 的安装状态、路径、版本 |

call_agent 参数：

- target: claude | codex | marvis
- prompt: 交给对方 agent 的任务描述（建议自包含：目标、工作目录、验收标准）
- cwd: 对方 agent 的工作目录（可选，缺省用配置 defaultCwd）
- model: 模型覆盖（可选）
- timeoutMs: 等待上限（可选，缺省 15 分钟，上限可配）
- stream: true（默认）= 后台任务流式输出；false = 同步等待完整结果

## 流式输出（默认开启）

长任务不必干等：

1. 调用返回后立即得到任务句柄：{ kind: "background", jobId }，GUI 的任务面板可见该任务
2. 任务运行期间，输出按增量流式累积——可以用 job_output 随时读取最新片段，
   界面/会话里能看到进度（还有配置 progressInjectMs 的周期性进度注入）
3. 任务完成时 DSH 会自动收到完成通知（含 jobId 与最终状态），再 job_output 取完整输出
4. 想中途停掉：job_kill（会强杀整个进程树）

任务的生命周期（超时、取消、所属 agent 销毁）都由 DSH 的 jobs 服务管理；
若后台任务机制不可用，call_agent 会自动退回同步模式并在结果里注明。

## 安装

    # 在 DSH Desktop 的 profile 中安装本 bundle（dsh CLI 由桌面版自带）
    & "$env:APPDATADSH Desktophost-commandsdesktopindsh.cmd" plugin --profile desktop add D:插件研发agent-bridge

然后重启 DSH Desktop 应用（插件在启动时加载）。重启后新会话里就能看到
call_agent / agent_status 工具。

## 各适配器说明

### Claude Code（已就绪）
- 以 headless 模式调用：claude -p <prompt> --output-format json，解析结构化结果。
- 权限模式默认 acceptEdits（允许改文件、不允许跑 shell），可配置为
  bypassPermissions / plan / default。
- 首次使用前请先在终端运行一次 claude 完成登录/信任设置。

### Codex（代码已就绪，需先安装 CLI）
- npm install -g @openai/codex，然后 codex login。
- 以 codex exec <prompt> --json 非交互模式调用；默认 --full-auto 自动批准
  （可配置 codexFullAuto: false）。
- 安装后重启 DSH 桌面端即可使用。

### Marvis（阶段1：服务器生命周期）
- 腾讯 Marvis 的 agent 核心是 MarvisAgent.exe（Sanic + Socket.IO 服务器，带
  /agent namespace）。它没有公开的"一句话调 agent" CLI。
- 当前阶段：插件自动探测 MarvisAgent.exe → 临时目录启动服务器
  （--transport websocket --work_mode <cloud|local|lite>）→ 读取端口文件 →
  GET /health 健康检查 → 关闭服务器。
- 阶段2（规划）：接入 Socket.IO /agent 协议，实现真正的 agent 对话。
- 注：MarvisMCP.exe 只暴露 send_file（传文件到手机），且需要腾讯 UAL 凭证，
  不是 agent 调用入口。

## 配置（可选）

在 profile 的 cordis.patch.yml 覆盖：

    - id: agent-bridge
      name: dsh-agent-bridge
      config:
        stream: true                            # 默认流式（后台任务）
        progressInjectMs: 15000                 # 进度注入间隔（毫秒，0=关闭）
        claudePermissionMode: bypassPermissions # 完全放权（谨慎）
        codexFullAuto: false                    # 关闭 codex 自动批准
        defaultTimeoutMs: 1800000               # 默认 30 分钟
        maxTimeoutMs: 7200000                   # 上限 2 小时
        maxOutputChars: 100000                  # 输出上限（字符）
        defaultCwd: 'D:work'                   # 默认工作目录
        claudeBin: ''                           # 手动指定二进制路径（留空=自动探测）
        codexBin: ''
        marvisAgentExe: ''
        marvisWorkMode: lite                    # cloud | local | lite
        claudeAllowedTools: []                  # 额外允许的工具（如 Bash）
        claudeDisallowedTools: []

## 安全提示

- 被调用的 agent 以本机用户身份运行，可能读写文件、执行命令。默认配置是
  Claude 只允许改文件、Codex 全自动——请按你的信任度调整。
- 插件不会把 prompt/输出发送到除目标 agent 之外的任何地方。
- 超时（timeoutMs）、job_kill 取消、会话销毁都会强杀整个进程树。

## 卸载

    & "$env:APPDATADSH Desktophost-commandsdesktopindsh.cmd" plugin --profile desktop remove dsh-agent-bridge

## 目录结构

    agent-bridge/
    ├── package.json          # dsh.bundle manifest（组合包）
    ├── cordis.patch.yml      # 插件行插入层
    ├── index.js              # 插件入口：注册 call_agent / agent_status，后台任务分发
    └── lib/
        ├── agent-run.js      # 后台任务运行器（增量输出/取消/超时/进度注入/结果解析）
        ├── run.js            # 进程运行器（超时/中止/进程树清理/输出截断）
        ├── detect.js         # 二进制探测（claude/codex/marvis）
        └── adapters/
            ├── claude.js     # claude -p --output-format json
            ├── codex.js      # codex exec --json [--full-auto]
            └── marvis.js     # MarvisAgent 服务器生命周期 + /health
