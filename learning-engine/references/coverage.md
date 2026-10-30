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
| < 80% | 不合格 | 继续写；写不完就分轮追加章节 |

---

## 五、常见错误

| 错误 | 为什么错 | 改法 |
|---|---|---|
| 用「常用 30 条」代替清点 | 不知道总数，无法算覆盖度 | 先跑 `--help` 数出 total |
| 把 help 的行数当条目数 | 一个参数可能占 5 行 | 按参数名去重再数 |
| 只数命令不数参数 | 参数才是最难查的部分 | 命令和参数分开算，都计入 total |
| 覆盖度 < 80% 就交付 | 不满足自足 | 继续写，或明确降级为「速览」并告知用户 |
| `skipped` 不写原因 | 无法判断是真不需要还是偷懒 | 每条都必须有 reason |

---

## 分轮写

轮次的划分见 SKILL.md「分轮写，但只有一本书」。这里只讲每轮内部怎么做。

### 每轮开始前必做

**🔴 先读一遍已有的 `content.json`。**

不是看一眼，是完整读。要确认：

- 用了哪些术语，定义在哪一章
- 前面承诺过「后面会讲 X」，X 现在要讲到了吗
- 章节编号到哪儿了
- `sources` 里已有哪些 key，新写的别重复

不读就写，会忘掉前面的约定，写出来的东西和前面接不上。

### 每轮结束时

1. 把新章节追加到 `stages` 数组
2. 更新 `coverage.json` 的 `written`
3. 跑 `python3 scripts/book.py all content.json`
4. 告诉用户：「已写 N 章 M 节，覆盖 X/Y 项。还差 Z。」

### 章节顺序

**新章节必须接在合理的位置，不能一律往末尾追加。**

比如第 1 轮写了「跑起来」，第 2 轮要加「镜像」——镜子应该在「容器的一生」之前。
这时要**插入到中间**，不是 append。

顺序规则见 SKILL.md 第四步「概念台账」：引入必须先于使用。

