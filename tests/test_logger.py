"""日志模块测试
测试范围：日志初始化、格式化器、颜色代码、ANSI 常量
"""

import sys
import os
import logging
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ['NO_COLOR'] = '1'
os.environ['TERM'] = 'dumb'

from server.logger import (
    ANSI, LEVEL_COLORS, STATUS_COLORS, METHOD_COLORS,
    ColoredFormatter, AccessColoredFormatter, PlainFormatter,
    setup_logging, logger, access_logger, _supports_color,
)


class TestANSIConstants:
    """ANSI 常量测试"""

    def test_reset_exists(self):
        """RESET 常量存在"""
        assert ANSI.RESET == '\033[0m'

    def test_colors_exist(self):
        """颜色常量存在"""
        assert ANSI.RED == '\033[31m'
        assert ANSI.GREEN == '\033[32m'
        assert ANSI.YELLOW == '\033[33m'
        assert ANSI.BLUE == '\033[34m'
        assert ANSI.CYAN == '\033[36m'
        assert ANSI.WHITE == '\033[37m'

    def test_bright_colors_exist(self):
        """亮色常量存在"""
        assert ANSI.BRIGHT_RED == '\033[91m'
        assert ANSI.BRIGHT_GREEN == '\033[92m'

    def test_background_colors_exist(self):
        """背景色常量存在"""
        assert ANSI.BG_RED == '\033[41m'

    def test_bold_and_dim(self):
        """粗体和暗色常量"""
        assert ANSI.BOLD == '\033[1m'
        assert ANSI.DIM == '\033[2m'


class TestLevelColors:
    """日志级别颜色映射测试"""

    def test_all_levels_have_colors(self):
        """所有日志级别都有颜色"""
        levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        for level in levels:
            assert level in LEVEL_COLORS, f'{level} 缺少颜色配置'

    def test_debug_is_cyan(self):
        """DEBUG 为青色"""
        assert LEVEL_COLORS['DEBUG'] == ANSI.CYAN

    def test_info_is_green(self):
        """INFO 为绿色"""
        assert LEVEL_COLORS['INFO'] == ANSI.GREEN

    def test_warning_is_yellow(self):
        """WARNING 为黄色"""
        assert LEVEL_COLORS['WARNING'] == ANSI.YELLOW

    def test_error_is_red(self):
        """ERROR 为红色"""
        assert LEVEL_COLORS['ERROR'] == ANSI.RED

    def test_critical_is_bg_red(self):
        """CRITICAL 为红底白字"""
        assert LEVEL_COLORS['CRITICAL'] == ANSI.BG_RED + ANSI.WHITE


class TestStatusColors:
    """HTTP 状态码颜色映射测试"""

    def test_2xx_green(self):
        assert STATUS_COLORS['2'] == ANSI.GREEN

    def test_3xx_cyan(self):
        assert STATUS_COLORS['3'] == ANSI.CYAN

    def test_4xx_yellow(self):
        assert STATUS_COLORS['4'] == ANSI.YELLOW

    def test_5xx_red(self):
        assert STATUS_COLORS['5'] == ANSI.RED


class TestMethodColors:
    """HTTP 方法颜色映射测试"""

    def test_get_green(self):
        assert METHOD_COLORS['GET'] == ANSI.GREEN

    def test_post_yellow(self):
        assert METHOD_COLORS['POST'] == ANSI.YELLOW

    def test_delete_red(self):
        assert METHOD_COLORS['DELETE'] == ANSI.RED

    def test_put_blue(self):
        assert METHOD_COLORS['PUT'] == ANSI.BLUE

    def test_patch_magenta(self):
        assert METHOD_COLORS['PATCH'] == ANSI.MAGENTA


class TestSupportsColor:
    """_supports_color 函数测试"""

    def test_returns_bool(self):
        """返回布尔值"""
        result = _supports_color()
        assert isinstance(result, bool)


class TestFormatters:
    """格式化器测试"""

    def test_colored_formatter_no_color(self):
        """无颜色模式格式化"""
        fmt = ColoredFormatter(use_color=False)
        record = logging.LogRecord(
            'test', logging.INFO, '', 0, 'test message', (), None
        )
        result = fmt.format(record)
        assert 'test message' in result
        assert 'INFO' in result

    def test_colored_formatter_with_color(self):
        """有颜色模式格式化"""
        fmt = ColoredFormatter(use_color=True)
        record = logging.LogRecord(
            'test', logging.INFO, '', 0, 'test message', (), None
        )
        result = fmt.format(record)
        assert 'test message' in result

    def test_access_formatter_no_color(self):
        """访问日志无颜色模式"""
        fmt = AccessColoredFormatter(use_color=False)
        record = logging.LogRecord(
            'test', logging.INFO, '', 0, '"GET /api/test HTTP/1.1" 200 -', (), None
        )
        result = fmt.format(record)
        assert 'GET' in result
        assert '200' in result

    def test_access_formatter_with_color(self):
        """访问日志有颜色模式"""
        fmt = AccessColoredFormatter(use_color=True)
        record = logging.LogRecord(
            'test', logging.INFO, '', 0, '"POST /api/test HTTP/1.1" 404 -', (), None
        )
        result = fmt.format(record)
        assert 'POST' in result
        assert '404' in result

    def test_plain_formatter(self):
        """纯文本格式化器"""
        fmt = PlainFormatter()
        record = logging.LogRecord(
            'test', logging.INFO, '', 0, 'test message', (), None
        )
        result = fmt.format(record)
        assert 'test message' in result

    def test_access_static_file_detection(self):
        """静态文件检测"""
        fmt = AccessColoredFormatter(use_color=False)
        assert fmt._is_static('GET /static/js/app.js HTTP/1.1') is True
        assert fmt._is_static('GET /favicon.ico HTTP/1.1') is True
        assert fmt._is_static('GET /api/users HTTP/1.1') is False


class TestSetupLogging:
    """setup_logging 函数测试"""

    def test_logger_initialized(self):
        """日志记录器已初始化"""
        assert logger is not None
        assert isinstance(logger, logging.Logger)

    def test_access_logger_initialized(self):
        """访问日志记录器已初始化"""
        assert access_logger is not None
        assert isinstance(access_logger, logging.Logger)

    def test_logger_name(self):
        """日志记录器名称"""
        assert logger.name == 'gomoku'

    def test_logger_can_log(self):
        """日志记录器可记录"""
        logger.info('test log message')
        logger.debug('test debug message')
        logger.warning('test warning message')
        assert True

    def test_setup_logging_idempotent(self):
        """重复调用 setup_logging 不会出错"""
        result1 = setup_logging()
        result2 = setup_logging()
        assert result1 is not None
        assert result2 is not None