# dsh-wxapkg — 微信小程序反编译插件

把微信小程序缓存包（\`__APP__.wxapkg\`）还原成源码工程，并对还原结果做结构分析。

## 工具

| 工具 | 作用 |
| --- | --- |
| \`wxapkg_status\` | 自检：内置 wedecode 入口、node 版本、依赖是否装齐、缓存扫描命中数 |
| \`wxapkg_scan\` | 扫描微信缓存，列出可反编译的小程序包（appId / 路径 / 时间 / 大小 / 分包数） |
| \`wxapkg_decompile\` | 反编译：指定包或自动取最近使用的缓存包；支持后台任务 |
| \`wxapkg_analyze\` | 结构分析：技术栈、路由分包、tabBar、广告位、隐私弹窗、接口、还原质量提示 |

## 典型流程

1. 在电脑端微信里打开目标小程序（产生缓存）
2. \`wxapkg_scan\` 确认能扫到包
3. \`wxapkg_decompile\`（大包加 \`background: true\`）拿到产物目录
4. \`wxapkg_analyze\` 传产物目录，得到结构化报告

## 关于内置的 wedecode

\`vendor/wedecode/dist\` 是 [biggerstar/wedecode](https://github.com/biggerstar/wedecode)
v0.10.6 的构建产物，**已打补丁**：

- 新增 \`--auto\`：全程无交互，自动选微信缓存中最近使用的小程序包
- 自动模式下跳过联网版本检查、强制清空旧产物
- 产物输出到指定目录，不污染微信缓存目录

本插件调用时始终带 \`--auto\`，因此不会出现任何 inquirer 交互弹窗，可在无人值守环境运行。

### 许可

wedecode 是 **GPL-3.0-or-later**。本插件随附其构建产物，因此整体同样以
**GPL-3.0-or-later** 分发，许可证全文见 \`vendor/wedecode/LICENSE\`。

### 依赖说明

wedecode 的 dist **不是**自包含的，运行时需要 \`commander\` / \`axios\` / \`cheerio\` /
\`jsdom\` / \`esprima\` 等约 22 个 npm 包（主要由 \`figlet\` 占体积）。这些依赖已声明在
本插件 \`package.json\` 的 \`dependencies\` 中，安装插件时由 pnpm 自动装到插件自己的
\`node_modules\`，Node 会从 \`vendor/wedecode/dist/\` 向上查找到它们。

若 \`wxapkg_status\` 报依赖缺失，在插件目录执行：

\`\`\`bash
pnpm install
\`\`\`

## 配置项

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| \`wedecodeEntry\` | 空 | 覆盖内置 wedecode 入口路径（用自己的构建） |
| \`nodeBin\` | \`node\` | node 可执行文件 |
| \`extraScanRoots\` | 空 | 额外扫描根，\`;\` 或换行分隔 |
| \`defaultOutputDir\` | 空 | 缺省输出目录（空则 \`<cwd>/OUTPUT\`） |
| \`defaultTimeoutMs\` | 900000 | 单次反编译缺省超时 |
| \`maxTimeoutMs\` | 3600000 | 超时上限 |
| \`maxOutputChars\` | 200000 | 输出截断上限 |

## 用途限制

仅用于**技术研究与安全审计**（自有小程序、已获授权的小程序）。反编译第三方小程序可能
侵犯其著作权，请自行确保合规。
