# 抽取

目标：把参数、配置、路径这些**能被机器验证的事实**抽出来，而不是靠记忆写。

原则：**先 grep，再读，最后才写。** 写下的每一条都要能指回某一行。

---

## 通用：先摸清项目形态

```bash
# 项目类型
ls pyproject.toml setup.py go.mod package.json Cargo.toml 2>/dev/null
# 有多大
find . -name "*.py" -o -name "*.go" -o -name "*.ts" | wc -l
# 入口在哪
ls bin/ cmd/ src/ main.* 2>/dev/null
```

---

## Python CLI（typer / click / argparse）

### typer

```bash
# 所有子命令
grep -rn "@.*\.command(" --include="*.py"
# 参数定义（含默认值、帮助、环境变量名）
grep -rn "typer.Option\|typer.Argument" --include="*.py"
# 共享选项通常单独一个文件
ls **/cli_commons.py **/options.py **/common/*.py 2>/dev/null
```

读法：`typer.Option(default, "--flag", "-f", help="...", envvar="X")`
- 第一个位置参数是默认值，**可能是 `...`（必填）或 `None`**
- `envvar=` 说明它也能用环境变量
- 参数名带下划线的，CLI 里会变成连字符（`max_steps` → `--max-steps`）

### click

```bash
grep -rn "@click.option\|@click.argument\|click.Choice" --include="*.py"
```

### argparse

```bash
grep -rn "add_argument\|add_subparsers" --include="*.py"
```

`add_argument("--x", default=..., help=..., choices=[...])`

### 导出成表

写个小脚本，把签名解析成 JSON，别手抄：

```python
import ast, json, pathlib

def parse(path):
    tree = ast.parse(path.read_text())
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        for dec in node.decorator_list:
            # @app.command() / @xxx_app.command("name")
            if isinstance(dec, ast.Call) and "command" in ast.unparse(dec.func):
                out.append({
                    "name": dec.args[0].value if dec.args else node.name,
                    "func": node.name,
                    "line": node.lineno,
                    "params": [a.arg for a in node.args.args],
                })
    return out

for p in pathlib.Path(".").rglob("*.py"):
    for item in parse(p):
        print(json.dumps({"file": str(p), **item}, ensure_ascii=False))
```

---

## Go CLI（cobra / urfave）

```bash
# cobra
grep -rn "Flags()\.\|PersistentFlags()\.\|\.String(\|\.Bool(\|\.Int(" --include="*.go" | grep -v _test
# 子命令注册
grep -rn "AddCommand\|&cobra.Command" --include="*.go"
# urfave/cli
grep -rn "cli.StringFlag\|cli.BoolFlag\|cli.Command{" --include="*.go"
```

读法：`.String("name", "default", "usage")` — 第二第三个参数就是默认值和说明。

---

## Node / TypeScript CLI

```bash
# commander
grep -rn "\.option(\|\.requiredOption(\|\.command(" --include="*.ts" --include="*.js" | grep -v node_modules
# yargs
grep -rn "\.options(\|\.option(\|describe:" --include="*.ts" --include="*.js" | grep -v node_modules
```

读法：`.option("--x <val>", "说明", "默认值")`

---

## 库 / SDK（没有 CLI）

抽**公开 API 面**，不是内部实现：

```bash
# Python
grep -n "__all__\|^class \|^def " __init__.py
# 构造参数
grep -n "def __init__" -A 20

# TypeScript
grep -n "export " index.d.ts
# 或直接读生成的 .d.ts
```

重点抽：
- 构造函数参数（就是"配置"）
- 必填 vs 可选
- 泛型约束（说明它能干什么）

---

## 环境变量

```bash
grep -rn "os.environ\|os.getenv\|process.env\|std::env::var" \
  --include="*.py" --include="*.ts" --include="*.js" --include="*.go" --include="*.rs" \
  | grep -v node_modules | grep -v _test
```

常见坑：

- **官方文档通常只列一部分**。源码里有的文档里没有，这是常态，不是例外。
- 变量名是否加载后就没用了（读一次 vs 每轮读）
- 有没有默认值，默认值是不是写死在代码里

---

## 配置文件

```bash
# Python (pydantic)
grep -rn "class .*BaseSettings\|class .*BaseModel" -A 40 --include="*.py"
# 默认配置位置
grep -rn "expanduser\|DEFAULT_.*LOCATION\|config_path" --include="*.py"
# TypeScript
find . -name "*.schema.json" -o -name "config*.json" | grep -v node_modules
```

注意区分三种入口，别混：

| 形态 | 是什么 | 例子 |
|---|---|---|
| `--flag` / `-f` | 命令行参数 | `--max-steps 20` |
| `UPPER_SNAKE` | 环境变量 | `HOLMES_CONFIGPATH_DIR` |
| `lower_snake` | 配置文件字段 | `max_steps: 100` |

一个名字属于哪类，看**它是怎么被读的**，不是看它长什么样。

---

## 文件路径

```bash
grep -rn "expanduser\|Path.home()\|/etc/\|/var/\|DEFAULT_.*PATH" --include="*.py" --include="*.ts"
```

要找的是：程序在自己目录下留了什么文件（缓存、状态、锁）。

这类信息官方文档经常不写，但用户会撞上"为什么我的状态不对"。

---

## 版本

**记录你读的是哪个版本。** 行号会漂，URL 会变。

```bash
git rev-parse HEAD
git log -1 --format="%h %ci"
```

写进页面底部或来源里。上游一改，至少知道对的是哪一版。
