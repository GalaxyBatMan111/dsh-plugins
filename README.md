# dsh-plugins

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH 桌面版）开发的两个插件。

## 包含的插件

| 插件 | 作用 | 目录 |
| --- | --- | --- |
| dsh-agent-bridge | 让 DSH 调用本机其他 AI 编码 agent：Claude Code / Codex / 腾讯 Marvis（后台任务流式输出） | [agent-bridge/](agent-bridge/) |
| dsh-ghidra | 让 DSH 操作 Ghidra 反编译：导入二进制、反编译函数、字符串、交叉引用（常驻 PyGhidra 服务器） | [ghidra-bridge/](ghidra-bridge/) |

## 安装

两个插件都以 DSH 的 **bundle**（组合包）形式交付，装进桌面版 profile：

    # 把本仓库克隆到本地后，分别安装两个子目录
    git clone https://github.com/GalaxyBatMan111/dsh-plugins.git

    # 安装 agent 桥接插件
    & "$env:APPDATA\DSH Desktop\host-commands\desktop\bin\dsh.cmd" plugin --profile desktop add .\dsh-plugins\agent-bridge

    # 安装 Ghidra 插件（需先满足 ghidra-bridge/README.md 的环境要求）
    & "$env:APPDATA\DSH Desktop\host-commands\desktop\bin\dsh.cmd" plugin --profile desktop add .\dsh-plugins\ghidra-bridge

然后重启 DSH Desktop，插件在启动时加载。

## 各插件说明

- [agent-bridge/README.md](agent-bridge/README.md) — 工具：`call_agent` / `agent_status`；支持流式后台任务
- [ghidra-bridge/README.md](ghidra-bridge/README.md) — 工具：`ghidra_status` / `ghidra_open` / `ghidra_info` / `ghidra_decompile` / `ghidra_functions` / `ghidra_strings` / `ghidra_xrefs` / `ghidra_close`

## 许可

MIT
