"""重新生成 verify/ 下所有输出：每个 NN_*.py 的标准输出存成 NN_*_output.txt，
最后跑 compare_js.py（浏览器模拟代码 vs numpy）。

运行（仓库根目录）：E:/retail-uplift-ab/.venv/Scripts/python.exe verify/run_all.py
"""
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent


def run(script: pathlib.Path):
    out = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, encoding="utf-8",
                         cwd=HERE.parent, env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
    if out.returncode != 0:
        print(out.stderr)
        raise SystemExit(f"{script.name} 运行失败")
    target = HERE / (script.stem + "_output.txt")
    target.write_text(out.stdout, encoding="utf-8")
    print(f"✓ {script.name} → {target.name}")


if __name__ == "__main__":
    only = sys.argv[1:]
    scripts = sorted(p for p in HERE.glob("[0-9][0-9]_*.py"))
    if only:
        scripts = [p for p in scripts if any(p.stem.startswith(o) for o in only)]
    for s in scripts:
        run(s)
    if not only or "compare" in only:
        run(HERE / "compare_js.py")
