import logging
from pathlib import Path


# Get the base directory
base_dir = Path.cwd()


logging.basicConfig(
    # Set the log level (e.g., DEBUG, INFO, WARNING, ERROR)
    level=logging.INFO,
    # Set the log message format
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'  # Set the date format for log timestamps
)

loggers = {}


def setup_logger(log_filename):
    """
        Set up and configure a logger for logging messages to a specific file.

        Parameters:
        - log_filename (str): The name of the log file.

        Returns:
        logging.Logger: The configured logger instance for the specified log file.
    """

    if log_filename in loggers:
        return loggers[log_filename]

    _logger = logging.getLogger(log_filename)
    _logger.setLevel(logging.DEBUG)

    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    file_handler = logging.FileHandler(f'extras/{log_filename}')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    _logger.addHandler(file_handler)

    loggers[log_filename] = _logger
    return _logger


def logs(msg='', type='info', file_name=''):
    """
        Log messages with different log levels (debug, info, warning, error, critical).

        Parameters:
        - msg (str, optional): The message to be logged. Defaults to an empty string.
        - type (str, optional): The log level/type (debug, info, warning, error, critical).
        Defaults to 'info'.
        - file_name (str, optional): The name of the log file. If provided,
        a new logger will be set up for that file.

        Returns:
        None: The function logs the specified message at the specified log level.
    """

    logger = logging.getLogger(__name__)
    if file_name:
        logger = setup_logger(file_name)

    if type == 'debug':
        logger.debug(msg)
    if type == 'info':
        logger.info(msg)
    if type == 'warning':
        logger.warning(msg)
    if type == 'error':
        logger.error(msg)
    if type == 'critical':
        logger.critical(msg)