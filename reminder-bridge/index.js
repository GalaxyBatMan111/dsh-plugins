// dsh-reminder — 任务需要用户决定/辅助时，检测前台窗口（看剧/游戏），
// 用声音 / 弹窗 / 黑白屏幕闪烁提醒用户回到工作。
//
// 触发：ask_user_question 工具调用（pre-execute）、审批请求（approval/request）
// 分类：激烈网游 -> 黑白屏幕闪烁；看剧/休闲 -> 弹窗+声音；未知 -> 声音+弹窗
// 停止：工具完成（tools/result）、审批结束、或最长 MAX_ACTIVE_MS
import Schema from 'schemastery'

export const name = 'reminder-bridge'
export const inject = ['timer', 'shell']

export const Config = Schema.object({
  // 触发工具名列表
  triggerTools: Schema.array(Schema.string()).default(['ask_user_question']),
  // 检查间隔（ms）
  checkMs: Schema.number().default(30000),
  // 首次检查延迟（ms）
  firstMs: Schema.number().default(6000),
  // 最长提醒时长（ms）
  maxActiveMs: Schema.number().default(10 * 60 * 1000),
  // 弹窗位置：top / top-right / top-left / bottom-right / bottom-left / center
  position: Schema.string().default('top'),
  // 提醒方式：auto=智能判断 | manual=手动（manualModes 生效）
  mode: Schema.union(['auto', 'manual']).default('auto'),
  // 手动方式列表：sound / popup / flash
  manualModes: Schema.array(Schema.union(['sound', 'popup', 'flash'])).default(['sound', 'popup']),
  // 闪烁强度：0.05~0.9（全屏遮罩透明度），越大越亮/暗
  flashOpacity: Schema.number().min(0.05).max(0.9).default(0.35),
  // 闪烁轮数：1~6
  flashRounds: Schema.number().min(1).max(6).default(2),
  // 单色时长（ms）：50~800，越小闪烁越快
  flashPulseMs: Schema.number().min(50).max(800).default(300),
  // 轮间隔（ms）：100~1500，越大越慢
  flashGapMs: Schema.number().min(100).max(1500).default(400),
  // 是否播放提醒（调试时可关）
  enabled: Schema.boolean().default(true),
})

// ── 窗口分类 ────────────────────────────────────────────────────────────────

// 用户回到工作的窗口（标题/进程包含任一 -> 视为工作，不打扰）
const WORK_HINTS = [
  'deepseek', 'dsh', 'harness', '127.0.0.1:43120', 'localhost:43120',
  'vs code', 'visual studio code', 'code.exe',
]

// 激烈互动（网络游戏、激情操作）-> 屏幕闪烁
const INTENSE_HINTS = [
  'genshin', '原神', '崩坏', 'honkai', 'leagueclient', 'league of legends', '英雄联盟', 'lol',
  'cs2', 'csgo', 'counter-strike', '反恐精英', 'dota2', 'dota', 'valorant', '无畏契约',
  'overwatch', '守望先锋', 'apex', 'pubg', '绝地求生', '和平精英', '永劫无间', 'naraka',
  '穿越火线', 'cf', '使命召唤', 'cod', '战地', 'battlefield', '彩虹六号', 'siege',
  '王者荣耀', '金铲铲', '云顶之弈', '蛋仔派对', '暗黑', 'diablo', '星际争霸', 'starcraft',
  '剑网', '逆水寒', '黑色沙漠', '地下城', 'dnf', '剑灵', 'ff14', '最终幻想', '魔兽世界', 'world of warcraft',
  'rocket league', 'fifa', 'ea fc', 'nba 2k', 'racing', '格斗', 'fighting', '竞技', '排位', '团战', '吃鸡',
]

// 休闲 / 看剧 -> 弹窗 + 声音
const CASUAL_HINTS = [
  'bilibili', '哔哩哔哩', 'b站', 'youtube', 'youtu.be', 'netflix', '爱奇艺', 'iqiyi', '优酷', 'youku',
  '腾讯视频', 'v.qq', '芒果tv', 'mgtv', '抖音', 'douyin', '快手', 'kuaishou', '斗鱼', 'douyu', '虎牙', 'huya',
  'twitch', '西瓜视频', '西瓜', '影视', '电影', '电视剧', '动漫', '番剧', '综艺', '追剧', '看剧', '直播', '短剧',
  'starrail', 'star rail', '星穹铁道', '云·星穹铁道', 'minecraft', '我的世界', '明日方舟', '碧蓝', '光遇',
  '植物大战僵尸', '消消乐', '扫雷', '纸牌', '雀魂', 'steam', 'wegame', '模拟器', '休闲',
]

const GENERIC_HINTS = ['游戏', '启动器', 'origin', 'epic games', 'battle.net', 'blizzard', '暴雪', '炉石', 'hearthstone']

// ── PowerShell 脚本 ────────────────────────────────────────────────────────

// 前台窗口检测（进程名 + 窗口标题）
const FG_SCRIPT = `
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FgWinR {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr h);
}
'@ -ErrorAction Stop
  $h = [FgWinR]::GetForegroundWindow()
  $pid2 = 0
  [void][FgWinR]::GetWindowThreadProcessId($h, [ref]$pid2)
  $n = [FgWinR]::GetWindowTextLength($h)
  $sb = New-Object System.Text.StringBuilder ($n + 1)
  [void][FgWinR]::GetWindowText($h, $sb, $sb.Capacity)
  $proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
  [pscustomobject]@{ process = if ($proc) { $proc.ProcessName } else { '' }; title = $sb.ToString() } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ process = ''; title = '' } | ConvertTo-Json -Compress
}
`

// 声音：系统提示音（Exclamation + Asterisk）
const SOUND_SCRIPT = `
try { Add-Type -AssemblyName System.Windows.Extensions -ErrorAction Stop; [System.Media.SystemSounds]::Exclamation.Play() } catch { try { [console]::beep(880, 250) } catch { } }
Start-Sleep -Milliseconds 300
try { [System.Media.SystemSounds]::Asterisk.Play() } catch { try { [console]::beep(1175, 250) } catch { } }
`

// 弹窗：红色置顶小窗（不抢焦点），位置可配置，10 秒自动消失
const POPUP_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
Add-Type -AssemblyName System.Drawing -ErrorAction Stop
$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'
$f.StartPosition = 'Manual'
$f.ShowInTaskbar = $false
$f.ClientSize = New-Object System.Drawing.Size(420, 96)
$s = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$w = 420; $h = 96
if ("$env:REM_POS" -eq "top") { $fx = ($s.Width - $w) / 2; $fy = 32 }
elseif ("$env:REM_POS" -eq "top-right") { $fx = $s.Width - $w - 24; $fy = 32 }
elseif ("$env:REM_POS" -eq "top-left") { $fx = 24; $fy = 32 }
elseif ("$env:REM_POS" -eq "bottom-right") { $fx = $s.Width - $w - 24; $fy = $s.Height - $h - 24 }
elseif ("$env:REM_POS" -eq "bottom-left") { $fx = 24; $fy = $s.Height - $h - 24 }
elseif ("$env:REM_POS" -eq "center") { $fx = ($s.Width - $w) / 2; $fy = ($s.Height - $h) / 2 }
else { $fx = ($s.Width - $w) / 2; $fy = 32 }
$f.Location = New-Object System.Drawing.Point([int]$fx, [int]$fy)
$f.BackColor = [System.Drawing.Color]::FromArgb(230, 81, 52)
$lb = New-Object System.Windows.Forms.Label
$lb.Text = 'DSH 提醒：有你等待协助的任务！'
$lb.Font = New-Object System.Drawing.Font('Microsoft YaHei', 14, [System.Drawing.FontStyle]::Bold)
$lb.ForeColor = [System.Drawing.Color]::White
$lb.Dock = 'Fill'
$lb.TextAlign = 'MiddleCenter'
$f.Controls.Add($lb)
$f.Show()
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WApiRR {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int idx, int val);
}
'@ -ErrorAction Stop
[void][WApiRR]::SetWindowLong($f.Handle, -20, ([WApiRR]::GetWindowLong($f.Handle, -20) -bor 0x08000000))
$f.TopMost = $true
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 120 }
$f.Close()
`

// 屏幕闪烁：黑白对比闪烁（全屏遮罩，黑白交替），参数可配置
// flashOpacity=遮罩透明度，flashPulseMs=单色时长（越小越快），flashRounds=轮数，flashGapMs=轮间隔
const flashScript = (opacity, pulseMs, rounds, gapMs) => `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
Add-Type -AssemblyName System.Drawing -ErrorAction Stop
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WApiRS {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int idx, int val);
}
'@ -ErrorAction Stop
$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'
$f.StartPosition = 'Manual'
$f.TopMost = $true
$f.ShowInTaskbar = $false
$f.Bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$f.BackColor = [System.Drawing.Color]::FromArgb(255, 0, 0, 0)
$f.Opacity = 0.0
$f.Show()
[void][WApiRS]::SetWindowLong($f.Handle, -20, ([WApiRS]::GetWindowLong($f.Handle, -20) -bor 0x08000000))
$f.TopMost = $true
foreach ($i in 1..${rounds}) {
  $f.BackColor = [System.Drawing.Color]::FromArgb(255, 0, 0, 0)
  $f.Opacity = ${opacity}
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds ${pulseMs}
  $f.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
  $f.Opacity = ${opacity}
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds ${pulseMs}
  $f.Opacity = 0.0
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds ${gapMs}
}
$f.Close()
`

// ── 插件主体 ────────────────────────────────────────────────────────────────

export function apply(ctx, config) {
  const triggerTools = config.triggerTools
  const checkMs = config.checkMs
  const firstMs = config.firstMs
  const maxActiveMs = config.maxActiveMs

  // 可变配置：初始值来自 cordis.yml config，可被运行卡（client 侧滑轨面板）实时修改
  const cfg = {
    position: config.position,
    mode: config.mode,
    manualModes: config.manualModes.slice(),
    flashOpacity: config.flashOpacity,
    flashRounds: config.flashRounds,
    flashPulseMs: config.flashPulseMs,
    flashGapMs: config.flashGapMs,
    enabled: config.enabled,
  }

  const snapshot = () => ({
    position: cfg.position,
    mode: cfg.mode,
    manualModes: cfg.manualModes.slice(),
    flashOpacity: cfg.flashOpacity,
    flashRounds: cfg.flashRounds,
    flashPulseMs: cfg.flashPulseMs,
    flashGapMs: cfg.flashGapMs,
    enabled: cfg.enabled,
  })

  // 远程服务：client 经 ctx.get('remote.reminderConfig') 读写配置
  // 所有 RPC 输入都经白名单/钳制：防止命令注入与越界值进入 PowerShell 脚本
  const POSITION_SET = new Set(['top', 'top-right', 'top-left', 'bottom-right', 'bottom-left', 'center'])
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  const svc = {
    async getConfig() {
      return snapshot()
    },
    async setConfig(patch) {
      if (patch === null || typeof patch !== 'object') return snapshot()
      if (typeof patch.position === 'string' && POSITION_SET.has(patch.position)) cfg.position = patch.position
      if (patch.mode === 'auto' || patch.mode === 'manual') cfg.mode = patch.mode
      if (Array.isArray(patch.manualModes)) {
        cfg.manualModes = patch.manualModes.filter((m) => m === 'sound' || m === 'popup' || m === 'flash')
      }
      if (typeof patch.flashOpacity === 'number' && Number.isFinite(patch.flashOpacity)) {
        cfg.flashOpacity = clamp(patch.flashOpacity, 0.05, 0.9)
      }
      if (typeof patch.flashRounds === 'number' && Number.isFinite(patch.flashRounds)) {
        cfg.flashRounds = clamp(Math.round(patch.flashRounds), 1, 6)
      }
      if (typeof patch.flashPulseMs === 'number' && Number.isFinite(patch.flashPulseMs)) {
        cfg.flashPulseMs = clamp(Math.round(patch.flashPulseMs), 50, 800)
      }
      if (typeof patch.flashGapMs === 'number' && Number.isFinite(patch.flashGapMs)) {
        cfg.flashGapMs = clamp(Math.round(patch.flashGapMs), 100, 1500)
      }
      if (typeof patch.enabled === 'boolean') cfg.enabled = patch.enabled
      console.log('[reminder] config updated: ' + JSON.stringify(snapshot()))
      return snapshot()
    },
  }
  Object.defineProperty(svc, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service: svc, serviceKey: 'reminderConfig', namespace: 'reminderConfig' },
  })
  ctx.provide('reminderConfig', svc)

  // 显式使用会话策略（danger-full-access），避免默认 read-only 禁用 Add-Type
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const policy = sandboxPolicy === undefined ? undefined : sandboxPolicy.resolve({ mode: 'danger-full-access' })

  let state = null // { reason, startedAt, timer, count }

  const runShell = (script, timeoutMs, env) => {
    const shell = ctx.get('shell')
    if (shell === undefined) return Promise.resolve(null)
    const spec = shell.resolve({
      command: script,
      timeoutMs,
      ...(env !== undefined ? { env } : {}),
      ...(policy !== undefined ? { sandboxPolicy: policy } : {}),
    })
    return shell.run(spec)
  }

  const getForeground = async () => {
    try {
      const result = await runShell(FG_SCRIPT, 10000)
      const out = String(result?.stdout?.text ?? '').trim()
      if (!out) return null
      const parsed = JSON.parse(out)
      return { process: String(parsed.process || ''), title: String(parsed.title || '') }
    } catch (err) {
      console.error('[reminder] fg check failed: ' + err)
      return null
    }
  }

  const kindOf = (fg) => {
    const text = (fg.title + ' ' + fg.process).toLowerCase()
    if (WORK_HINTS.some((k) => text.includes(k))) return 'work'
    if (INTENSE_HINTS.some((k) => text.includes(k))) return 'intense'
    if (CASUAL_HINTS.some((k) => text.includes(k))) return 'casual'
    if (GENERIC_HINTS.some((k) => text.includes(k))) return 'unknown'
    return 'unknown'
  }

  const decideModes = (kind) => {
    if (cfg.mode === 'manual') {
      const set = cfg.manualModes.filter((m) => m === 'sound' || m === 'popup' || m === 'flash')
      return set.length > 0 ? set : ['sound']
    }
    // auto：按前台窗口类型智能选择
    if (kind === 'intense') return ['flash']
    if (kind === 'casual') return ['popup', 'sound']
    return ['sound', 'popup']
  }

  const dispatch = async (modes) => {
    for (const m of modes) {
      try {
        if (m === 'sound') await runShell(SOUND_SCRIPT, 10000)
        else if (m === 'popup') await runShell(POPUP_SCRIPT, 20000, { REM_POS: cfg.position })
        else if (m === 'flash') await runShell(flashScript(cfg.flashOpacity, cfg.flashPulseMs, cfg.flashRounds, cfg.flashGapMs), 20000)
      } catch (err) {
        console.error('[reminder] mode ' + m + ' failed: ' + err)
      }
    }
  }

  const tick = async () => {
    if (state === null || !state.active) return
    if (Date.now() - state.startedAt > maxActiveMs) {
      stopReminder('max duration')
      return
    }
    const fg = await getForeground()
    if (fg === null) return
    const kind = kindOf(fg)
    console.log('[reminder] fg=' + fg.process + ' | ' + fg.title + ' -> ' + kind)
    if (kind === 'work') return // 已回工作窗口：待命不打扰，等工具完成
    const modes = decideModes(kind)
    await dispatch(modes)
    state.count = (state.count || 0) + 1
    console.log('[reminder] reminded #' + state.count + ' via ' + modes.join('+') + ' (' + kind + ')')
  }

  const startReminder = (reason) => {
    if (state !== null) return
    console.log('[reminder] START: ' + reason)
    state = { reason, startedAt: Date.now(), active: true, timer: null, count: 0 }
    ctx.timeout(() => void tick(), firstMs)
    state.timer = ctx.interval(() => void tick(), checkMs)
  }

  const stopReminder = (reason) => {
    if (state === null) return
    if (state.timer !== null) state.timer()
    console.log('[reminder] STOP: ' + reason + ' (count=' + (state.count || 0) + ')')
    state = null
  }

  ctx.on('tools/pre-execute', (exec, next) => {
    if (!cfg.enabled) return next()
    if (triggerTools.includes(exec.name)) startReminder('tool: ' + exec.name)
    return next()
  })

  ctx.on('tools/result', (exec) => {
    if (triggerTools.includes(exec.name)) stopReminder('tool completed: ' + exec.name)
  })

  ctx.on('approval/request', async (req, next) => {
    if (!cfg.enabled) return next()
    startReminder('approval')
    try {
      return await next()
    } finally {
      stopReminder('approval settled')
    }
  })

  console.log('[reminder] plugin applied (pos=' + cfg.position + ', mode=' + cfg.mode + ', enabled=' + cfg.enabled + ')')
}
