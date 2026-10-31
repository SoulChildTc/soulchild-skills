# smart-home CLI 驱动契约重构：面向多平台（HA 预留）Implementation Plan

**Goal:** 把 CLI 的驱动契约从"米家 spec 三段结构"抽象为**统一能力清单 + action/get 操作 + 平台自管理错误码**，使 Home Assistant（无 spec、HTTP 状态码、service 调用）等平台无需改框架即可接入。

**Architecture:** 三层职责重划——CLI 层只定义并消费**契约**（能力清单、act 签名、PlatformError）；各平台驱动把**自己的能力/错误/动作语义**翻译成契约。米家驱动内部保留 spec，但通过转换函数暴露能力清单；HA 驱动直接从 domain service 生成能力清单。

**Tech Stack:** Node.js ≥18 内置模块（零 npm 依赖）、node:test（内置测试）、ESM

---

## 契约设计

### 1. 统一能力清单（替换 props/actions/keys 三段）

`driver.capabilities(device)` 返回**能力清单数组**：

```js
{
  name: 'volume',          // 归一化能力名（AI 与 CLI 都用这个）
  kind: 'set',             // 'action' | 'get' | 'set'
  desc: '音量',            // 中文描述
  params: [{ name, format, values, range, unit }],  // 动作/写属性参数定义
  values: [{value:0,desc:'停止'}],  // 读回枚举翻译（kind:'get'）
  range: [0,100,2],        // 数值范围 [min,max,step]（CLI 自动步进规整）
  unit: 'percentage',      // 单位
}
```

**kind 语义**：
- `action`：无返回值或只报成败的动作（播放/关机/按键/带参动作）
- `get`：可读属性（读回值，枚举自动翻译）
- `set`：可写属性（`act(kind='action', name='volume', {value:20})`）

**表达力保证**：
- 无参动作 → `{kind:'action', name:'play'}`
- 带参动作 → `{kind:'action', name:'post', params:[...]}`
- 可读写属性 → `{kind:'set', name:'volume', range, unit}`
- 只读状态 → `{kind:'get', name:'playing-state', values}`
- 枚举/范围/步进/单位 → `values/range/unit`
- **未知/复杂能力兜底**：任何无法结构化描述的能力，仍可 `{kind:'action', name, desc}` 暴露为动作，raw 透传在 `--json` 的 `data` 里供 AI 查看

### 2. act 收敛为 action/get 两类

`driver.act(device, kind, name, params)`，`kind: 'action' | 'get'`。

**CLI 命令映射**：
- `--action <name>` → `act(device, 'action', name, {})`
- `--set <name> <value>` → `act(device, 'action', name, { value })`
- `--key <name>` → `act(device, 'action', name, {})`（按键 = 无参 action）
- `--get <name>` → `act(device, 'get', name)`

### 3. PlatformError（平台自管理错误码 + 中文含义）

```js
throw new PlatformError(exitCode, errorKind, userMessage, { platformCode, raw });
```

- 米家驱动内置 `MIJIA_ERRORS` 表（-704042011 离线 / -704220043 值错误 / -8 格式错误 → 中文）
- HA 驱动内置 HTTP 状态码 → 中文（401 token 无效 / 404 实体不存在）
- CLI 层捕获 → 退出码 + 输出平台中文含义

---

## 目标文件结构

```
cli/
├── device.mjs              # CLI 入口（消费契约）
├── lib/
│   ├── errors.js           # EXIT + CliError + PlatformError
│   ├── capabilities.js     # 能力清单查找/参数规整/读回翻译
│   ├── output.js           # --list 遍历能力清单
│   └── ...
├── test/
└── platforms/
    ├── xiaomi/             # 适配新契约（spec→能力清单转换层）
    └── homeassistant/      # 驱动骨架（token 登录 / 无 spec）
```

---

## Task 1: lib/errors.js 加 PlatformError + 测试

- Modify: `cli/lib/errors.js`
- Create: `cli/test/errors.test.mjs`（扩展）

```js
export class PlatformError extends Error {
  constructor(exitCode, kind, message, { platformCode, raw, data } = {}) {
    super(message);
    this.exitCode = exitCode;
    this.kind = kind;
    this.message = message;
    this.platformCode = platformCode;
    this.raw = raw;
    this.data = data;
  }
}
```

## Task 2: lib/capabilities.js 能力清单查找/参数规整/读回翻译 + 测试

- Rewrite: `cli/lib/capabilities.js`
- Create: `cli/test/capabilities.test.mjs`

```js
export function findCapability(list, name) { ... }
export function normalizeActionParams(capability, rawParams) { ... }  // 步进规整
export function coerce(format, value) { ... }
export function translateValue(capability, value) { ... }  // 枚举翻译
```

## Task 3: lib/output.js --list/读回遍历能力清单

- Rewrite: `cli/lib/output.js`

按 kind 分组输出（可写属性 / 只读属性 / 动作按键），读回用 translateValue 翻译。

## Task 4: xiaomi/driver.mjs spec→能力清单 + act 归一 + MIJIA_ERRORS

- Rewrite: `cli/platforms/xiaomi/driver.mjs`

`specToCapabilities(spec)` 转换层 + `act` 归一为 action/get + MIJIA_ERRORS 错误码表。

## Task 5: device.mjs 消费能力清单 + action/get + PlatformError

- Rewrite: `cli/device.mjs`

## Task 6: help.js + cli/README.md 契约文档

- Modify: `cli/help.js`, `cli/README.md`

## Task 7: homeassistant/driver.mjs 骨架 + README

- Create: `cli/platforms/homeassistant/driver.mjs`
- Create: `cli/platforms/homeassistant/README.md`

token 登录（无 OAuth）/ 无 spec（domain→能力清单）/ HTTP 错误码→中文。

## Task 8: 回归 + SKILL.md/顶层 README 同步

---

## 验收标准

1. `capabilities()` 返回统一能力清单（米家转换层 + HA domain 生成层）
2. `act()` 收敛为 action/get，`--set/--key/--action` 归一为 action
3. `PlatformError` 让平台自管理错误码 + 中文，`--json` 输出 platformCode
4. `homeassistant/driver.mjs` 骨架存在，`--login homeassistant` 报"未配置 token"（AUTH/5）
5. 既有测试 + 新增 capabilities 测试全过，米家全链路冒烟不变
6. 文档契约一致

## 风险

- `--list` 输出格式变化，需核对 SKILL.md 意图映射
- 米家 `_mapping` 私有字段可能暴露在 `--json` caps 输出（可选优化剔除）
- HA 骨架无真实实例验证，联调待 HA 就绪
