"""测试执行脚本
对 tests 文件夹中的测试文件进行静态检查（ruff/mypy）和动态测试（pytest），
生成测试报告到 tests/report 目录。
"""

import os
import sys
import subprocess
import datetime

# 避免控制台编码（如 GBK）无法编码报告中的特殊字符而崩溃
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(errors='replace')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = os.path.join(SCRIPT_DIR, 'tests')
REPORT_DIR = os.path.join(TESTS_DIR, 'report')
os.makedirs(REPORT_DIR, exist_ok=True)

def get_timestamp():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def run_command(cmd, description, capture=True, timeout=300):
    print(f"\n{'='*60}")
    print(f"{description}")
    print(f"{'='*60}")
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=capture,
            text=True,
            timeout=timeout
        )
    except subprocess.TimeoutExpired:
        print(f"命令执行超时（{timeout}秒），已跳过")
        result = subprocess.CompletedProcess(cmd, returncode=124, stdout="", stderr=f"超时: {timeout}秒")
    return result

def main():
    timestamp = get_timestamp()
    report_lines = []
    report_lines.append(f"测试报告 - {timestamp}")
    report_lines.append("=" * 60)
    report_lines.append("")

    all_passed = True

    ruff_result = run_command(
        f'cd /d {SCRIPT_DIR} && "{sys.executable}" -m ruff check {TESTS_DIR}',
        "静态检查 - Ruff (代码风格)"
    )
    report_lines.append("【静态检查 - Ruff】")
    report_lines.append(f"返回码: {ruff_result.returncode}")
    if ruff_result.stdout:
        report_lines.append(f"输出:\n{ruff_result.stdout}")
    if ruff_result.stderr:
        report_lines.append(f"错误:\n{ruff_result.stderr}")
    if ruff_result.returncode != 0:
        all_passed = False
    report_lines.append("")

    mypy_result = run_command(
        f'cd /d {SCRIPT_DIR} && "{sys.executable}" -m mypy {TESTS_DIR} --ignore-missing-imports --no-namespace-packages',
        "静态检查 - MyPy (类型检查)"
    )
    report_lines.append("【静态检查 - MyPy】")
    report_lines.append(f"返回码: {mypy_result.returncode}")
    if mypy_result.stdout:
        report_lines.append(f"输出:\n{mypy_result.stdout}")
    if mypy_result.stderr:
        report_lines.append(f"错误:\n{mypy_result.stderr}")
    if mypy_result.returncode != 0:
        all_passed = False
    report_lines.append("")

    pytest_result = run_command(
        f'cd /d {SCRIPT_DIR} && "{sys.executable}" -m pytest {TESTS_DIR} -v --tb=short',
        "动态测试 - Pytest",
        capture=False
    )
    report_lines.append("【动态测试 - Pytest】")
    report_lines.append(f"返回码: {pytest_result.returncode}")
    report_lines.append("（pytest输出已直接在终端显示）")
    if pytest_result.stdout:
        report_lines.append(f"输出:\n{pytest_result.stdout}")
    if pytest_result.stderr:
        report_lines.append(f"错误:\n{pytest_result.stderr}")
    if pytest_result.returncode != 0:
        all_passed = False
    report_lines.append("")

    report_lines.append("=" * 60)
    report_lines.append(f"测试完成时间: {get_timestamp()}")
    if all_passed:
        report_lines.append("结果: 全部通过 ✓")
    else:
        report_lines.append("结果: 存在失败 ✗")
    report_lines.append("=" * 60)

    report_content = "\n".join(report_lines)
    report_file = os.path.join(REPORT_DIR, f"test_report_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"\n报告已生成: {report_file}")
    print("\n" + report_content)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())