# PIPELINE_STATE — 《思考，快与慢》

> 断点续跑用。每完成一个阶段更新此文件。

- **书**: 《思考，快与慢》(Thinking, Fast and Slow) / 丹尼尔·卡尼曼, 2011
- **源文件**: `/Users/soulchild/Documents/books/思考, 快与慢 = ....epub` → `sources/fulltext.txt` (pandoc 转换, 4815 行 / 964 KB)
- **产物目录**: `books/thinking-fast-slow/` (repo: `/Users/soulchild/code/soulchild-skills/`)
- **流水线**: RIA-TV++ (cangjie-skill v2.5 Bundle 版)
- **输出模式**: single (用户确认; 后续可从 Bundle 重编译为 pack)
- **侧重**: B 全面均衡提取 (用户确认)

## 当前阶段

- [x] **阶段 0: Adler 整书理解** → `BOOK_OVERVIEW.md` (已完成, 全书 4815 行已通读; 用户确认「继续」)
- [x] **阶段 1: 5 个 extractor 并行提取** → `candidates/` (已完成, 共 225 条候选: frameworks 27 / principles 63 / cases 70 / counter-examples 35 / glossary 30; .cangjie/index 已建 28 块 FTS5 索引)
- [x] **阶段 1.5: 三重验证筛选** → `verified.md` + `coverage-audit.md` + `references.md` + `needs-review.md` + `rejected/` (已完成: 225 候选 → 28 个 verified 单元 + 8 参考原则 + 5 待核查 + 0 淘汰; 15/15 任务有去向; 用户确认「继续」)
- [x] **阶段 1.6: 独立 Skill 晋级门** → `verified.yaml` promotion 字段 + `destinations.json` (已完成: 28 单元中 0 promoted / 28 router — single 模式预算 8, 高频意图经路由入口访问不失联; 五判据记录在各能力 promotion.notes)
- [x] **阶段 2: RIA++ 构造能力卡** → `.cangjie/capabilities/cards/*.md` + `verified.yaml` (28 张卡, 六段 R/I/A1/A2/E/B 完整; bundle schema VALID)
- [x] **阶段 3: Zettelkasten 链接** → also_read 已回填 verified.yaml; 术语落 `.cangjie/capabilities/book/glossary.md` + book/overview.md; 路由表/索引由编译器生成
- [x] **阶段 4: 压力测试** → 见下方「阶段 4 记录」(静态校验 0 errors; 触发/输出实测待 darwin 流程)
- [x] **阶段 5: 编译与交付** → `cangjie.py compile --output single` 成功发布 run-20260920-163004-2f8de5; validate_skill_pack 0 errors; `DIGEST.md` 已生成

## 阶段 4 记录（诚实标注）

- 静态校验: validate_skill_pack.py → **0 errors** / 1 warning（dist 目录名与 skill name 不一致, 无害）
- 完整性: 28/28 能力卡编译进产物, frontmatter 100% 可解析; 相对引用 100% 有效
- **纸面演练 ≠ 实测**: 阶段 1.5 的 V2 均为纸面 walkthrough; 真实宿主环境的触发评测与输出评测未执行。建议用 darwin-skill 跑 eval 后再宣称「已实测」

## 关键决策记录

- 输出模式 single (用户 2026-09-20 确认)
- 输出位置: 当前 repo `books/thinking-fast-slow/`, 不做安装 (用户确认)
- 侧重点 B 全面均衡 (用户确认)
- 晋级门: single 模式 + 预算 8, 全部能力 router 化, 意图驱动路由 (详见 destinations.json)
- 阶段 0 批判要点: 启动效应/自我损耗章节受复现危机影响 → 相关候选降级 needs_review (5 项, 见 needs-review.md)

## 下一步

- 可选: 用 darwin-skill 对 dist/ 跑自动进化（触发评测 + 输出评测）
- 可选: `cangjie.py replan-output` 随时重估 single→pack（同一 Bundle 零返工）
- 可选: `cangjie.py update` 登记新来源做增量更新
