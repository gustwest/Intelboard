"""Maskering av PII i loggar (GDPR-dataminimering, P2/M3).

Loggar ska inte bära mer persondata än nödvändigt. `mask_email` behåller första
tecknet + domänen (debuggbart: man ser VILKEN domän) men maskerar lokaldelen:
`benjamin@theinsiders.se` → `b***@theinsiders.se`. Funkar även mitt i en längre
sträng (maskerar alla adresser)."""
from __future__ import annotations

import re

_EMAIL = re.compile(r"([A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]*(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})")


def mask_email(value: str | None) -> str:
    if not value:
        return ""
    return _EMAIL.sub(r"\1***\2", str(value))
