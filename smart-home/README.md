# smart-home — 智能家居控制项目（CLI 层 + Skill 层）

一套**平台无关的智能家居控制工具**：用稳定的命令行契约（退出码 + `--json`）按设备名控制米家、Home Assistant 等平台的设备，可整体嵌入任意 AI Agent。架构可扩展任意平台。

> **定位**：本项目分两层——
> - **CLI 层（`cli/`）**：底层控制工具，有稳定的退出码契约 + `--json` 输出，可按名操作设备、支持多平台驱动
> - **Skill 层（`SKILL.md`）**：给 AI 的工作流说明，教它用 CLI 完成用户需求
>
> 用户拿到后自行登录、自动发现自己的设备即可用。可**整体嵌入任何 AI Agent**。零 npm 依赖，纯 Node.js 标准库。

## 功能特性

- **零依赖**：纯 Node.js 标准库，无需安装任何 npm 包
- **平台无关**：统一驱动接口 + 归一化能力名，米家 / Home Assistant / 更多平台可扩展
- **按名操作**：`node cli/device.mjs <设备名> <操作>`，设备名**精确匹配**防误操作
- **机器可读**：退出码契约 + `--json` 输出，适合脚本与 AI 消费
- **数据隔离**：凭证/设备/能力缓存全部在状态目录，代码零写死任何家庭/账号信息

## 目录

- [快速上手](#新用户-5-分钟上手)
- [架构](#架构cli-层--skill-层)
- [命令](#命令)
- [使用示例](#使用示例)
- [设备名匹配](#设备名匹配)
- [退出码契约](#退出码契约)
- [`--json` 输出契约](#json-输出契约)
- [排障](#排障)
- [状态目录](#状态目录)
- [平台扩展](#平台扩展)
- [扩展](#扩展)
- [已知限制](#已知限制)
- [开发与测试](#开发与测试)
- [License](#license)

## 新用户 5 分钟上手

```bash
# 0. 前置：Node.js ≥ 18（无任何 npm 依赖）
cd <本项目>

node cli/device.mjs --config          # ① 配置平台（打开浏览器）
node cli/device.mjs --register       # ② 自动发现你的设备 + 拉取能力定义
node cli/device.mjs list             # ③ 看有哪些设备
node cli/device.mjs <设备名> --action home   # ④ 按名字控制
# ⑤ 回主目录读 SKILL.md 了解全貌；改设备名用 node cli/device.mjs --rename <旧名> <新名>
```

## 架构：CLI 层 + Skill 层

```
smart-home/
├── SKILL.md                 # Skill 层：给 AI 的工作流说明（Agent 入口）
├── README.md                # 本文档（CLI 契约唯一来源：命令/退出码/--json/排障/平台扩展）
├── .gitignore               # 防御性忽略（状态实际在项目外）
└── cli/                     # ═══ CLI 层：底层控制工具 ═══
    ├── device.mjs           # CLI 入口：参数解析 → 驱动路由 → 输出 → 退出码
    ├── config/              # ══ 配置 Web 服务（--config）══
    │   ├── server.mjs       # HTTP 服务（127.0.0.1）：静态页 + /api/<平台> 路由
    │   ├── framework.html   # 配置页（左右布局：平台列表+开关 / iframe 平台页）
    │   ├── run.mjs          # 启动服务 + 打开浏览器 + 阻塞等待
    │   └── lib/auth.js      # auth.json 统一读写（enabled + creds）
    ├── lib/
    │   ├── errors.js        # 退出码契约 + CliError（含平台错误码）
    │   ├── registry.js      # 设备清单读写 + 状态目录
    │   ├── capabilities.js  # 统一能力清单：查找/参数规整(步进)/读回翻译
    │   ├── platforms.js     # 平台驱动动态加载
    │   └── output.js        # 输出格式化（human / --json）
    ├── test/                # node:test 单元测试
    └── platforms/           # ══ 平台驱动（多平台兼容的关键）══
        ├── xiaomi/          # 米家平台
        │   ├── README.md    # 驱动实现说明（接口/加密/排障）
        │   ├── driver.mjs   # spec→能力清单转换 + act 归一 + auth 认证器
        │   ├── config/      # auth.html（配置页：二维码+轮询）
        │   └── scripts/     # 云 API（mi_cloud.mjs）+ 能力拉取（fetch_spec.mjs）
        └── homeassistant/   # Home Assistant 平台（骨架，待联调）
            ├── README.md    # 驱动实现说明（部署/配置/契约映射）
            ├── driver.mjs   # 无 spec（domain→能力清单）/ HTTP 错误码 + auth 认证器
            └── config/      # auth.html（配置页：url+token 表单）

# 运行时状态【程序目录之外】：~/.grove/.data/smart-home/
#   ├── devices.json              全局设备清单（含 platform 标签）
#   ├── auth.json                 平台配置与凭证（enabled + creds，--config 写入，0600）
#   └── <平台>/specs/             <model>.json 能力定义缓存（--register 拉取/刷新）
# 状态可用 SMART_HOME_STATE 环境变量重定位；删项目/覆盖升级都不丢。
```

**三层调用**：Skill 层（SKILL.md）→ CLI 层（cli/device.mjs + lib）→ 平台驱动（cli/platforms/<平台>/driver.mjs，能力名映射到平台原生 ID）。

**三分离**：
| 数据 | 来源 | 是否入 git |
|---|---|---|
| 连接凭证 | `--config` 写入 → `~/.grove/.data/smart-home/auth.json` | ❌ 绝密 |
| 设备实例 | `--register` 自动发现 → `~/.grove/.data/smart-home/devices.json`（跨平台，含 platform 标签） | ❌ 个人配置 |
| 能力定义 | `--register` 按型号拉取 → `~/.grove/.data/smart-home/<平台>/specs/` | ❌ 运行时缓存 |

## 命令

| 命令 | 说明 |
|---|---|
| `--help` / `-h` / 无参数 | 显示本帮助 |
| `--config` | 配置平台：打开浏览器，勾选启用平台 + 完成登录 |
| `--register` | 自动同步**所有已启用平台**的设备到 `devices.json`（单平台失败不影响其他） |
| `list` | 设备总览（各平台凭证状态 + 设备列表 + 在线/能力/禁用标记） |
| `--rename <旧名> <新名>` | 设备改名（跨平台同名可用 `平台:设备名`；名字不能含冒号） |
| `<设备名> --list` | 设备能力清单 |
| `<设备名> --action <动作> [<参数>...]` | 调用动作（含遥控键；带参动作如 `--action post "你好"`） |
| `<设备名> --set <属性>=<值> [参数=值...]` | 写属性（多参用 name=value） |
| `<设备名> --set <属性> <值>` | 写属性（单值简写） |
| `<设备名> --get <属性>` | 读属性（枚举自动翻译） |
| `<命令> --json` | 机器可读输出（配合退出码使用） |

## 使用示例

```bash
node cli/device.mjs list                        # 看有哪些设备（含在线/能力状态）
node cli/device.mjs 客厅投影 --list             # 看设备支持哪些能力
node cli/device.mjs 客厅投影 --get volume       # 读属性（枚举自动翻译）
node cli/device.mjs 客厅投影 --set volume 22    # 写属性（步进自动规整）
node cli/device.mjs 客厅投影 --action play      # 调用动作
node cli/device.mjs 客厅投影 --action volume_up # 遥控键（无参动作）
node cli/device.mjs 小明同学 --action post "你好" # 带参动作（参数按顺序传给能力定义）
```

> 设备名用 `list` 看到的精确名；跨平台同名用 `平台:设备名`（如 `xiaomi:客厅投影`）。

## 设备名匹配

- 按设备名**精确匹配**，不做包含/模糊猜测，防止误操作到别的设备
- **跨平台同名**（如米家"客厅灯"和 HA"客厅灯"）用 **`平台:设备名`** 精确定位：`xiaomi:客厅灯`
- 未精确命中 → 退出码 2（设备未找到）；同名设备（跨平台同名最常见）→ 歧义（退出码 8）并列出候选
- **`平台:设备名` 只能消除跨平台歧义**：同平台内若仍有重名（如两台 xiaomi 设备同名），带前缀也会报歧义——需用 `--rename` 改名区分
- 歧义报错会提示候选的完整 `平台:设备名`，方便复制精确名
- 设备名**不能包含冒号 `:`**（保留给 `平台:设备名` 语法）

实际输出示例：

```
凭证[xiaomi]: ✅ 已登录

共 8 台设备:
  客厅投影 (example.projector.v1, xiaomi) 🟢 在线 ✅ 可控制
  卧室灯 (example.light.v1, xiaomi) ⚪ 离线 ✅ 可控制
  示例手环 (example.watch.v1, xiaomi)  ⚠️ 不支持控制（无需重试）
```

- `🟢 在线` / `⚪ 离线`：实时在线状态（驱动支持时实时查询，否则用注册快照）
- `✅ 可控制`：有能力定义，可操作
- `⚠️ 不支持控制（无需重试）`：该型号无能力定义（如手环），重跑 `--register` 也拉不到
- `⛔ 平台已禁用`：平台未启用（`--config` 启用）

## 退出码契约

| 码 | 含义 | 典型场景 |
|---|---|---|
| 0 | 成功 | 操作被设备接受 |
| 1 | 用法 / 参数错误 | 缺参数、未知 flag、操作冲突 |
| 2 | 设备未找到 | 名字匹配不到 |
| 3 | 设备不支持控制 | 无能力定义（如手环）/ 无此能力 |
| 4 | 设备拒绝 | `result.code` 非 0 |
| 5 | 凭证缺失 / 失效 / 平台禁用 | 未登录 / `invalid signature` |
| 6 | 设备离线 | 云可下发但不生效 |
| 7 | 网络 / 超时 | 请求失败、超时 |
| 8 | 设备名歧义 | 匹配到多台（`--json` 带 `candidates`） |

**用法**：脚本判断成败看退出码（0 = 成功），不要解析输出文本；需要细节再看 `--json`。

## `--json` 输出契约

成功：

```json
{"ok":true,"op":"get","device":{"name":"客厅投影","model":"example.projector.v1","platform":"xiaomi"},"target":"volume","data":{...}}
```

操作（`--action`/`--set`）输出参数与步进调整：

```json
{"ok":true,"op":"set","device":{...},"target":"volume","params":{"value":22},"requestedValue":"21","adjustment":"步进 2，已调整为 22"}
```

读属性带读回值和枚举翻译：

```json
{"ok":true,"op":"get","device":{...},"target":"playing-state","value":"2","valueDesc":"暂停","data":{...}}
```

失败：

```json
{"ok":false,"op":"error","error":"device_rejected","exitCode":4,"message":"设备拒绝操作（result.code 非 0）","platformCode":"-704220043","data":{...}}
```

`op` 取值：`config` | `register` | `list` | `rename` | `caps`（--list）| `action` | `set` | `get`。
`error` 取值：`usage` | `device_not_found` | `not_supported` | `device_rejected` | `auth` | `offline` | `network` | `ambiguous`。
`platformCode` = 平台原始错误码（如 `-704042011` / HTTP `401`）。

## 排障

| 症状 | 处理 |
|---|---|
| 凭证失效（`invalid signature`） | 重新 `--config` 登录平台 |
| 设备拒绝（退出码 4） | 云拒绝该操作：平台错误码中文含义在 `message` 里（平台专属错误码表见对应平台 README） |
| 设备不支持控制（退出码 3） | 该型号无能力定义，重跑 `--register` 也拉不到，不要重试 |
| 设备离线（退出码 6） | 设备不在线，稍后重试或检查设备电源 |
| 设备名歧义（退出码 8） | 用 `平台:设备名` 精确指定，或用 `--rename` 改名 |
| 平台禁用（退出码 5 / ⛔） | `--config` 启用该平台 |

## 状态目录

所有 per-user 数据存在 `~/.grove/.data/smart-home/`（可用环境变量 `SMART_HOME_STATE` 重定位）：

```
devices.json              设备清单（name / id / model / platform / online）
auth.json                 平台配置与凭证（enabled 开关 + creds，--config 写入，0600）
<平台>/specs/             各平台能力定义缓存（--register 拉取 / 刷新）
```

**`auth.json` 结构**（凭证契约，框架统一管理）：

```json
{
  "xiaomi":        { "enabled": true,  "creds": { "userId": "...", "serviceToken": "...", "ssecurity": "...", "ua": "..." } },
  "homeassistant": { "enabled": false, "creds": { "url": "...", "token": "..." } }
}
```

- `enabled`：平台是否启用（`--config` 配置页左侧开关控制）
- `creds`：平台自管的登录凭证，**语义由各平台自己定义**（框架不解析，只存取）
- 文件权限 0600；严禁入 git/日志

## 平台扩展

新建 `cli/platforms/<name>/driver.mjs`，实现统一驱动接口。CLI 层只消费契约，不碰平台细节。

### 驱动接口

```js
export const id = '<name>';          // 平台标识（= devices.json 的 platform）
export const displayName = '<平台名>';
export function isLoggedIn()               // boolean
export async function discover()           // 必选：发现/同步该平台设备 → [{ name, id, model, platform, online, capabilityStatus }]
export async function refreshOnline(devices) // 可选：批量查实时在线 → { id: boolean }；缺失则用快照
export async function capabilities(device) // → 能力清单数组 | null
export async function act(device, kind, name, params)
                                         // kind: 'action' | 'get'
                                         // action → 无参/带参动作；get → 读属性
```

- `discover()` 是**必选契约**——`--register` 调用它。语义是"发现/同步"，无论平台底层是云 API 拉取（米家）还是实体同步（HA）
- `refreshOnline(devices)` **可选**——`list` 用它刷新实时在线状态，缺失时用 discover 存的快照
- `--register` 自动遍历所有 enabled 平台；**平台保存配置时框架默认保留用户 `--rename` 的自定义名**（register 按 platform+id 合并，不覆盖用户改名）

### 认证器声明（auth）

配置页（`--config`）由框架层统一驱动。平台提供**自己的配置页 HTML** + **登录 API 端点**，框架层 iframe 加载页面、路由 API：

```js
export const auth = {
  configPage: '/platforms/<name>/config/auth.html',  // 平台配置页（框架 iframe 加载）
  routes: {
    'GET /qr':       loginFn1,   // 登录相关 API，框架统一注册到 /api/<platform>/*
    'GET /status':   loginFn2,
    'POST /finalize': loginFn3,
  },
};
```

- 平台配置页 HTML 放 `cli/platforms/<name>/config/auth.html`，用 `fetch('/api/<platform>/<action>')` 调自己的登录逻辑（相对路径自动到框架服务）
- 米家：`/qr`（申请二维码）→ `/status`（轮询确认）→ `/finalize`（保存凭证）
- HA：`/save`（保存 url/token）+ `/test`（保存前验证连接/凭证）
- **配置有效性验证在平台自己的 HTML 里做**：HA 保存前先 `/test` 验证；米家扫码登录天然验证
- 凭证统一存 `~/.grove/.data/smart-home/auth.json`（框架层 `cli/config/lib/auth.js` 管理）

### 配置 Web 服务契约（--config）

`--config` 由框架层启动本地 HTTP 服务（仅绑定 127.0.0.1），平台页与框架页遵守以下路由：

| 路由 | 说明 |
|---|---|
| `GET /` | 框架页（左右布局：平台列表+开关 / iframe 嵌平台配置页） |
| `GET /platforms/<name>/config/auth.html` | 平台配置页（静态文件） |
| `GET /api/platforms` | 平台列表 `[{id, displayName, enabled, configPage}]` |
| `POST /api/platforms/enabled` | body `{platform, enabled}` 设置启用/禁用 |
| `GET /api/platforms/<name>/config` | 平台配置状态 `{enabled, configured}`（不泄露 creds） |
| `GET/POST /api/<platform>/<action>` | 路由到 `driver.auth.routes["<METHOD> /<action>"]` |
| `POST /api/done` | 配置完成，触发 CLI 退出 |

**iframe 内容高度自适应协议**：平台配置页加载后向父窗口 `postMessage({type:'smart-home-resize', height:<内容高度>}, '*')`，框架据此调整模态框高度；未上报时框架轮询兜底。

### 能力清单（capabilities 返回值）

统一能力清单，每项一个能力（替代平台原始结构，如米家 spec 的 props/actions/keys）。

**能力字段总表**：

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 能力名（CLI/AI 用它操作，如 `volume`、`play`） |
| `kind` | string | ✅ | `'action'` / `'set'` / `'get'` |
| `desc` | string | ✅ | 中文描述（"音量"、"播放"） |
| `values` | array | ⚪ | 枚举值表 `[{ value, desc }]`（读回翻译 + 可选值提示） |
| `range` | array | ⚪ | 数值范围 `[min, max, step]`（CLI 按 step 规整） |
| `unit` | string | ⚪ | 单位（`celsius`、`percentage`） |
| `params` | array | ⚪ | 动作/写属性参数定义 `[{ name, format, range, values, unit, desc }]` |

**params 字段**（参数定义）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 参数名（单值能力统一 `value`；多参能力各不同） |
| `format` | string | 类型（`uint8`/`int`/`float`/`bool`/`string`） |
| `range` | array | 该参数范围 `[min, max, step]` |
| `values` | array | 该参数枚举 |
| `unit` | string | 单位 |
| `desc` | string | 参数描述（多参时区分用途） |

**kind 语义**：

- `kind: 'action'`：动作/按键（play、turn-off、volume-up）。`--action <name>` 调用，无参或带参
- `kind: 'set'`：可写属性（volume、mute）。`--set <name> <值>`，参数在 `params` 里
- `kind: 'get'`：只读属性（playing-state）。`--get <name>`，读回值 + 枚举翻译
- 无法结构化描述的能力 → 仍暴露为 `{kind:'action', name, desc}`，raw 透传在 `--json` 的 `data`

**示例**：

米家投影仪 volume（set，单参）：
```js
{
  name: 'volume', kind: 'set', desc: '音量',
  range: [0, 100, 2], unit: 'percentage',
  params: [{ name: 'value', format: 'uint8', range: [0,100,2], unit: 'percentage' }],
}
```

米家投影仪 play（action，无参）：
```js
{ name: 'play', kind: 'action', desc: '播放' }
```

HA climate.set_temperature（action，多参）：
```js
{
  name: 'set-temperature', kind: 'action', desc: '设温度',
  params: [
    { name: 'temperature', format: 'float', range: [16,30,0.5], unit: 'celsius' },
    { name: 'mode', format: 'string', values: [{value:'heat',desc:'制热'},{value:'cool',desc:'制冷'}] },
  ],
}
```

**`--list` 输出**——能力字段映射到展示：
- `format` → 类型标签：`[布尔 true/false]` / `[数值]` / `[文本]`
- `range` → `[范围 min~max 步进 step]`（步进 1 省略）
- `values` → `[可选 4=HDMI 1, 0=未进入]`
- `unit` → 读回时附加（如 `= 22 percentage`）
- `params`（动作带参）→ `[带参 --action post <arg0>]`（提示该动作可传参数）

### act 映射与参数规整

- `--action <name>` → `act(device, 'action', name, {})`
- `--action <name> <参数>...`（带参动作）→ 额外位置参数按顺序映射到能力参数名（如 `--action post "你好"` → `{arg0:"你好"}`）
- `--set <name> <值>` / `--set <name>=<值>` → `act(device, 'action', name, { value: <值> })`
- `--set <name> <参数名>=<值>...`（多参）→ `act(device, 'action', name, { 参数名: <值>, ... })`
- `--get <name>` → `act(device, 'get', name)`

**参数规整（框架层职责）**：

`cli/lib/capabilities.js` 的 `normalizeActionParams` 按能力的 `params` 定义做**类型转换 + 步进规整**，CLI 层统一执行，平台驱动收到**已规整**的参数：

- 类型转换（`format`）：`bool` → true/false；数字 → Number
- 步进规整（`range[2]` 非 1 时）：如温度步进 0.5，写 `26.3` 自动规整为 `26.5`；音量步进 2，写 `21` 自动变 `22`
- 平台 `act()` 收到的 `params` 已经是规整后的值，无需再处理

**职责边界**：
- **框架层**：执行参数规整（对所有平台统一）
- **平台层**：通过能力清单 `params.range` 提供步进数据；平台不关心规整逻辑

### 平台错误码（CliError）

平台自管理错误码 + 中文含义，CLI 层映射到通用退出码并输出：

```js
import { CliError, EXIT } from '../../lib/errors.js';

// 平台内置错误码表
const ERRORS = {
  '-704042011': { exit: EXIT.OFFLINE, kind: 'offline', message: '设备离线，请确认设备已开机再操作' },
};

throw new CliError(exit, kind, message, { platformCode, raw });
```

- CLI 捕获 CliError（含 platformCode）→ 输出平台中文含义 + 平台错误码（`--json` 含 `platformCode` 字段）
- 平台未知/无法映射的错误 → 抛通用 `CliError` 或让 CLI 兜底

### 规则

- `device.id` = 平台原生标识（米家 did / HA entity_id）；设备记录在 `devices.json` 中带 `platform` 标签
- CLI 按设备 `platform` 动态加载驱动；`--register` 自动遍历所有 enabled 平台
- 设备名匹配支持 `平台:设备名` 精确定位（跨平台同名时）
- HA 参考实现：`cli/platforms/homeassistant/`（无 spec、HTTP 状态码错误、config 表单）

## 扩展

- **加设备**：`--register` 重跑（自动发现 + 拉能力缓存）
- **加平台**（Home Assistant/涂鸦/…）：新建 `cli/platforms/<name>/driver.mjs` 实现驱动接口 + `auth` 认证器（配置页 + 登录 API），设备清单加 `platform` 标签——CLI 层零改动

## 已知限制

- **Home Assistant 为骨架实现**：驱动契约已完成，`discover()`/`act()` 尚未在真实实例上联调
- **部分设备不支持控制**：无能力定义的型号（如手环）只能注册、无法操作
- **同平台重名无法用前缀区分**：`平台:设备名` 只能消除跨平台歧义，同平台内重名需 `--rename` 改名
- **BLE 开机受限**：米家部分设备（如投影仪）关机后只能物理按键开机（平台设计限制）

## 开发与测试

```bash
node --test 'cli/test/*.test.mjs'   # 运行全部单元测试（node:test，零依赖）
```

- 测试在 `cli/test/`：设备匹配（`registry.test.mjs`）、能力规整（`capabilities.test.mjs`）、退出码契约（`errors.test.mjs`）
- 新增平台参考：`cli/platforms/xiaomi/`（完整实现）+ `homeassistant/`（骨架）

## License

MIT
