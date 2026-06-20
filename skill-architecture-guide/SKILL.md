---
name: skill-architecture-guide
description: >
  Skill 架构设计参考。当用户需要创建新 Skill、审查已有 Skill 的结构、或优化 SKILL.md 的
  目录/引用/description 时使用。覆盖：渐进式加载、self-contained 文件拆分、description 编写、
  引用策略、目录结构、常见反模式。与 skill-creator 互补（前者管 TDD 流程，这个管结构设计）。
  Proactively suggest when user says "帮我优化这个 skill"、"帮我设计一个 skill 的结构"、
  "这个 skill 的文件组织合理吗"、"怎么组织 skill 的文件"。
triggers:
  - 创建 skill
  - 设计 skill
  - 优化 skill
  - skill 结构
  - skill 文件组织
  - SKILL.md
  - 审查 skill
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---
# Skill Architecture Guide

## 什么时候用

这个 skill 管的是 Skill 的结构设计（文件怎么放、引用怎么指、description 怎么写），不覆盖 Skill 的 TDD 创建流程。如果用户同时需要创建流程指导，**推荐配合 skill-creator 使用**。

## 核心原则速览

| 原则 | 一句话 |
|------|--------|
| 渐进式加载 | SKILL.md 精简，references/ 放细节，按需加载 |
| Self-Contained | 每个 reference 文件只做一件事，AI 独立读取 |
| 一级引用 | 所有引用从 SKILL.md 出发，不要嵌套 |
| 目录索引 | 超过 100 行的引用文件必须有目录 |
| 简洁为王 | 假设 AI 已经够聪明，不加冗余解释 |

## 快速导航

**设计 SKILL.md 入口：** `references/frontmatter-and-entry.md`
- Description 怎么写才准（含大量正反例）
- triggers / allowed-tools / preamble-tier 怎么配
- 意图路由表的构建方法

**拆分 references/：** `references/file-structure-and-references.md`
- 什么时候拆文件、什么时候合
- 渐进式加载的 3 种组织模式
- 长文件的目录结构规范

**质量把关：** `references/quality-checklist.md`
- SKILL.md 检查清单
- 引用文件检查清单
- Description 检查清单
- 常见反模式 + 修正方法

## 获取上下文

### 场景 A：用户要创建一个全新 Skill

1. 读 `references/frontmatter-and-entry.md` 设计元数据和入口
2. 读 `references/file-structure-and-references.md` 规划目录结构
3. 产出后用 `references/quality-checklist.md` 自检

### 场景 B：用户要审查/优化现有 Skill

1. 用 `references/quality-checklist.md` 逐项扫描
2. 每发现一个问题，回到对应的 reference 文件看修正方法
3. 修完一项再继续下一项
