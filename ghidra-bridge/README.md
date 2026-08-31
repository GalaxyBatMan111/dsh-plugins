# dsh-ghidra

让 DeepSeek Harness（DSH）直接操作 **Ghidra** 反编译：导入二进制、完整分析、
反编译函数、列函数/字符串、查交叉引用——全部作为 DSH 工具使用。

## 工作原理

Ghidra 12 的 headless **Java 脚本**加载有上游 bug（NSA/ghidra#9551，未修复），
因此本插件走 **PyGhidra** 官方 Python 接口：

    插件 ──spawn──> pyghidraRun.bat ──> Ghidra headless + Python 3.13
       │                                      │
       └──── TCP 127.0.0.1 JSON-RPC ◄─────────┘   （常驻服务器，毫秒级操作）

`ghidra_open` 首次导入并完整分析二进制（数分钟，后台任务流式显示进度），
之后所有操作（反编译/函数/字符串/引用）走常驻服务器，毫秒级返回。

## 工具

| 工具 | 作用 |
| --- | --- |
| ghidra_status | Ghidra 安装/Python/pyghidra/服务器状态 |
| ghidra_open | 打开二进制：导入+分析+启动服务器（默认流式后台任务） |
| ghidra_info | 程序概要（语言/基址/块/函数数/入口点） |
| ghidra_decompile | 反编译指定函数为 C 伪代码（函数名或 0x 地址） |
| ghidra_functions | 列函数（名称/地址/大小），支持过滤排序 |
| ghidra_strings | 列已定义字符串（过滤/最短长度/条数） |
| ghidra_xrefs | 查交叉引用（to=谁引用它，from=它引用谁） |
| ghidra_close | 关闭服务器、释放项目锁 |

## 环境要求（已在本机配好）

- Ghidra 安装（12.x），含 support/analyzeHeadless.bat 与 support/pyghidraRun.bat
- JDK 21（Ghidra 12 要求）
- Python 3.13 + pip 安装 pyghidra（JPype 依赖；Python 3.14 暂缺 wheel）

> 注意：Ghidra 装在含非 ASCII 字符的路径（如 D:\配置文件\...）时，log4j 配置
> 加载会失败；插件自动写入独立 log4j2 配置并通过 GHIDRA_HEADLESS_JAVA_OPTIONS /
> PYGHIDRA_JAVA_OPTIONS 注入。推荐把 Ghidra 放到纯 ASCII 路径
> （本机已复制一份到 D:\tools\ghidra_12.1.3_PUBLIC，插件优先使用）。

## 安装

    & "$env:APPDATA\DSH Desktop\host-commands\desktop\bin\dsh.cmd" plugin --profile desktop add D:\插件研发\ghidra-bridge

然后重启 DSH Desktop。

## 配置（可选）

    - id: ghidra-bridge
      name: dsh-ghidra
      config:
        ghidraHome: ''          # 留空自动探测（优先 ASCII 路径）
        ghidraProjectDir: ''    # 项目缓存目录（默认 %TEMP%\dsh-ghidra-projects）
        projectName: dsh
        pythonVer: '3.13'       # PyGhidra 使用的 Python 版本
        analysisTimeoutSec: 600
        serverStartupTimeoutMs: 180000
        stream: true            # ghidra_open 默认后台流式

## 目录结构

    ghidra-bridge/
    ├── package.json          # dsh.bundle manifest
    ├── cordis.patch.yml      # 插件行插入层
    ├── index.js              # 8 个工具的注册与服务器状态管理
    ├── lib/
    │   ├── ghidra.js         # 环境探测/导入/服务器生命周期
    │   ├── socket.js         # TCP 行式 JSON 客户端
    │   └── run.js            # 进程工具（进程树清理/cmd 引号）
    └── scripts/
        └── DecompileBridge.py # PyGhidra 桥接脚本（常驻 TCP JSON-RPC）

## 已知限制

- 同一时刻只服务一个已打开程序；切换目标先 ghidra_close 再 ghidra_open
- 分析结果缓存在 Ghidra 项目（默认 %TEMP%\dsh-ghidra-projects），二进制未变则复用
- 卸载插件/会话销毁会自动强杀服务器进程

