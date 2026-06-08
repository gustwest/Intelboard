"""P0-D: XXE-skydd (defusedxml i RSS/jobfeed) + filstorleks-tak på uppladdningar."""
import asyncio
import unittest

from defusedxml.ElementTree import fromstring as safe_fromstring
from fastapi import HTTPException

from services.upload_limits import read_capped


class XxeProtectionTest(unittest.TestCase):
    """Den parser RSS/jobfeed nu använder ska vägra externa entiteter + DTD."""

    def test_external_entity_is_rejected(self):
        xxe = (b'<?xml version="1.0"?>'
               b'<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>'
               b'<r>&x;</r>')
        with self.assertRaises(ValueError):  # EntitiesForbidden/DTDForbidden ⊂ ValueError
            safe_fromstring(xxe)

    def test_billion_laughs_is_rejected(self):
        bomb = (b'<?xml version="1.0"?>'
                b'<!DOCTYPE lolz [<!ENTITY lol "lol">'
                b'<!ENTITY lol2 "&lol;&lol;&lol;">]>'
                b'<lolz>&lol2;</lolz>')
        with self.assertRaises(ValueError):
            safe_fromstring(bomb)

    def test_plain_xml_still_parses(self):
        root = safe_fromstring(b'<rss><channel><item><title>Hej</title></item></channel></rss>')
        self.assertEqual(root.tag, "rss")


class _FakeUpload:
    """Minimal UploadFile-stub: read(size) returnerar upp till size byte."""
    def __init__(self, data: bytes):
        self._data = data

    async def read(self, size: int = -1) -> bytes:
        return self._data if size < 0 else self._data[:size]


class ReadCappedTest(unittest.TestCase):
    def test_small_file_passes(self):
        data = b"x" * 1000
        out = asyncio.run(read_capped(_FakeUpload(data), max_bytes=1_000_000))
        self.assertEqual(out, data)

    def test_oversize_file_rejected_413(self):
        big = b"x" * 2048
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(read_capped(_FakeUpload(big), max_bytes=1024))
        self.assertEqual(ctx.exception.status_code, 413)

    def test_exactly_at_limit_passes(self):
        data = b"x" * 1024
        out = asyncio.run(read_capped(_FakeUpload(data), max_bytes=1024))
        self.assertEqual(len(out), 1024)


if __name__ == "__main__":
    unittest.main()
