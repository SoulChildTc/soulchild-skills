# Frontmatter & 入口设计

## Contents

- Description 的规则与正反例
- triggers / allowed-tools / preamble-tier
- 意图路由表

## Description 编写规则

### 核心原则

**Description = 告诉 AI "什么时候用"，不是"怎么用"**

把 workflow 写进 description 会导致 AI 跳过 SKILL.md 正文——它在 meta 层就已经"知道怎么做了"，不会再加载 detail。

### 格式要求

- 第一句概括做什么，后续补充触发场景
- 第三人称（注入 system prompt 时第一/二人称会混乱）
- 1-1024 字符

### 正反例

```
❌ 总结了工作流：
Use when executing plans - dispatches subagent per task with code review between tasks

❌ 第一人称：
I can help you write WeChat articles

✅ 纯触发条件，第一句概述 + 后续场景：
微信公众号内容创作。Use when user mentions writing articles, WeChat Official Account,
or content publishing. Proactively suggest when the user says "最近没什么灵感"
```

### 关键词策略

AI 用 description 做技能选择的唯一依据。关键词越全、越具体，匹配越准。

- 覆盖用户可能说的各种表达：写文章、发文、公众号、选题、内容运营
- 考虑缩写和别名：GitHub → gh, 微信公众号 → wxmp
- 包含边界场景：什么时候用这个、什么时候不用

## triggers 字段

辅助 AI 判断是否触发此 skill。写用户可能说的真实短语，长短搭配：

```yaml
triggers:
  - 公众号          # 短关键词
  - 写文章
  - 帮我写篇公众号    # 完整句子
  - 内容运营
```

## allowed-tools 字段

限制 AI 在执行这个 skill 时可以调用的工具。不是限制 AI——是帮 AI 提前知道自己能用什么。

```yaml
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - WebSearch
  - WebFetch
```

常见的工具清单：Bash, Read, Write, Edit, WebSearch, WebFetch, Glob, Grep

## preamble-tier

控制 skill 优先级，数值越高越优先。多数 skill 不需要设。

## 意图路由表

入口 SKILL.md 最核心的内容是意图路由——用户说不同的话，走不同的路径。

### 设计方法

1. **列举用户可能说的所有话**
2. **分组归类**：完整流程 / 局部调用 / 配置问题
3. **判断模糊场景**：拿不准的加"如果不确定，直接问"

### 格式

```markdown
| 用户说的 | 走哪条路 |
|---------|---------|
| "帮我写篇公众号" | 完整流程 |
| "帮我想几个标题" | 只调标题生成器 |
| "帮我配置" | 配置助手 |
```

### 关键

- 每个路由指向 SKILL.md 中的具体步骤或 reference 文件
- 不要让 AI 猜——给明确的"走哪条路"
- 覆盖不了的场景加兜底："如果不确定用户意图，直接问"
