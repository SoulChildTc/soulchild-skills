#!/usr/bin/env python3
"""
学习读本的统一入口。

    python3 book.py check content.json      # 结构 + 文风 + 顺序，一次跑完
    python3 book.py build content.json      # 校验 + 生成 index.html
    python3 book.py verify index.html --expect content.json
    python3 book.py all content.json        # check + build + verify

为什么合并：
    原来要记四条命令、三种 flag（--check / --strict / --coverage），
    失败还要自己判断先修哪个。现在 check 失败即停，按顺序给结论。

每一步都不改文件，check 是只读的。
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

USAGE = """\
用法：
    python3 book.py check  content.json [--coverage coverage.json]
    python3 book.py build  content.json [-o out.html] [--theme paper|longread]
    python3 book.py verify index.html [--expect content.json] [--coverage coverage.json]
    python3 book.py all    content.json [--theme paper|longread] [--coverage coverage.json]

退出码：0 全过，1 有问题
"""


def check_coverage_quick(path):
    """直接调 verify.py 的 check_coverage，规则只在那一处维护。"""
    sys.path.insert(0, HERE)
    from verify import check_coverage
    return check_coverage(path)


def run(script, args, label, strict=False):
    """跑一个子脚本，透传输出。返回是否通过。"""
    cmd = [sys.executable, os.path.join(HERE, script)] + args
    if strict:
        cmd.append("--strict")

    print(f"\n{'─' * 60}")
    print(f"  {label}")
    print(f"{'─' * 60}")

    r = subprocess.run(cmd, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if out:
        print(out)

    return r.returncode == 0


def cmd_check(path, coverage=None):
    """结构 + 文风 + 顺序。带了 --coverage 就顺带查覆盖度自洽。"""
    if coverage:
        level, msg = check_coverage_quick(coverage)
        print(f"\n{'─' * 60}")
        print("  覆盖度")
        print(f"{'─' * 60}")
        if level == "error":
            print(f"✗ {msg}")
            return False
        if level == "warn":
            print(f"! {msg}")
        else:
            print("✅ 覆盖度达标")

    # 只有 build.py 是硬闸门（结构错了渲染就是坏的）。
    # lint / order 输出的「!」是建议，不阻断 —— 它们的判断带主观性，
    # 卡死会让 agent 为了过检查去改内容。
    steps = [
        ("build.py", [path, "--check"], "① 结构（字段、类型、角标、表格）｜硬闸门"),
        ("lint.py", [path], "② 文风（AI 腔、空话、加粗、来源结构）｜建议"),
        ("order.py", [path], "③ 阅读顺序（前向引用、概念跳跃、章首章末）｜建议"),
    ]

    for script, args, label in steps:
        if not run(script, args, label):
            print(f"\n❌ 停在 {label.split('（')[0]}。修完再跑 check。")
            return False

    print(f"\n{'─' * 60}")
    print("✅ 三项全过")
    return True


def cmd_build(path, out=None, theme=None):
    if not cmd_check(path):
        return False

    print(f"\n{'─' * 60}")
    print("  生成")
    print(f"{'─' * 60}")

    args = [path]
    if out:
        args += ["-o", out]
    if theme:
        args += ["--theme", theme]

    return run("build.py", args, "build.py")


def cmd_verify(html, expect=None, coverage=None):
    args = [html]
    if expect:
        args += ["--expect", expect]
    if coverage:
        args += ["--coverage", coverage]
    return run("verify.py", args, "verify.py")


def cmd_all(path, theme=None, out=None, coverage=None):
    if not cmd_build(path, out, theme):
        return False

    html = out or os.path.join(os.path.dirname(os.path.abspath(path)), "index.html")

    print(f"\n{'─' * 60}")
    print("  产物校验")
    print(f"{'─' * 60}")

    ok = cmd_verify(html, path, coverage)
    if ok:
        print("\n✅ 全部通过")
        print(f"    主题: {theme or 'paper（默认）'}")
    return ok


def main():
    if len(sys.argv) < 2:
        print(USAGE)
        sys.exit(2)

    action = sys.argv[1]
    rest = sys.argv[2:]

    if action not in ("check", "build", "verify", "all"):
        print(f"未知命令: {action}\n")
        print(USAGE)
        sys.exit(2)

    if not rest:
        print(f"{action} 需要一个文件路径\n")
        print(USAGE)
        sys.exit(2)

    path = rest[0]

    theme = None
    if "--theme" in rest:
        i = rest.index("--theme")
        if i + 1 < len(rest):
            theme = rest[i + 1]

    if action == "check":
        coverage = None
        if "--coverage" in rest:
            i = rest.index("--coverage")
            if i + 1 < len(rest):
                coverage = rest[i + 1]
        sys.exit(0 if cmd_check(path, coverage) else 1)

    if action == "build":
        out = None
        if "-o" in rest:
            i = rest.index("-o")
            if i + 1 < len(rest):
                out = rest[i + 1]
        sys.exit(0 if cmd_build(path, out, theme) else 1)

    if action == "verify":
        expect = None
        if "--expect" in rest:
            i = rest.index("--expect")
            if i + 1 < len(rest):
                expect = rest[i + 1]
        coverage = None
        if "--coverage" in rest:
            i = rest.index("--coverage")
            if i + 1 < len(rest):
                coverage = rest[i + 1]
        sys.exit(0 if cmd_verify(path, expect, coverage) else 1)

    if action == "all":
        out = None
        if "-o" in rest:
            i = rest.index("-o")
            if i + 1 < len(rest):
                out = rest[i + 1]
        coverage = None
        if "--coverage" in rest:
            i = rest.index("--coverage")
            if i + 1 < len(rest):
                coverage = rest[i + 1]
        sys.exit(0 if cmd_all(path, theme, out, coverage) else 1)


if __name__ == "__main__":
    main()
