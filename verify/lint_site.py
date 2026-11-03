"""网站文件的快速检查（不是数字核对）：
- HTML / JS / CSS 里不能有控制字符（常见于转义写错，比如 \\t、\\b 被当成制表符、退格）；
- 每个 ready 的页面都有 pages/<id>.html 和 assets/js/pages/<id>.js，并且引用了正确的脚本；
- 不出现个人信息类字符串。
运行：E:/retail-uplift-ab/.venv/Scripts/python.exe verify/lint_site.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
bad = []
for f in list(ROOT.glob("*.html")) + list(ROOT.glob("pages/*.html")) + list(ROOT.glob("assets/**/*.js")) + list(ROOT.glob("assets/**/*.css")):
    s = f.read_text(encoding="utf-8")
    for i, line in enumerate(s.splitlines(), 1):
        if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", line.replace("\t", "")) or "\t" in line:
            bad.append(f"{f.relative_to(ROOT)}:{i} 控制字符或制表符")
    for word in ["@qq.com"]:
        if word in s.lower():
            bad.append(f"{f.relative_to(ROOT)} 出现敏感字符串 {word}")

reg = (ROOT / "assets/js/registry.js").read_text(encoding="utf-8")
for m in re.finditer(r"\{ id: '([\w-]+)'[^}]*?ready: (true|false)", reg, re.S):
    pid, ready = m.group(1), m.group(2) == "true"
    if not ready:
        continue
    html = ROOT / f"pages/{pid}.html"
    if not html.exists():
        bad.append(f"缺少 pages/{pid}.html")
        continue
    h = html.read_text(encoding="utf-8")
    if f'data-page="{pid}"' not in h:
        bad.append(f"{pid}.html 的 data-page 不对")
    if pid != "flashcards" and f"assets/js/pages/{pid}.js" not in h:
        bad.append(f"{pid}.html 没有引用自己的脚本")
    if pid != "flashcards" and f"{pid}:" not in (ROOT / "assets/js/quiz.js").read_text(encoding="utf-8") and f"'{pid}':" not in (ROOT / "assets/js/quiz.js").read_text(encoding="utf-8"):
        bad.append(f"quiz.js 缺少 {pid} 的自测题")

print("\n".join(bad) if bad else "全部通过")
sys.exit(1 if bad else 0)
