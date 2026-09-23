# Orbit（Claude Observatory）设计文档

## 概念

用「天文观测站 / 深空任务控制台」的视觉语言，替代传统的 loading spinner 或滚动日志，来呈现 Claude Code 在后台运行时的状态。Claude Code 每执行一步动作，就映射成一个宇宙里的视觉事件——既能看出"它还活着、正在做什么"，又不需要一直盯着日志刷屏。

原始视觉设计提案见 `claude-observatory-design_1.md`（本文档在其基础上补齐了可实现的技术架构）。

## 架构参考：moonseek

同类项目 [moonseek](https://github.com/gwang-indoc/moonlight) 已经验证了一套"session 级 hooks 采集 + 本地 HTTP/SSE + 浏览器可视化"的架构：

- 用 `claude` 子进程的内联 `--settings` JSON 参数注入 hooks，不写入任何持久化配置文件，进程结束后配置自动失效。
- 本地 HTTP 服务器提供页面、接收状态、通过 SSE 推送给浏览器。
- 一个 `statusLine` hook 专门上报 model / context / 5小时 / 7天 token 用量。

Orbit **架构上参考 moonseek 的模式，但代码独立实现**：moonseek 的状态机只有 4 种粗粒度状态（working/waiting/idle/ended），服务于一个月亮动画；Orbit 需要更细粒度的事件分类（按工具类型区分读文件/编辑/搜索/跑命令/跑测试），因此事件 payload schema、状态机、hook 覆盖范围都是全新设计。

## 1. 总体架构 & 仓库结构

```
Deep-Space-Coding-Observatory/
├── bin/
│   ├── orbit                # CLI 入口: orbit claude [args...]
│   ├── orbit-notify         # hook 触发时被调用，POST 事件到本地 server
│   └── orbit-statusline     # statusLine hook，上报 model/context/token 用量
├── server/                  # Node.js，本地 HTTP + SSE
│   ├── index.js             # GET / , POST /event , GET /events
│   └── state.js             # 内存态：当前 mission/todo列表/事件缓冲
├── web/                     # React + React Three Fiber 前端
│   ├── scene/                # 3D 场景组件(星球/轨道/星云/飞船)
│   └── hud/                  # 状态面板组件
└── package.json              # npm workspaces: 单仓库，三个子包共享类型定义
```

**启动序列**：

1. `orbit claude [args...]` 选择空闲端口（默认端口优先，`EADDRINUSE` 时回退到临时端口），启动本地 HTTP + SSE server。
2. 自动打开浏览器到 `http://localhost:<port>/`。
3. 以子进程方式 spawn `claude [args...]`，透传 stdin/stdout/stderr（终端交互不受影响），并通过内联 `--settings` JSON 注入 hooks（`UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Notification` / `Stop`）+ `statusLine` 命令，全部指向 `orbit-notify` / `orbit-statusline`。
4. 不写入任何持久化配置文件，子进程退出后 hooks 配置自然失效。
5. 子进程退出 → server 推送 `mission_complete` 或 `ended` → 关闭 server（浏览器页面保留最终画面），子进程退出码原样透传给 `orbit`。

## 2. 事件分类体系 & Hook 映射

| Hook 触发点 | 判断依据 | 动画事件 |
|---|---|---|
| `UserPromptSubmit` | — | `mission_start`（中心恒星苏醒，显示任务标题） |
| `PreToolUse` (tool=Read) | `tool_input.file_path` | `file_read`（小行星进入轨道） |
| `PreToolUse` (tool=Grep/Glob) | — | `search`（雷达扩散光圈） |
| `PreToolUse` (tool=Edit/Write) | `tool_input.file_path` | `file_edit`（对应星体亮起+光带） |
| `PreToolUse` (tool=Bash) | 命令文本启发式匹配 `test\|jest\|pytest\|vitest\|go test` 等关键词 | `run_tests` 或 `run_command`（飞船发射，轨道终点不同） |
| `PostToolUse` (tool=Bash, 判定为测试) | `tool_response` 里的退出码/输出解析 pass/fail 计数 | `test_result`（卫星节点变亮/闪烁） |
| `TodoWrite` (Pre/PostToolUse) | `tool_input.todos` | `planet_sync`（增删/更新行星状态：pending/in_progress/completed） |
| `Notification` | — | `waiting`（星云缓慢流动） |
| `Stop` | — | `mission_complete`（超新星式光晕 + Mission Complete） |
| statusLine 周期性调用 | model/context/5h/7d 数据 | `status_update`（HUD 面板刷新，不触发主动画） |

"Running command" vs "Running tests" 的启发式关键词匹配会有误判（例如 `git commit -m "test: fix"` 不是测试），但两者动画差异很轻（仅飞船终点轨道不同），误判后果可接受，不做更复杂的判定（如解析 `package.json` 的 test script）。

## 3. Server API & 事件协议

```
GET  /              → 页面(HTML/JS/CSS，React 应用)
POST /event          → orbit-notify / orbit-statusline 推送事件，server 内存态更新后广播
GET  /events         → SSE 流，浏览器订阅
```

事件 JSON schema：

```json
{
  "type": "file_read | search | file_edit | run_command | run_tests | test_result | planet_sync | waiting | mission_start | mission_complete | status_update | snapshot",
  "ts": 1758540000000,
  "payload": {}
}
```

各 `type` 的 `payload` 示例：

- `file_read`: `{ "file": "src/auth/session.ts" }`
- `test_result`: `{ "passed": 47, "failed": 0 }`
- `planet_sync`: `{ "todos": [{ "id": "1", "text": "...", "status": "in_progress" }] }`
- `status_update`: `{ "model": "Sonnet 5", "contextPct": 42, "fiveHour": {"used":62,"limit":100}, "sevenDay": {"used":31,"limit":100} }`

**动画速度不与输出速度直接绑定**：server 端不做节流/缓冲，收到事件立即通过 SSE 转发，保持状态权威只有一份。节流/排队逻辑放在浏览器端：前端维护 animation queue，每个事件按 800–1500ms 最小间隔依次播放；队列过长（如超过 20 个排队中的 `file_read`）时合并为"批量探索"动画，避免动画堆积。

**断线重连**：浏览器 SSE 断开由 `EventSource` 原生自动重连；重连后 server 补发一次 `type: "snapshot"`（含当前 todos、最近一次 status_update），避免刷新页面后画面空白。

## 4. 前端场景设计

React Three Fiber，固定相机（避免眩晕感）：

- **中心恒星**：`mission_start` 时从暗到亮苏醒；Thinking 期间轻微脉冲；`mission_complete` 时触发一次柔和光晕（超新星式）后显示 "Mission Complete"。
- **行星层**（来自 `planet_sync`，每个 todo 对应一颗行星）：`pending` 暗淡静止 / `in_progress` 轨道推进+轻微发光 / `completed` 稳定发光+轨道锁定。
- **卫星/小行星**（`file_read`/`file_edit`）：从远处飞入行星轨道，`file_edit` 时对应星体表面出现短暂光带；同一文件重复读取只做"闪烁提醒"而非重新入轨；超过 N 颗自动淡出最旧的（LRU 去重，避免轨道拥挤）。
- **飞船**（`run_command`/`run_tests`）：从中心发射，沿轨道飞一圈后消失；`test_result` 到达时在外围生成/更新卫星节点环（通过为绿、失败为淡闪烁）。
- **雷达扫描**（`search`）：中心向外扩散的淡光圈，短生命周期动画，不常驻。
- **星云**（`waiting`）：进入等待态超过约 3 秒才启动缓慢流动的星云背景，避免瞬时状态切换太跳。
- **Idle Universe**：无活跃 mission 时的默认场景——星星极慢移动，偶尔流星划过；`claude` 子进程启动瞬间播放 "CLAUDE ONLINE / Establishing mission context..." 文字后过渡到太阳系形成动画。

**Status HUD**（角落面板，默认弱化，hover 展开）：Model 名称 + Context 占用（环形/条形进度条，冷蓝→暖色渐变）；5小时/7天 token 用量并排细进度条，超过 80%/100% 阈值时轨道边缘轻微泛红脉冲一次；数据来源即 `status_update` 事件，不发起额外请求。

**步骤列表**（Planning/Reading/Editing/Testing）默认弱化显示，hover 或按键后展开详细日志（最近若干条原始事件的文本描述）。

## 5. 启动行为、错误处理、性能与浏览器行为

- 浏览器打开失败（如无 GUI 环境）只警告，不阻断 Claude Code 正常运行。
- `orbit-notify` / `orbit-statusline` 与 server 通信失败时静默处理、**始终 exit 0**——绝不能因为可视化层故障影响 Claude Code 本身执行。
- **Screen Wake Lock API**：页面加载后请求 wake lock，防止休眠/屏保；`document.visibilitychange` 时处理 wake lock 失效重新请求。
- **页面不可见时暂停渲染**：`document.hidden` 时暂停 R3F 渲染循环，只保留 SSE 连接和事件入队，恢复可见时补播动画队列。
- **帧率控制**：目标 30fps 上限，星云/背景粒子数量设上限，避免 GPU/CPU 占用过高。
- **不消耗额外 Claude token**：整个动画/事件管道完全在 hooks → server → SSE → 浏览器这条本地链路里，不触发任何额外的 Claude API 调用，这是贯穿全部组件的硬约束。

## 6. 测试策略

- **Hook 映射单元测试**：给定各种 `PreToolUse`/`PostToolUse`/`TodoWrite` 示例 payload，验证 `orbit-notify` 输出正确的事件 type + payload，重点覆盖 "Running command vs Running tests" 启发式判断的边界情况。
- **Server 集成测试**：验证 `POST /event` → `GET /events`（SSE）转发，以及断线重连后 `snapshot` 补发逻辑。
- **前端动画队列单元测试**：只测队列节流/合并逻辑（纯逻辑单测），视觉部分手动验收。
- **端到端手动验收**：跑真实任务，人工核对 8 种动画状态、Status HUD 数值、Idle→Active→Complete 全流程、浏览器休眠不触发、tab 切走后 CPU 占用下降。
- **不做的事**：不做 3D 渲染像素级快照测试；不做多用户/多 session 并发测试（设计上是单 session 单进程模型）。

## MVP 范围确认

- 全部 8 种动画事件类型（thinking/reading/searching/editing/running command/running tests/waiting/completed）。
- Status HUD（model/context/5h/7d token 用量）包含在 MVP 内。
- CLI 调用方式：`orbit claude [参数...]`，为未来包装其他 CLI 工具预留命名空间。
- 渲染技术：React Three Fiber + Three.js（按原始设计文档，固定相机）。
- 子任务/行星映射：解析 `TodoWrite` 的待办清单，无 TodoWrite 调用时只有中心恒星+轨道天体，无行星层。
