"""text.py - 综合测试与静态检查脚本
运行 ruff（自动修复）、pytest、mypy，终端实时显示完整输出，并将报告输出到 tests/report/ 目录

用法:
    python text.py                  # 运行全部：ruff --fix + ruff check + mypy + pytest
    python text.py --no-fix         # 跳过自动修复，仅检查
    python text.py --timeout 600    # 自定义超时秒数（默认 300）
"""

import argparse
import os
import subprocess
import sys
import threading
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPORT_DIR = os.path.join(SCRIPT_DIR, 'tests', 'report')
SERVER_DIR = os.path.join(SCRIPT_DIR, 'server')
TESTS_DIR = os.path.join(SCRIPT_DIR, 'tests')

TIMEOUT_EXIT_CODE = -1


def _read_stream(stream, output_list, prefix=''):
    for line in iter(stream.readline, ''):
        if line:
            if prefix:
                sys.stdout.write(prefix + line)
            else:
                sys.stdout.write(line)
            sys.stdout.flush()
            output_list.append(line)
    stream.close()


def run_command(cmd, description, timeout=None):
    print(f"\n{'=' * 60}")
    print(f"  运行: {description}")
    print(f"  命令: {' '.join(cmd)}")
    if timeout:
        print(f"  超时: {timeout} 秒")
    print(f"{'=' * 60}")
    sys.stdout.flush()

    stdout_lines = []
    stderr_lines = []

    process = subprocess.Popen(
        cmd,
        cwd=SCRIPT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace',
        bufsize=1,
    )

    t_stdout = threading.Thread(
        target=_read_stream, args=(process.stdout, stdout_lines)
    )
    t_stderr = threading.Thread(
        target=_read_stream, args=(process.stderr, stderr_lines, '  [stderr] ')
    )
    t_stdout.start()
    t_stderr.start()

    try:
        returncode = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timeout_msg = f'\n  !!! 超时（{timeout} 秒），正在终止进程...\n'
        sys.stdout.write(timeout_msg)
        sys.stdout.flush()
        stdout_lines.append(timeout_msg)

        process.kill()
        process.wait()

        t_stdout.join(timeout=5)
        t_stderr.join(timeout=5)

        stdout_text = ''.join(stdout_lines).strip()
        stderr_text = ''.join(stderr_lines).strip()

        print()
        sys.stdout.flush()

        return TIMEOUT_EXIT_CODE, stdout_text, stderr_text

    t_stdout.join()
    t_stderr.join()

    stdout_text = ''.join(stdout_lines).strip()
    stderr_text = ''.join(stderr_lines).strip()

    print()
    sys.stdout.flush()

    return returncode, stdout_text, stderr_text


def run_ruff_fix(timeout):
    cmd = [
        sys.executable, '-m', 'ruff', 'check', '--fix', '--unsafe-fixes',
        SERVER_DIR,
        TESTS_DIR,
        os.path.join(SCRIPT_DIR, 'app.py'),
    ]
    return run_command(cmd, 'Ruff 自动修复', timeout)


def run_ruff(timeout):
    cmd = [
        sys.executable, '-m', 'ruff', 'check',
        SERVER_DIR,
        TESTS_DIR,
        os.path.join(SCRIPT_DIR, 'app.py'),
    ]
    return run_command(cmd, 'Ruff 静态检查', timeout)


def run_mypy(timeout):
    cmd = [
        sys.executable, '-m', 'mypy',
        SERVER_DIR,
        TESTS_DIR,
        os.path.join(SCRIPT_DIR, 'app.py'),
        '--ignore-missing-imports',
        '--no-error-summary',
        '--explicit-package-bases',
        '--namespace-packages',
    ]
    return run_command(cmd, 'MyPy 类型检查', timeout)


def run_pytest(timeout):
    cmd = [
        sys.executable, '-m', 'pytest',
        TESTS_DIR,
        '-vv',
        '--tb=long',
        '-ra',
        '--color=no',
    ]
    if _has_pytest_timeout():
        cmd.append('--timeout=30')
    return run_command(cmd, 'Pytest 动态测试', timeout)


def _has_pytest_timeout():
    import importlib.util
    return importlib.util.find_spec('pytest_timeout') is not None


def _format_section(lines, title, result):
    lines.append(f'【{title}】')
    if result[0] == TIMEOUT_EXIT_CODE:
        lines.append('返回码: 超时')
    else:
        lines.append(f'返回码: {result[0]}')
    lines.append('输出:')
    if result[1]:
        lines.append(result[1])
    else:
        lines.append('（无输出）')
    if result[2]:
        lines.append('--- stderr ---')
        lines.append(result[2])
    lines.append('')


def generate_report(ruff_fix_result, ruff_result, mypy_result, pytest_result):
    os.makedirs(REPORT_DIR, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    report_path = os.path.join(REPORT_DIR, f'test_report_{timestamp}.txt')

    start_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    all_passed = (
        ruff_fix_result[0] == 0
        and ruff_result[0] == 0
        and mypy_result[0] == 0
        and pytest_result[0] == 0
    )

    lines = []
    lines.append(f'测试报告 - {start_time}')
    lines.append('=' * 60)
    lines.append('')

    _format_section(lines, '自动修复 - Ruff --fix', ruff_fix_result)
    _format_section(lines, '静态检查 - Ruff', ruff_result)
    _format_section(lines, '静态检查 - MyPy', mypy_result)
    _format_section(lines, '动态测试 - Pytest', pytest_result)

    end_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    lines.append('=' * 60)
    lines.append(f'测试完成时间: {end_time}')
    if all_passed:
        lines.append('结果: 全部通过 \u2713')
    else:
        lines.append('结果: 存在失败 \u2717')
    lines.append('=' * 60)

    content = '\n'.join(lines)
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(content)

    return report_path, content, all_passed


def main():
    parser = argparse.ArgumentParser(description='综合测试与静态检查')
    parser.add_argument(
        '--no-fix', action='store_true',
        help='跳过 ruff 自动修复，仅进行检查'
    )
    parser.add_argument(
        '--timeout', type=int, default=600,
        help='单个命令超时秒数（默认 600）'
    )
    args = parser.parse_args()

    print('=' * 60)
    print('  text.py - 综合测试与静态检查')
    print(f'  项目目录: {SCRIPT_DIR}')
    print(f'  报告目录: {REPORT_DIR}')
    fix_status = '否' if args.no_fix else '是'
    print(f'  自动修复: {fix_status}')
    print(f'  超时设置: {args.timeout} 秒')
    print('=' * 60)

    interrupted_msg = '（用户中断，未执行）'

    ruff_fix_result = None
    ruff_result = None
    mypy_result = None
    pytest_result = None

    try:
        if args.no_fix:
            ruff_fix_result = (0, '（已跳过自动修复）', '')
        else:
            ruff_fix_result = run_ruff_fix(args.timeout)

        ruff_result = run_ruff(args.timeout)
        mypy_result = run_mypy(args.timeout)
        pytest_result = run_pytest(args.timeout)

    except KeyboardInterrupt:
        print('\n\n!!! 用户中断，正在保存当前进度...')
        sys.stdout.flush()

        if ruff_fix_result is None:
            ruff_fix_result = (TIMEOUT_EXIT_CODE, interrupted_msg, '')
        if ruff_result is None:
            ruff_result = (TIMEOUT_EXIT_CODE, interrupted_msg, '')
        if mypy_result is None:
            mypy_result = (TIMEOUT_EXIT_CODE, interrupted_msg, '')
        if pytest_result is None:
            pytest_result = (TIMEOUT_EXIT_CODE, interrupted_msg, '')

    report_path, report_content, all_passed = generate_report(
        ruff_fix_result, ruff_result, mypy_result, pytest_result
    )

    print(f'\n报告已保存到: {report_path}')
    print()
    print(report_content)

    if not all_passed:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()