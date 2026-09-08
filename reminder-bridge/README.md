# dsh-reminder

DSH 提醒插件：当任务需要用户决定/辅助时（提问 `ask_user_question`、审批请求），检测前台窗口是否在看剧/玩游戏，用声音 / 弹窗 / 黑白屏幕闪烁提醒用户回到工作，避免一直玩耽误工作。

## 行为

| 前台窗口 | 提醒方式（智能判断） |
| --- | --- |
| 激烈网游（LOL/CS2/PUBG/原神/永劫…） | 黑白屏幕闪烁（柔和双闪） |
| 看剧/休闲（B站/抖音/Netflix/星穹铁道/Minecraft…） | 红色置顶弹窗 10s + 提示音 |
| 其他未知 | 提示音 + 弹窗 |
| 工作窗口（DeepSeek/VS Code） | 不打扰（待命） |

- 每 30 秒检查一次，提醒最长 10 分钟，或直到回答完问题 / 审批结束。
- 默认：小窗顶部居中 + 智能判断；闪烁参数（强度/轮数/闪速/间隔）可调。
- **内置「提醒配置」面板**（浏览器端 web 插件）：注册为设置页 **「桌面通知」**（设置 → 桌面通知），
  提供位置按钮、智能/手动切换、声音/弹窗/闪烁多选，以及闪烁滑轨（强度/轮数/闪速/间隔）。
  配置经 Typert RPC（`remote.reminderConfig`）实时读写 Host 侧状态并立即生效。

## 安装

### 本机 profile（开发）

```json
// C:\Users\Administrator\.dsh\profiles\{desktop|web}\package.json
{
  "dependencies": { "dsh-reminder": "link:D:/插件研发/reminder-bridge" },
  "dsh": { "profile": { "bundles": [ /* ... */, "dsh-reminder" ] } }
}
```

重启 DSH 后生效。

### 一般安装（npm）

```bash
npm install dsh-reminder
dsh plugin --profile <name> add dsh-reminder
```

包自足依赖（zod / schemastery / cosmokit / @standard-schema/spec），无需额外安装。

## 配置（profile `cordis.patch.yml` 按 id 覆盖）

```yaml
- id: reminder-bridge
  name: dsh-reminder
  config:
    position: top          # top | top-right | top-left | bottom-right | bottom-left | center
    mode: auto             # auto | manual
    manualModes: [sound, popup]   # 手动方式：sound / popup / flash
    flashOpacity: 0.35     # 闪烁强度 0.05~0.9
    flashRounds: 2         # 闪烁轮数 1~6
    flashPulseMs: 300      # 单色时长(ms) 50~800
    flashGapMs: 400        # 轮间隔(ms) 100~1500
    checkMs: 30000
    maxActiveMs: 600000
    enabled: true
```
