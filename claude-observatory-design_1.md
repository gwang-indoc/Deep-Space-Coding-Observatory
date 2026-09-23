# Claude Observatory（代号：Orbit）设计提案

## 概念

用「天文观测站 / 深空任务控制台」的视觉语言，替代传统的 loading spinner 或滚动日志，来呈现 Claude Code 在后台运行时的状态。

核心思路：Claude Code 每执行一步动作，就映射成一个宇宙里的视觉事件——既能看出"它还活着、正在做什么"，又不需要一直盯着日志刷屏。

## 视觉设计

页面中心是一颗缓慢自转的星球，或者一个小型黑洞 / 恒星。Claude Code 每执行不同动作，就触发不同的天文动画：

| Claude Code 动作 | 对应动画 |
|---|---|
| Thinking / Planning | 中心恒星轻微脉冲，周围轨道慢慢出现 |
| Reading files | 一颗颗小行星从远处进入轨道，每颗代表一个文件 |
| Searching codebase | 像雷达扫描一样，一圈淡淡的光从中心扩散 |
| Editing file | 某颗星球亮起来，表面出现短暂的光带 |
| Running command | 发射一艘小飞船，沿轨道飞一圈 |
| Running tests | 出现几个卫星节点；通过时变亮，失败时轻微闪烁 |
| Waiting / long task | 星云慢慢流动，不会让人觉得页面"死掉了" |
| Task completed | 轨道逐渐稳定，中心恒星产生一次很柔和的光晕，然后显示 Mission Complete |

### 美术风格

最舒服的视觉不是特别科幻的 HUD，而是：

> 黑色 / 深蓝背景 + 很少的文字 + 柔和星光 + 慢动画

参考感觉：**NASA 深空探测 + Apple screensaver + 极简 coding dashboard**，而不是赛博朋克 + 一堆数字 + Matrix 代码雨。

### 界面草图

```
┌─────────────────────────────────────────────────────────┐
│ CLAUDE // DEEP SPACE OBSERVATORY              16:18      │
│                    ·       ✦                             │
│             ·                  ·                         │
│                                                           │
│                 ╭───────────╮                            │
│            ·   ╱             ╲    ·                      │
│               │       ☉       │                          │
│            ·   ╲             ╱                           │
│                 ╰───────────╯                            │
│                     ⤷                                    │
│                orbiting files                            │
│                                                           │
│      Reading authentication.ts                           │
│                                                           │
│     ◌ Planning                                           │
│     ◉ Reading files                                      │
│     ◌ Editing                                            │
│     ◌ Testing                                            │
│                                                           │
│  12 files explored      3m 21s       ● Claude active     │
└─────────────────────────────────────────────────────────┘
```

步骤列表（Planning / Reading files / Editing / Testing）平时应做得更弱一些。默认只展示宇宙动画；鼠标悬停或按键后，才展开 Claude Code 的真实日志。

## 太阳系映射

把 Claude Code 一次运行的整个过程映射成一个太阳系：

- **中心太阳** = 当前任务
- **行星** = 子任务
- **卫星** = 文件
- **飞船** = tool call / shell command
- **轨迹** = agent 当前执行路径
- **星云** = token / context
- **流星** = 新产生的 log / event
- **超新星小爆发** = task completed

### 示例流程

Claude Code 开始执行 `Fix authentication timeout`：

1. 中心出现 **AUTH TIMEOUT**
2. Claude 开始探索：`read auth.ts` → `read session.ts` → `search timeout`，三个天体依次进入轨道
3. `edit session.ts` → session.ts 那颗星亮起来
4. `npm test` → 一艘探测器从中心飞向外围的 **TEST ORBIT**
5. 测试全部通过（`✓ 47 tests`）→ 外围轨道形成一个完整的淡蓝光环

### Idle 状态

Claude 没有任务时，自动进入 **Idle Universe**：星星非常缓慢移动，偶尔有流星划过。

运行 `claude` 时，网页里的恒星慢慢苏醒：

```
CLAUDE ONLINE
Establishing mission context...
```

然后开始形成太阳系。

## 技术架构

### 关键原则：动画速度不与输出速度直接绑定

如果 Claude 一口气读 30 个文件，动画速度如果直接跟着 Claude 输出走，页面会疯狂闪烁。因此需要一个 **event queue** 做缓冲：

```
Claude Code
    ↓ event parser
    ↓ animation queue
    ↓ WebSocket / SSE
    ↓ browser
```

Claude Code 输出结构化事件，例如：

```json
{
  "type": "file_read",
  "file": "src/auth/session.ts"
}
```

网页收到后自行决定用 800–1500ms 做一个平滑动画，而不是立即渲染。

### 技术栈

```
Claude Code
    │
    │ stdout / hooks
    ↓
Node.js event bridge
    │
    │ WebSocket
    ↓
React / Next.js
    │
    ├── Three.js
    ├── React Three Fiber
    └── Framer Motion
```

核心渲染建议用 **React Three Fiber + Three.js**：星球、星云、轨道都可以是真正的 3D，但相机基本固定，避免眩晕感。

## 命名

候选名称：

- Claude Observatory
- **Orbit**（首选）

### 启动方式

```bash
orbit claude
```

自动启动 Claude Code，同时打开：

```
localhost:4321
```

浏览器变成一个 Claude Code 的"天文仪表盘"。

## 状态信息面板（Status HUD）

除了星空动画本身，画面上还需要常驻显示一组关键状态信息，风格上尽量弱化成角落里的"仪表读数"，不要破坏整体的宁静感：

| 信息项 | 说明 |
|---|---|
| **Model** | 当前使用的模型名称（如 Claude Sonnet 4.6 / Opus 4.7 等） |
| **Context** | 当前会话的上下文占用情况（例如已用 / 总量，或百分比） |
| **5-hour token usage / limit** | 过去 5 小时窗口内的 token 使用量，及该窗口的限额 |
| **7-day token usage / limit** | 过去 7 天窗口内的 token 使用量，及该窗口的限额 |

### 展示方式建议

延续"深空仪表盘"的风格，这些数据可以放在屏幕角落，做成类似飞船仪表或空间站遥测数据的小面板，默认低调显示，鼠标悬停时展开详情：

```
┌─────────────────────────────────────────────────────────┐
│ CLAUDE // DEEP SPACE OBSERVATORY              16:18      │
│                                                           │
│  MODEL: Sonnet 4.6          CONTEXT: 42% ▓▓▓▓░░░░░░       │
│                                                           │
│                    ·       ✦                             │
│             ·                  ·                         │
│                 ╭───────────╮                            │
│            ·   ╱             ╲    ·                      │
│               │       ☉       │                          │
│            ·   ╲             ╱                           │
│                 ╰───────────╯                            │
│                     ⤷                                    │
│                orbiting files                            │
│                                                           │
│      Reading authentication.ts                           │
│                                                           │
│     ◌ Planning                                           │
│     ◉ Reading files                                      │
│     ◌ Editing                                            │
│     ◌ Testing                                            │
│                                                           │
│  5h:  ▓▓▓▓▓▓░░░░  62%   7d:  ▓▓▓░░░░░░░  31%              │
│  12 files explored      3m 21s       ● Claude active     │
└─────────────────────────────────────────────────────────┘
```

- **Context** 可以用一个小型环形或条形进度条表示，接近满时颜色轻微变化（比如从冷蓝过渡到暖色），但避免刺眼的红色警告，保持整体氛围统一。
- **5小时 / 7天 token 用量** 建议做成两条并排的细进度条，超过限额的临界值（例如 80%、100%）时才有明显的视觉提示（比如轨道边缘轻微泛红或脉冲一次），平时只是安静地呈现数值。
- 这些数据需要定期从 Claude Code 的用量接口 / 本地统计中读取并通过同一条 event bridge 推送到前端，避免额外发起请求消耗 token。

## 补充需求（性能与浏览器行为）

在实现原型时，需要额外满足：

1. **防止浏览器休眠 / 屏保**：浏览器打开该页面后，应像 YouTube 播放视频一样，阻止屏保和系统休眠（例如通过 Screen Wake Lock API 实现）。
2. **低资源占用**：页面动画应尽量不占用额外的 CPU 和内存（例如控制帧率、页面不可见时暂停渲染、避免不必要的重绘）。
3. **不消耗额外 Claude token**：动画和事件展示逻辑应完全在前端 / event bridge 层处理，不应触发额外的 Claude API 调用。

## 下一步

先做出一个可运行的 HTML/React 原型，包含：星空背景 + 中央恒星 + 文件轨道 + Claude 状态动画。
