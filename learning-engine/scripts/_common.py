"""
四个校验脚本共用的部分。

存在理由：plain() 在两个脚本里各有一份且语义不同
（lint 的返回 ""，order 的会抛 TypeError）。
这种「看起来是重复，实际是 bug」的东西，必须只有一份。
"""
import json
import re


def plain(t):
    """去 HTML 标签，拿纯文本。

    只剥已知标签，不吞掉正文里的 < >。
    '<code>a</code> 用 < 比较' → 'a 用 < 比较'
    """
    if not isinstance(t, str):
        return ""
    # 先把已知行内标签去掉，保留其它尖括号
    s = re.sub(r"</?(?:code|b|strong|em|i|br|span|a|sup)\b[^>]*>", "", t)
    # 块级标签换成空格
    s = re.sub(r"</?(?:p|div|li|ul|ol|h[1-6]|pre|table|thead|tbody|tr|td|th|dl|dt|dd)\b[^>]*>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load(path):
    """读 JSON。失败时给出定位信息，不是抛栈。"""
    try:
        return json.load(open(path)), None
    except FileNotFoundError:
        return None, f"文件不存在: {path}"
    except json.JSONDecodeError as e:
        msg = f"{path} 第 {e.lineno} 行第 {e.colno} 列: {e.msg}"
        if e.doc:
            lines = e.doc.split("\n")
            if 0 < e.lineno <= len(lines):
                msg += f"\n  {lines[e.lineno-1][:100]}"
        return None, msg


class Result:
    """校验结果。errors 决定退出码，warns 只是提示。"""

    def __init__(self):
        self.errors = []
        self.warns = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warns.append(msg)

    def report(self, title="", limit=25):
        """打印结果。返回是否通过。"""
        if title:
            print(f"\n{title}")

        if self.errors:
            print(f"\n✗ {len(self.errors)} 个硬伤\n")
            for e in self.errors[:limit]:
                print("   ", e)
            if len(self.errors) > limit:
                print(f"    ... 还有 {len(self.errors)-limit} 个")

        if self.warns:
            print(f"\n! {len(self.warns)} 条建议\n")
            for w in self.warns[:limit]:
                print("   ", w)
            if len(self.warns) > limit:
                print(f"    ... 还有 {len(self.warns)-limit} 条")

        if not self.errors and not self.warns:
            print("✅  没有发现问题")

        return not self.errors

    def exit(self, strict=False):
        raise SystemExit(0 if (not self.errors and not (strict and self.warns)) else 1)


# ── 中文数字 → 整数，用于「标题声称数量」检查 ──
CN_NUM = {"一":1,"二":2,"三":3,"四":4,"五":5,
          "六":6,"七":7,"八":8,"九":9,"十":10}


def claimed_count(title):
    """从「三种方式」「四个问题」「三种命令：a、b、c」这类标题里取声称的数量。

    只认「数量词 + 量词」，不要求在冒号后面 —— 中文标题里
    「三种用法，选一个」和「命令清单：五个子命令」都常见。
    返回 None 表示标题里没有数量声明。
    """
    t = title or ""
    m = re.search(r"([二两三四五六七八九十]+)\s*[种个类条步层]份?", t)
    if not m:
        return None
    # 「一个」多半是泛指（「一个告警」「一个问题」），不算计数声明。
    # 「两个」是明确计数，保留。
    if m.group(1) == "一":
        return None
    if m.group(1) == "两":
        return 2
    return CN_NUM.get(m.group(1))


def iter_steps(data):
    """遍历所有页，产出 (章序号, 节序号, 章, 节, 标签)。"""
    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}「{sp.get('title','?')}」"
            yield si, ii, st, sp, loc
