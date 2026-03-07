import logging
import sys
from logging.handlers import RotatingFileHandler
import os

def setup_logging(app):
    """Configure professional logging for the application."""
    log_level = app.config.get("LOG_LEVEL", "INFO")

    # Create logs directory if it doesn't exist
    if not os.path.exists('logs'):
        os.mkdir('logs')

    formatter = logging.Formatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
    )

    # File handler with rotation
    file_handler = RotatingFileHandler(
        'logs/app.log', maxBytes=10240000, backupCount=10
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(log_level)

    # Stream handler for console
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    stream_handler.setLevel(log_level)

    app.logger.addHandler(file_handler)
    app.logger.addHandler(stream_handler)
    app.logger.setLevel(log_level)

    app.logger.info('Logging initialized')

logger = logging.getLogger("app")
logger.setLevel(logging.INFO)

# File handler with rotation
if not os.path.exists('logs'):
    os.mkdir('logs')
file_handler = RotatingFileHandler(
    'logs/app.log', maxBytes=10240000, backupCount=10
)
formatter = logging.Formatter('[%(asctime)s] %(levelname)s in %(module)s: %(message)s')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Stream handler for console
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)

logger.info('Logging initialized')
