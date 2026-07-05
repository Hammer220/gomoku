import logging

logger = None
access_logger = None
_logging_initialized = False

def setup_logging():
    global logger, access_logger, _logging_initialized

    if _logging_initialized:
        return logger, access_logger

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(formatter)
    root_logger.addHandler(stream_handler)

    access_logger = logging.getLogger('access')
    access_logger.setLevel(logging.INFO)
    access_logger.addHandler(stream_handler)
    access_logger.propagate = False

    logger = logging.getLogger('gomoku')
    _logging_initialized = True
    return logger, access_logger