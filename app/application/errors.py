"""Domain errors raised by the pipeline. The API layer maps these to HTTP/SSE."""


class UnknownModelError(ValueError):
    """Raised when the requested model is not in the discovered catalog."""


class UnknownPromptError(ValueError):
    """Raised when a named prompt cannot be resolved."""


class InputTooLargeError(ValueError):
    """Raised when the prompt exceeds MAX_INPUT_TOKENS."""


class BudgetExceededError(ValueError):
    """Raised when the daily token or USD budget would be exceeded."""


class MemoryConfigError(ValueError):
    """Raised when Mem0 cannot be configured (missing model, embedder, or keys)."""


class PiiConfigError(ValueError):
    """Raised when PII is on but Presidio or spaCy cannot be used."""


class GuardConfigError(ValueError):
    """Raised when GUARD=1 but scanners or catalog models cannot be used."""


class GuardBlockedError(ValueError):
    """Raised when a scanner blocks the request. HTTP 400. Never includes the raw text."""

    def __init__(
        self,
        scanner: str,
        message: str,
        categories: list[str] | None = None,
        category_names: list[str] | None = None,
    ):
        super().__init__(message)
        self.scanner = scanner
        self.categories = list(categories or [])
        self.category_names = list(category_names or [])
