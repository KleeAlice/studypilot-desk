"""Domain callables consumed by the Rust gateway.

Each module registers plain functions via ``domain.register``.  Importing this
package triggers the registration side effects used by ``domain.call``.
"""

from __future__ import annotations

from typing import Any

from ..errors import AppError


def as_int(value: Any, name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise AppError("VALIDATION_ERROR", f"{name} 必须是整数", 422)


from . import core  # noqa: E402,F401
from . import knowledge  # noqa: E402,F401
from . import notebooks  # noqa: E402,F401
from . import learning  # noqa: E402,F401
from . import language  # noqa: E402,F401
from . import documents  # noqa: E402,F401
from . import documents_rev  # noqa: E402,F401
from . import agent  # noqa: E402,F401
from . import runtime  # noqa: E402,F401
from . import files  # noqa: E402,F401
from . import uploads  # noqa: E402,F401
