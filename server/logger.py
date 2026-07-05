"""日志模块
提供统一的日志记录器，支持控制台彩色输出和文件日志。
跨平台支持：Windows / macOS / Linux。

颜色规则：
  - 应用日志: DEBUG=青色 INFO=绿色 WARNING=黄色 ERROR=红色 CRITICAL=红底白字
  - API 访问日志: 方法(GET绿/POST黄/DELETE红/...) + 状态码(2xx绿/3xx青/4xx黄/5xx红)
  - 静态文件日志: 紫色方法 + 普通状态码，整体暗色以区分 API 请求
"""

import logging
import os
import re
import sys
import platform

logger = None
access_logger = None
_logging_initialized = False

IS_WINDOWS = platform.system() == 'Windows'

if IS_WINDOWS:
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except Exception:
        pass


class ANSI:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    GRAY = '\033[90m'
    BRIGHT_RED = '\033[91m'
    BRIGHT_GREEN = '\033[92m'
    BRIGHT_YELLOW = '\033[93m'
    BG_RED = '\033[41m'
    BG_YELLOW = '\033[43m'


LEVEL_COLORS = {
    'DEBUG': ANSI.CYAN,
    'INFO': ANSI.GREEN,
    'WARNING': ANSI.YELLOW,
    'ERROR': ANSI.RED,
    'CRITICAL': ANSI.BG_RED + ANSI.WHITE,
}

STATUS_COLORS = {
    '2': ANSI.GREEN,
    '3': ANSI.CYAN,
    '4': ANSI.YELLOW,
    '5': ANSI.RED,
}

METHOD_COLORS = {
    'GET': ANSI.GREEN,
    'POST': ANSI.YELLOW,
    'PUT': ANSI.BLUE,
    'DELETE': ANSI.RED,
    'PATCH': ANSI.MAGENTA,
    'HEAD': ANSI.CYAN,
    'OPTIONS': ANSI.GRAY,
}


def _supports_color():
    if os.environ.get('NO_COLOR') or os.environ.get('TERM') == 'dumb':
        return False
    if os.environ.get('FORCE_COLOR'):
        return True
    if IS_WINDOWS:
        return True
    if not sys.stdout.isatty():
        return False
    term = os.environ.get('TERM', '')
    if 'color' in term or 'xterm' in term or 'screen' in term or 'tmux' in term:
        return True
    if os.environ.get('COLORTERM'):
        return True
    if platform.system() == 'Darwin':
        return True
    return False


class ColoredFormatter(logging.Formatter):
    """应用日志彩色格式化器"""

    def __init__(self, use_color=True):
        super().__init__()
        self.use_color = use_color and _supports_color()

    def format(self, record):
        if self.use_color:
            levelname = record.levelname
            level_color = LEVEL_COLORS.get(levelname, '')
            time_str = self.formatTime(record, '%Y-%m-%d %H:%M:%S')
            colored_time = f'{ANSI.DIM}{time_str}{ANSI.RESET}'
            colored_level = f'{level_color}{ANSI.BOLD}{levelname:<8}{ANSI.RESET}'
            colored_msg = f'{ANSI.WHITE}{record.getMessage()}{ANSI.RESET}'
            return f'{colored_time} {colored_level} {colored_msg}'
        else:
            time_str = self.formatTime(record, '%Y-%m-%d %H:%M:%S')
            return f'{time_str} - {record.levelname:<8} - {record.getMessage()}'


class AccessColoredFormatter(logging.Formatter):
    """访问日志彩色格式化器，按 HTTP 方法和状态码着色。

    静态文件请求用蓝紫色，API 请求用方法色，状态码按区间着色。
    """

    _STATUS_RE = re.compile(r'(\d{3})(?=\s|$)')
    _METHOD_RE = re.compile(r'"(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) ')

    def __init__(self, use_color=True):
        super().__init__()
        self.use_color = use_color and _supports_color()

    def _is_static(self, msg):
        return ' /static/' in msg or ' /favicon' in msg

    def format(self, record):
        msg = record.getMessage()
        if self.use_color:
            time_str = self.formatTime(record, '%Y-%m-%d %H:%M:%S')
            colored_time = f'{ANSI.DIM}{time_str}{ANSI.RESET}'

            is_static = self._is_static(msg)

            def _color_status(match):
                code = match.group(1)
                color = STATUS_COLORS.get(code[0], ANSI.WHITE)
                if is_static:
                    return f'{color}{code}{ANSI.RESET}'
                return f'{color}{ANSI.BOLD}{code}{ANSI.RESET}'

            def _color_method(match):
                method = match.group(1)
                if is_static:
                    return f'"{ANSI.MAGENTA}{method} '
                color = METHOD_COLORS.get(method, ANSI.WHITE)
                return f'"{color}{ANSI.BOLD}{method}{ANSI.RESET} '

            colored_msg = self._METHOD_RE.sub(_color_method, msg)
            colored_msg = self._STATUS_RE.sub(_color_status, colored_msg)

            if is_static:
                colored_msg = f'{ANSI.DIM}{colored_msg}{ANSI.RESET}'
                return f'{colored_time} {ANSI.DIM}STATIC  {ANSI.RESET}{colored_msg}'
            else:
                colored_msg = f'{ANSI.WHITE}{colored_msg}{ANSI.RESET}'
                return f'{colored_time} {ANSI.DIM}ACCESS  {ANSI.RESET}{colored_msg}'
        else:
            time_str = self.formatTime(record, '%Y-%m-%d %H:%M:%S')
            return f'{time_str} - ACCESS   - {msg}'


class PlainFormatter(logging.Formatter):
    def __init__(self):
        super().__init__('%(asctime)s - %(levelname)-8s - %(message)s')


def setup_logging():
    global logger, access_logger, _logging_initialized

    if _logging_initialized:
        return logger, access_logger

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    app_handler = logging.StreamHandler()
    app_handler.setLevel(logging.INFO)
    app_handler.setFormatter(ColoredFormatter())
    root_logger.addHandler(app_handler)

    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.setLevel(logging.INFO)
    werkzeug_handler = logging.StreamHandler()
    werkzeug_handler.setLevel(logging.INFO)
    werkzeug_handler.setFormatter(AccessColoredFormatter())
    werkzeug_logger.addHandler(werkzeug_handler)
    werkzeug_logger.propagate = False

    access_logger = logging.getLogger('access')
    access_logger.setLevel(logging.INFO)

    access_handler = logging.StreamHandler()
    access_handler.setLevel(logging.INFO)
    access_handler.setFormatter(AccessColoredFormatter())
    access_logger.addHandler(access_handler)
    access_logger.propagate = False

    logger = logging.getLogger('gomoku')
    _logging_initialized = True
    return logger, access_logger


logger, access_logger = setup_logging()