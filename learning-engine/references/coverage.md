# 覆盖度

自足的前提是**知道总共有多少**。这一节解决两件事：怎么清点，怎么算够不够。

---

## 一、清点：先列全

### CLI：先分清有没有子命令

```bash
TOOL=your-tool

# 有没有子命令？没有的话（rg、jq 这类）跳过第 2 步
$TOOL --help | grep -qE "^\s{2,}[a-z][a-z-]+\s{2,}\S" && echo "有子命令" || echo "没有子命令"
```

**有子命令时：**

```bash
# 1. 列出子命令
$TOOL --help | grep -oE "^\s{2,}[a-z][a-z-]+" | tr -d ' ' | sort -u

# 2. 每个子命令的参数（逐个跑，全部保存）
$TOOL --help > /tmp/help-root.txt
for c in $($TOOL --help | grep -oE "^\s{2,}[a-z][a-z-]+" | tr -d ' ' | sort -u); do
  $TOOL "$c" --help > "/tmp/help-$c.txt" 2>/dev/null
done
```

**数总数（两种都要用这个）：**

```bash
# 只数「看起来像参数」的行首，去重
# 不要用 grep -c "^\s+(-|--)" —— 那会把说明行也算进去
cat /tmp/help-*.txt 2>/dev/null | grep -oE '^\s+-{1,2}[A-Za-z0-9][A-Za-z0-9_-]*' \
  | tr -d ' ' | sort -u | wc -l
```

为什么不能直接数行：`--help` 里描述换行后常以 `-` 开头，会被算成参数。
实测 ripgrep 15.1.0，粗数得 145，真实是 106 —— 分母错 27%，后面覆盖度全废。

**数出来的数字要能对得上。** 抽完写进 `coverage.md` 时，
如果发现「参数 106 项」但表里只列了 80 行，说明漏了，回去补。

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

**数据库要给全，只 grep Python/JS 会漏掉 Rust、Go、C。**

```bash
{
  # Python / JS
  grep -rhoE "environ\.get\(['\"][A-Z_]+|getenv\(['\"][A-Z_]+|process\.env\.[A-Z_]+" \
    --include="*.py" --include="*.js" --include="*.ts" 2>/dev/null
  # Rust
  grep -rhoE 'env::var\("[A-Z_]+' --include="*.rs" 2>/dev/null | sed 's/.*"//'
  # Go
  grep -rhoE 'Getenv\("[A-Z_]+' --include="*.go" 2>/dev/null | sed 's/.*"//'
} | grep -oE "[A-Z_]{3,}" | sort -u > /tmp/envars.txt

wc -l < /tmp/envars.txt
```

实测：ripgrep 是 Rust 项目，只 grep Python 会得到 0 项，
而它确实有 `RIPGREP_CONFIG_PATH`。

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
python3 scripts/verify.py index.html --coverage coverage.json
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

轮次按总章数定，规则见 SKILL.md「分轮写，但只有一本书」。这里只讲每轮内部怎么做。

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

