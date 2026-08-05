"""测试运行入口
运行所有测试文件，生成测试报告。
用法: python run_tests.py
"""

import sys
import os
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

if __name__ == '__main__':
    args = [
        sys.executable, '-m', 'pytest',
        'tests/',
        '-v',
        '--tb=short',
        '--color=yes',
        '-p', 'no:warnings',
    ]

    if len(sys.argv) > 1:
        args.extend(sys.argv[1:])

    print('=' * 60)
    print('五子棋项目测试套件')
    print('=' * 60)
    print()

    result = subprocess.run(args, cwd=SCRIPT_DIR)
    sys.exit(result.returncode)