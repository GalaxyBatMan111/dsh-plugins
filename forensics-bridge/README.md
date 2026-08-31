# dsh-forensics

取证/分析工具箱：让 DSH 直接调用本机的逆向、抓包、网页采集工具。

## 工具

| 工具 | 引擎 | 作用 |
| --- | --- | --- |
| r2_info | radare2 | 二进制文件信息（架构/类型/熵/导入导出） |
| r2_functions | radare2 | 函数列表（afl） |
| r2_disasm | radare2 | 反汇编（pdf 整函数 / pd N 指定条数） |
| retdec_decompile | RetDec | 整文件反编译为 C（v5 Windows 构建可能崩溃，备用） |
| tshark_interfaces | Wireshark | 网卡列表（实时抓包需 Npcap） |
| tshark_capture | Wireshark | 实时抓包到 pcapng |
| tshark_read | Wireshark | 分析 pcap/pcapng（支持显示过滤器） |
| mitm_start | mitmproxy | 代理录制（后台任务流式，job_kill 停止） |
| page_extract | trafilatura | 网页正文提取（markdown） |
| crawl_page | crawl4ai | LLM 友好抓取（JS 渲染 → markdown） |
| clone_page | single-file/monolith | 网页复刻为单文件 HTML |

## 环境要求（本机已配好）

- radare2 6.2.0（D:\插件研发\tools\radare2）
- RetDec v5.0（D:\插件研发\tools\retdec；decompiler 在本机因缺运行库崩溃，demangler 可用）
- Wireshark 4.6.8（tshark；实时抓包需 Npcap 驱动 + 管理员权限）
- mitmproxy 12.x / trafilatura 2.2 / crawl4ai（Python 3.13 pip 安装）
- single-file-cli 2.6.2（npm 全局；自动使用 Edge/Chrome）
- monolith 2.10.1（D:\插件研发\tools\monolith.exe）

## 安装

    & "$env:APPDATA\DSH Desktop\host-commands\desktop\bin\dsh.cmd" plugin --profile desktop add D:\插件研发\forensics-bridge

然后重启 DSH Desktop。

## 配置（可选）

    - id: forensics-bridge
      name: dsh-forensics
      config:
        pythonVer: '3.13'
        defaultTimeoutMs: 120000
        # 各工具二进制路径均可覆盖（留空=自动探测）
        radare2Bin: ''
        tsharkBin: ''
        mitmdumpBin: ''

## 目录结构

    forensics-bridge/
    ├── index.js              # 11 个工具注册 + mitm 后台任务
    ├── lib/
    │   ├── detect.js         # 工具路径探测
    │   ├── run.js            # 进程运行器
    │   └── adapters/
    │       ├── rev.js        # radare2 / RetDec
    │       ├── net.js        # tshark / mitmproxy
    │       └── web.js        # trafilatura / crawl4ai / single-file / monolith
    └── scripts/
        └── crawl4ai_fetch.py # crawl4ai 抓取脚本

## 安全提示

- 抓包/代理会接触明文流量：只在你自己的机器/授权目标上使用
- mitm 代理的 HTTPS 解密需要安装其证书，勿用于未授权环境
- crawl4ai/single-file 会真实访问目标 URL

