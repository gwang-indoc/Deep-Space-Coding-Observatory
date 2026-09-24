<div align="center">

# 🛰️ Orbit

### Deep-Space-Coding-Observatory · 深空编码观测站

**把 Claude Code 的工作过程，渲染成一个活的太阳系。**

*它读的每个文件都变成一颗卫星，它跑的每条命令都发射一枚火箭。<br>
它工作得越久，宇宙就展开得越多：从地球，一直到黑洞。*

![node](https://img.shields.io/badge/node-%3E%3D20-3c873a?logo=node.js&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-r166-000000?logo=threedotjs&logoColor=white)
![react](https://img.shields.io/badge/react-18-61dafb?logo=react&logoColor=black)
![deps](https://img.shields.io/badge/runtime%20deps-zero-informational)
![local](https://img.shields.io/badge/runs-100%25%20local-blueviolet)

[English](README.md) · **简体中文**

[快速上手](#-快速上手) · [观星指南](#-观星指南) · [工作原理](#%EF%B8%8F-工作原理) · [开发](#%EF%B8%8F-开发)

</div>

---

![Orbit 仪表盘运行中：中央恒星与环绕的行星，右上角是状态 HUD，左下角步骤列表显示 "Editing"](docs/images/orbit-dashboard.png)

Orbit 包装了 `claude` CLI，把一次会话实时变成浏览器里的 3D 深空仪表盘。
扫一眼就知道：Claude 在做什么、还在干活还是在等你、已经连续工作了多久。

- 🔭 **看见它在思考。** 读文件、改文件、搜索、执行命令、跑测试，各有各的画面。
- 🚨 **需要你时一眼可见。** 恒星变红，警示光环扩散，标签页标题闪烁。
- 🌌 **越干越精彩。** 工作时长会依次解锁行星和深空奇观，两小时时出现超新星遗迹。
- 🔒 **不留痕迹。** hooks 通过 `--settings` 只注入本次会话，不会改动你的 Claude Code 配置，所有数据都只在 `127.0.0.1` 上。

---

## 🚀 快速上手

```bash
npm install          # 安装仪表盘的构建工具
npm run build        # 把 3D 仪表盘打包到 web/dist
npm link             # 把 `orbit` 加到 PATH

orbit claude         # …也可以带任意 claude 参数：orbit claude --resume
```

Orbit 会找一个空闲端口（默认 `4321`），启动本地服务器，打开浏览器标签页，
然后原样带上你的参数运行 `claude`。

> [!TIP]
> 不想安装？直接在仓库里运行 `node bin/orbit claude [args]`。

**环境要求：** Node.js ≥ 20，并且 `PATH` 中有 `claude`（Claude Code）。

---

## 🌠 观星指南

屏幕上的每样东西都对应会话里一个真实的信号。下面是看懂它们的方法。

### ☀️ 中央恒星：Claude 当前的状态

| 恒星 | 状态 | 含义 |
|---|---|---|
| 🔆 炽烈翻滚的太阳，镜头缓缓环绕 | **工作中** | Claude 正在干活 |
| 🔴 暗红恒星，琥珀色警示光环向外扩散，紫色星云飘入 | **等待中** | Claude 需要你输入（横幅显示它的提示，标签页标题闪烁 `⚠ 需要你的输入`） |
| 🟤 燃尽的余烬，行星慢慢停下 | **空闲** | 没有任务在跑（`IDLE · 等待新任务`） |
| ✨ 明亮耀斑 + **MISSION COMPLETE** | 刚完成 | Claude 结束了这一轮 |

### 🛰️ 实时活动：每次工具调用都有画面

| 你看到的 | 触发条件 |
|---|---|
| 🛰️ **卫星**（金色舱体、太阳能翼、天线） | 对文件执行 `Read` / `Edit` / `Write`。同一文件再次被操作时信标闪红光。最多保留 12 颗，超出时最早的离开。 |
| 🚀 **金色火箭**螺旋飞出 | `Bash` 命令 |
| 🚀 **绿色火箭** | 看起来是测试的 `Bash` 命令（`test`、`jest`、`pytest`、`vitest`、`rspec`、`go test`） |
| 🟢🔴 **测试环**，由红绿珠子组成 | 从测试输出中解析出的通过/失败数量 |
| 📡 **雷达波**向外扩散 | `Grep` / `Glob` 搜索 |
| ☄️ **彗星**沿偏心开普勒轨道运行 | 一直都在，是背景景观 |

### 🪐 行星：Claude 工作越久，太阳系越亮

**有效工作时长**每到一个节点就点亮一颗行星，点亮后在本次会话中一直保留。
等你输入的时间不计入，后台子代理工作的时间计入。

| 工作时长 | 行星 |
|---:|---|
| 0 分钟 | 🌍 地球 |
| 2 分钟 | 🔴 火星 |
| 4 分钟 | 🟡 金星 |
| 6 分钟 | 🟠 木星 |
| 9 分钟 | 🪐 土星 |
| 12 分钟 | 🩵 天王星 |
| 16 分钟 | 🔵 海王星 |
| 20 分钟 | 🌙 月球 |

> [!NOTE]
> **子代理会让行星加速。** 每个正在运行的子代理（`Agent` / `Task`）会接管一颗
> 已点亮的行星：它会加速公转，轨道和大气层也更亮。选哪颗由子代理 id 的哈希决定，
> 所以刷新页面后不会变；同时运行的多个子代理会各自占用不同的行星。

### 🌌 深空奇观：长会话才看得到的稀有景象

每解锁一个新奇观，都会弹出提示。远处的奇观分布在整个天空，
缓缓转动的镜头会让它们一个接一个进入视野。

| 工作时长 | 奇观 | 画面 |
|---:|---|---|
| 5 分钟 | ☄️ **流星雨** | 流星划过你正对着的那片天空 |
| 10 分钟 | 🪨 **小行星带** | 一圈凹凸不平、翻滚着的岩石 |
| 20 分钟 | 🟠 **远方巨行星** | 一颗遥远的木星级行星，带着四颗伽利略卫星 |
| 40 分钟 | 🌀 **旋涡星系** | 双臂旋涡星系，暖色核心，蓝色恒星形成旋臂 |
| 60 分钟 | 💫 **脉冲星** | 旋转的中子星，像灯塔一样把光束扫过天空 |
| 90 分钟 | 🕳️ **黑洞** | 吸积盘从白热渐变到深红，内侧物质转得更快 |
| 120 分钟 | 💥 **超新星遗迹** | 不断膨胀的丝状壳层，中心的中子星忽明忽暗 |

**工作时长 HUD**（右下角）显示累计工作时间。**状态 HUD**（右上角）显示模型、
上下文占用和速率限制。**步骤列表**（左下角）显示 Claude 此刻在做什么。

---

## ⚙️ 工作原理

```text
   claude（子进程）
        │  hooks + statusLine，通过内联 --settings JSON 注入
        ▼
   orbit-notify / orbit-statusline
        │  读取 hook 的 stdin JSON → 映射成 Orbit 事件
        ▼
   本地 HTTP 服务器 ── POST /event ──▶  内存状态
        │                                   │
        └──────────────  GET /events  ◀─────┘
                     （Server-Sent Events）
                              │
                              ▼
         React Three Fiber 仪表盘（web/dist，由 GET / 提供）
```

| Claude Code hook | Orbit 事件 |
|---|---|
| `UserPromptSubmit` | `mission_start` |
| `PreToolUse` `Read` · `Edit`/`Write` · `Grep`/`Glob` · `Bash` | `file_read` · `file_edit` · `search` · `run_command` / `run_tests` |
| `PreToolUse` / `PostToolUse` `Agent`/`Task` | `agent_start` / `agent_end` |
| `PostToolUse` 测试命令 | `test_result` |
| `Notification` | `waiting` |
| `Stop` | `mission_complete` |
| `statusLine` | `status_update`（模型、上下文 %、速率限制） |

新打开的浏览器标签页会先收到一份快照，所以刷新后状态不会丢。
hook 配置只在一个 `orbit` 进程的生命周期内存在。

---

## 🛠️ 开发

```bash
npm test                          # 后端：node:test，零运行时依赖
npm test --workspace=web          # 前端：vitest + jsdom
npm run build                     # 把仪表盘打包到 web/dist
```

**仪表盘热更新：** 在一个终端运行 `npm run dev --workspace=web`，在另一个终端运行
`orbit claude`。Vite 开发服务器会把 `/events` 和 `/event` 代理到 `:4321` 上的后端。

没有构建时，`GET /` 会返回纯文本占位页。后端和它的测试都不依赖前端构建。

设置 `ORBIT_DEBUG_LOG=<文件>` 可以记录每一条原始 hook 数据，适配新工具时很有用。

```text
bin/         orbit · orbit-notify · orbit-statusline
src/         服务器、状态、hook 与 statusline 映射（只用 Node 内置模块）
web/src/
  state/     reducer、SSE 客户端、行星与里程碑规则
  scene/     恒星、行星、卫星、飞船、星云、彗星、wonders/
  hud/       状态、步骤、模式横幅、工作时长、里程碑提示
test/        后端测试        web/test/   前端测试
```

---

## ⚠️ 已知限制

| | |
|---|---|
| **状态栏** | `orbit` 会在本次会话中替换你的 Claude Code `statusLine`，所以运行期间终端状态栏是空的。以后的版本会改成串联你原来的状态栏。 |
| **Windows** | 在 macOS 上开发和测试。hook 命令的引号处理和浏览器启动的兜底逻辑还没在 Windows 上验证过。 |

## 📚 设计文档

| 文档 | 内容 |
|---|---|
| [`claude-observatory-design_1.md`](docs/superpowers/claude-observatory-design_1.md) | 最初的视觉构想 |
| [`2026-09-22-orbit-design.md`](docs/superpowers/specs/2026-09-22-orbit-design.md) | 完整技术设计 |
| [`2026-09-22-orbit-frontend-design.md`](docs/superpowers/specs/2026-09-22-orbit-frontend-design.md) | 3D 仪表盘设计 |
| [`2026-09-22-orbit-event-pipeline.md`](docs/superpowers/plans/2026-09-22-orbit-event-pipeline.md) | 事件管道实现计划 |
| [`2026-09-22-orbit-frontend-dashboard.md`](docs/superpowers/plans/2026-09-22-orbit-frontend-dashboard.md) | 仪表盘实现计划 |

<div align="center">

<sub>🛰️ 献给喜欢看机器思考的人。</sub>

</div>
