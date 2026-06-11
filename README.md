# soulchild-skills

写给自己用的 AI Skills，顺手就丢上来了。

---

## 安装

```bash
npx skills add SoulChildTc/soulchild-skills --skill code-expolorer
npx skills add SoulChildTc/soulchild-skills --skill opencode-dev
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

---

MIT · [SoulChildTc](https://github.com/SoulChildTc)