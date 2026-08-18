"""nanohttp — минималистичный веб-фреймворк на stdlib (LONG-002).

Публичный API реэкспортируется целиком (спека, приложение A).
"""

from .ctx import Ctx, Request, Response
from .di import CircularDependencyError, Container, ResolutionError
from .errors import ErrorHandler, HttpError
from .logger import Logger, default_logger, log_middleware
from .middleware import Middleware, MiddlewareChain
from .router import (
    MethodNotAllowedError,
    NotFoundError,
    RouteConflictError,
    RouteMatch,
    Router,
)
from .validation import Field, ValidationError, validate
from .app import NanoApp

__all__ = [
    # ctx
    "Request",
    "Response",
    "Ctx",
    # router
    "Router",
    "RouteMatch",
    "RouteConflictError",
    "NotFoundError",
    "MethodNotAllowedError",
    # middleware
    "Middleware",
    "MiddlewareChain",
    # di
    "Container",
    "ResolutionError",
    "CircularDependencyError",
    # validation
    "Field",
    "validate",
    "ValidationError",
    # errors
    "HttpError",
    "ErrorHandler",
    # logger
    "Logger",
    "default_logger",
    "log_middleware",
    # app
    "NanoApp",
]

__version__ = "0.1.0"
