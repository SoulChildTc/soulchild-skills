# 文件结构与引用策略

## Contents

- 渐进式加载的三层模型
- 什么时候拆文件、什么时候合
- 三种渐进式加载模式
- 引用文件命名规范
- 长文件目录规范
- 常见陷阱

## 渐进式加载的三层模型

SKill 的加载是分层、按需的，不是一次性全读：

```
Level 1: 元数据 (name + description)  → 始终在上下文中 (~100 tokens)
Level 2: SKILL.md 正文                → 触发时加载 (<5000 tokens / <500 行)
Level 3: 资源 (scripts/references/)   → 按需加载
```

这个模型意味着：
- 不要把 Level 2 的内容塞到 Level 1（description 写工作流）
- 不要把 Level 3 的内容塞到 Level 2（SKILL.md 爆 500 行）
- Level 3 是主力——引用文件数量没有限制，只在读时才消耗 token

## 什么时候拆文件

拆文件的信号：

| 信号 | 说明 |
|------|------|
| SKILL.md 超过 500 行 | 拆到 references/ |
| 一个文件包含多个步骤/领域 | AI 在执行步骤 A 时不需要步骤 B 的内容 |
| 某个章节只在特定条件下需要 | 条件性内容放到单独文件，需要时才读 |
| 有可执行的脚本 | 放到 scripts/，AI 执行而不是读取 |

不拆的信号：

| 信号 | 说明 |
|------|------|
| 内容少于 100 行 | 拆了反而让 AI 多一次 Read 操作 |
| 所有步骤都会用到的基础规则 | 放在 SKILL.md 正文全局有效 |
| 示例代码 <50 行 | 内联在 SKILL.md 里更方便 |

## 三种渐进式加载模式

### 模式 1：高维指引 + 引用

SKILL.md 给核心流程和路由，每个详细环节指向一个 reference 文件：

```markdown
## 工作流

**Step 1：选题** → 详见 `references/topic-discovery.md`
**Step 2：大纲** → 详见 `references/outline.md`
```

AI 在 Step 1 时只读 `topic-discovery.md`，读完进入 Step 2 再读 `outline.md`。

### 模式 2：按领域组织

适合覆盖多个子领域的 skill（如数据分析覆盖 财务/销售/市场）：

```
bigquery-skill/
├── SKILL.md (总入口 + 导航)
└── references/
    ├── finance.md
    ├── sales.md
    └── marketing.md
```

SKILL.md 把各领域列出，AI 根据用户问题读对应的文件。

### 模式 3：条件展开

SKILL.md 给出基础内容，进阶/特殊场景指向单独文件：

```markdown
## 基本用法
[基础指令]

## 进阶功能
**批处理：** 见 [BATCH.md](references/BATCH.md)
**错误重试：** 见 [RETRY.md](references/RETRY.md)
```

AI 只在用户需要时才会读这些文件。

## 引用文件命名规范

- **含义优先于格式**：`wxmp-writing.md` ✅ `doc2.md` ❌
- **前缀区分命名空间**：`wxmp-` 前缀让 AI 知道这是微信工作流的一部分
- **按内容分文件**：一个文件只做一件事
- **不要用序号**：`step1.md` `step2.md` 改了顺序文件名就乱了

## 长文件目录规范

> 超过 100 行的引用文件必须加目录。Claude 可能用 `head -100` 预览，有了目录就能在预览时看到全貌。

```markdown
# 文件标题

## Contents

- 章节 A
- 章节 B（含子主题 b1、b2）
- 章节 C

## 章节 A
```

目录的"章节 B"后面括注子主题，帮助 AI 判断是否需要跳转过去读。

## 一级引用原则

**所有引用从 SKILL.md 出发，reference 文件之间不互相引用。**

```
✅ 正确：
SKILL.md → references/foo.md (一级)
SKILL.md → references/bar.md (一级)

❌ 错误：
SKILL.md → references/foo.md
           references/foo.md → references/bar.md (二级)
```

嵌套引用后 Claude 可能用 `head -100` 预览子文件——读到一半不够用，但没读到后半段。
