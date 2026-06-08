"""Filstorleks-tak för kunduppladdningar (DoS-skydd).

`UploadFile.read()` utan tak läser hela filen i minnet → en stor uppladdning (t.ex.
5 GB) kan OOM:a instansen. `read_capped()` läser bara upp till taket + 1 byte och
avvisar (HTTP 413) om filen är större — minnet kan aldrig spränga taket."""
from __future__ import annotations

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB — väl tilltaget för CSV/XLSX/PDF/skärmklipp


async def read_capped(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """Läs en UploadFile med hårt tak. Höjer 413 om filen överstiger `max_bytes`."""
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(413, f"filen är för stor (max {max_bytes // (1024 * 1024)} MB)")
    return data
