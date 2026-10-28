# 覆盖度

自足的前提是**知道总共有多少**。这一节解决两件事：怎么清点，怎么算够不够。

---

## 一、清点：先列全

### CLI

```bash
TOOL=your-tool

# 1. 所有子命令
$TOOL --help | grep -E "^\s+[a-z][a-z-]+" | awk '{print $1}'

# 2. 每个命令的参数（逐个跑，全部保存）
$TOOL --help > /tmp/help-root.txt
for c in $($TOOL --help | grep -E "^\s+[a-z][a-z-]+" | awk '{print $1}'); do
  $TOOL "$c" --help > "/tmp/help-$c.txt" 2>/dev/null
done

# 3. 数总数
cat /tmp/help-*.txt | grep -cE "^\s+(-|--)"
```

### 库 / SDK

```bash
# Python：导出面
python3 -c "import pkg; print(len([x for x in dir(pkg) if not x.startswith('_')]))"
grep -c "^def \|^class " pkg/__init__.py

# TypeScript
grep -c "^export " index.d.ts

# Go
grep -c "^func [A-Z]" *.go
```

### 配置项

```bash
# pydantic settings
grep -cE "^\s+[a-z_]+:" config.py
# JSON schema
python3 -c "import json;print(len(json.load(open('schema.json'))['properties']))"
```

### 环境变量

```bash
grep -rhoE "environ\.get\(['\"][A-Z_]+|getenv\(['\"][A-Z_]+" --include="*.py" | \
  grep -oE "[A-Z_]{3,}" | sort -u > /tmp/envars.txt
wc -l /tmp/envars.txt
```

### 计数规则

`total` 算的是**能力项**，不是帮助文本行数：

| 算什么 | 例子 |
|---|---|
| 一个子命令 = 一项 | `investigate alertmanager` |
| 一个参数 = 一项 | `--max-steps` |
| 一个导出符号 = 一项 | `create_agent` |
| 一个配置字段 = 一项 | `max_steps` |
| 一个环境变量 = 一项 | `HOLMES_CONFIGPATH_DIR` |
| 帮助文本的换行、示例 | **不算** |

---

## 二、记录：coverage.md

```markdown
# 覆盖清单 · <项目> <版本>

清点日期：2026-10-28
清点来源：`<tool> --help` 全部输出、`pkg/__init__.py`、`config.py`

### 命令（13 项）

| 项 | 状态 | 位置 |
|---|---|---|
| `ask` | ✅ | 第二关第 3 页 |
| `investigate alertmanager` | ✅ | 第三关第 2 页 |
| `generate alertmanager-tests` | 📝 | 仅参考栏 |
| `checks run` | ❌ | 需要 K8s 集群才能验证 |

### 参数（61 项）
...

### 环境变量（13 项）
...
```

状态定义：

| 标记 | 含义 |
|---|---|
| ✅ | 正文有讲解 + 有可跑例子 + 参考栏有条目 |
| 📝 | 只在参考栏，正文没展开 |
| ❌ | 不写，**必须写原因** |

`❌` 只允许三种原因：

1. 需要特定硬件或环境（如 GPU、K8s 集群）
2. 闭源、不可验证
3. 已废弃

---

## 三、统计：coverage.json

```json
{
  "total": 104,
  "written": 101,
  "skipped": [
    {"item": "--engine", "reason": "需要特定硬件"},
    {"item": "--legacy-env", "reason": "已废弃"}
  ]
}
```

- `total` = 清点出的总数
- `written` = ✅ + 📝 的数量
- `skipped` = ❌ 的项，每条必须有 `reason`

跑校验：

```bash
python3 scripts/verify.py output.html --coverage coverage.json
```

---

## 四、判定

| 覆盖度 | 结果 | 处理 |
|---|---|---|
| ≥ 95% | 通过 | 剩下的都是 ❌ 且有原因 |
| 80–95% | 通过但提醒 | intro 里列出没覆盖什么 |
| < 80% | 不合格 | 继续写；写不完就分册继续 |

---

## 五、分册时怎么算

分册后，**覆盖度按整套算，不是按单册算**。

```json
{
  "total": 104,
  "written": 101,
  "volumes": [
    {"file": "part1.html", "items": 45},
    {"file": "part2.html", "items": 56}
  ],
  "skipped": [...]
}
```

单册可以只覆盖一部分，但整册集合起来必须达到 95%。

**第一册交付时**，就要给出完整的 coverage.json（包含后面几册的预计覆盖），
让用户知道这不是「写了一半」，而是「按计划分册」。

---

## 六、常见错误

| 错误 | 为什么错 | 改法 |
|---|---|---|
| 用「常用 30 条」代替清点 | 不知道总数，无法算覆盖度 | 先跑 `--help` 数出 total |
| 把 help 的行数当条目数 | 一个参数可能占 5 行 | 按参数名去重再数 |
| 只数命令不数参数 | 参数才是最难查的部分 | 命令和参数分开算，都计入 total |
| 覆盖度 < 80% 就交付 | 不满足自足 | 继续写，或明确降级为「速览」并告知用户 |
| `skipped` 不写原因 | 无法判断是真不需要还是偷懒 | 每条都必须有 reason |

---

## 多轮交付

自足不等于一次交付完。四层全写是 30–120 页，分轮做。

| 轮次 | 你做什么 | 交付物 | 覆盖度 |
|---|---|---|---|
| **第 1 轮** | 清点 + 规划 + 写第一册 | `coverage.md`、`coverage.json`、`part1.html` | 30–50% |
| **第 2 轮** | 按 coverage 补齐 | `part2.html` | 60–80% |
| **第 3 轮** | 补齐剩余 + 全量校验 | `part3.html`、更新 coverage | ≥ 95% |

项目大的（500+ 项）可能到第 5–6 轮。每轮结束都要更新 coverage.json。

### 第 1 轮的四个交付物

缺一个都不算完成第 1 轮：

1. **`coverage.md`** — 全部条目 + 状态 + 归属哪册
2. **`coverage.json`** — `total` 是**完整总数**，不是本册数
3. **`part1.html`** — 第一册页面
4. **一句明确的话**：「后面还有 N 册，覆盖剩下的 X 项」

第 4 条不能省。写进 intro，或者直接告诉用户。否则用户会以为你只做了这么多。

### 不要第 1 轮就说「做完了」

没达到 95% 覆盖，就是没做完。正确说法：

```
第一册完成，覆盖 45/104 项（43%）。
剩下 59 项在第二册，主要是 investigate 系列命令和全部配置项。
要现在继续吗？
```

错误说法：

```
做好了，你看看。
```

### 每册结尾指向下一册

用 `series.next` 字段：

```json
"series": {
  "name": "Docker 读本",
  "part": 1,
  "total": 5,
  "next": {"title": "第二册：镜像构建与编排", "path": "part2.html"}
}
```

页脚会自动变成「读完了 · 下一册：第二册」。
