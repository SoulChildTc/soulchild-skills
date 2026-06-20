# soulchild-skills

写给自己用的 AI Skills，顺手就丢上来了。

---

## 安装

```bash
# 多选安装
npx skills add SoulChildTc/soulchild-skills

# 指定安装
npx skills add SoulChildTc/soulchild-skills --skill code-expolorer
npx skills add SoulChildTc/soulchild-skills --skill opencode-dev
npx skills add SoulChildTc/soulchild-skills --skill prompt-gen
npx skills add SoulChildTc/soulchild-skills --skill skill-architecture-guide
```

---

## code-expolorer

读别人代码的时候用的。你大概也遇到过这种场景：打开一个项目，文件一堆，不知道从哪看起。丢给它一个功能名字，它会从宏观到细节递进着讲，最后用大白话给你总结一遍。

**适合场景：** 接手项目、读开源代码、理解模块怎么工作的
**触发方式：** `用 code-explorer 帮我分析 xx`、`这个模块怎么工作的`

[→ SKILL.md](./code-expolorer/SKILL.md)

## opencode-dev

基于 Open Code 做开发时查的。Open Code TUI 的完整参考——架构、会话、消息、权限、SSE 事件、SDK API、OpenAPI 端点表，全在一份 SKILL.md 里，不用反复翻源码。

**适合场景：** 基于 SDK 做二次开发、写移动端、理解 Open Code 内部机制
**触发方式：** 上下文自动触发

[→ SKILL.md](./opencode-dev/SKILL.md)

## prompt-gen

提示词生成器。把脑子里模糊的想法变成结构化的 AI 提示词，自动判断任务复杂度选择精简或完整模板，生成后还会自检一遍。

**适合场景：** 写新提示词、优化现有提示词、把模糊需求变成可执行指令
**触发方式：** `帮我写个提示词`、`优化这个 prompt`、`生成 prompt`

[→ SKILL.md](./prompt-gen/SKILL.md)

## skill-architecture-guide

Skill 架构设计参考。当你创建新 Skill、审查已有 Skill 结构或优化 SKILL.md 时使用。覆盖渐进式加载、self-contained 文件拆分、description 编写、引用策略、目录结构、常见反模式。

和 skill-creator 的关系：skill-creator 管 TDD 创建流程（写 → 测 → 改），skill-architecture-guide 管结构设计（文件怎么放、引用怎么指、description 怎么写）。两者互补，可以一起用。

**适合场景：** 创建新 Skill、优化已有 Skill、审查 Skill 结构
**触发方式：** `帮我设计一个 skill`、`这个 skill 结构合理吗`、`帮我优化 skill`

[→ SKILL.md](./skill-architecture-guide/SKILL.md)

---

MIT · [SoulChildTc](https://github.com/SoulChildTc)