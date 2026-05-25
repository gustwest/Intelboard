"""Enhetstester för chunkning + content-type-routing (connectors/readers.py).

HTML/PDF-extraktion kräver externa bibliotek och testas inte här — vi testar den
deterministiska logiken (chunkning, routing).
"""
import unittest

from connectors import readers


class ContentTypeTest(unittest.TestCase):
    def test_pdf_by_extension(self):
        self.assertEqual(readers.detect_content_type("https://x.se/rapport.pdf", None), "pdf")

    def test_pdf_by_header(self):
        self.assertEqual(readers.detect_content_type("https://x.se/d", "application/pdf"), "pdf")

    def test_html_by_header(self):
        self.assertEqual(readers.detect_content_type("https://x.se/om", "text/html; charset=utf-8"), "html")

    def test_binary_is_skipped(self):
        self.assertIsNone(readers.detect_content_type("https://x.se/logo.png", None))
        self.assertIsNone(readers.detect_content_type("https://x.se/app.js", "application/javascript"))


class ChunkTest(unittest.TestCase):
    def test_short_text_is_one_chunk(self):
        self.assertEqual(readers.chunk_text("kort text"), ["kort text"])

    def test_empty_text_is_no_chunks(self):
        self.assertEqual(readers.chunk_text("   "), [])

    def test_long_text_splits_with_overlap(self):
        text = "mening. " * 1000  # ~8000 tecken
        chunks = readers.chunk_text(text)
        self.assertGreater(len(chunks), 1)
        # varje chunk ligger inom storleksgränsen (med marginal för soft-break)
        for c in chunks:
            self.assertLessEqual(len(c), readers.CHUNK_SIZE + readers.CHUNK_OVERLAP)

    def test_cap_on_chunks_per_doc(self):
        text = "x" * (readers.CHUNK_SIZE * (readers.MAX_CHUNKS_PER_DOC + 20))
        chunks = readers.chunk_text(text)
        self.assertLessEqual(len(chunks), readers.MAX_CHUNKS_PER_DOC)


if __name__ == "__main__":
    unittest.main()
