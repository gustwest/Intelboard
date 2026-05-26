"""Enhetstester för privat underlagslagring (services/blob_storage.py). Ingen GCS."""
import unittest

from services import blob_storage as bs


class _FakeBlob:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def upload_from_string(self, content, content_type=None):
        self._store[self._path] = (content, content_type)

    def exists(self):
        return self._path in self._store

    @property
    def content_type(self):
        return self._store.get(self._path, (b"", None))[1]

    def download_as_bytes(self):
        return self._store[self._path][0]


class _FakeBucket:
    def __init__(self, store):
        self._store = store

    def blob(self, path):
        return _FakeBlob(self._store, path)


class BlobStorageTest(unittest.TestCase):
    def setUp(self):
        self._orig = (bs.settings.upload_bucket, bs._bucket)
        self.store: dict = {}
        bs._bucket = lambda: _FakeBucket(self.store)

    def tearDown(self):
        bs.settings.upload_bucket, bs._bucket = self._orig

    def test_store_noop_without_bucket(self):
        bs.settings.upload_bucket = ""
        self.assertIsNone(bs.store("acme", "snap-1", "f.png", b"data", "image/png"))

    def test_store_and_fetch_roundtrip(self):
        bs.settings.upload_bucket = "private-bucket"
        path = bs.store("acme", "snap-1", "skarmklipp.png", b"PNGDATA", "image/png")
        self.assertEqual(path, "linkedin/acme/snap-1/skarmklipp.png")
        fetched = bs.fetch(path)
        self.assertEqual(fetched, (b"PNGDATA", "image/png"))

    def test_store_empty_content_returns_none(self):
        bs.settings.upload_bucket = "private-bucket"
        self.assertIsNone(bs.store("acme", "snap-1", "f.png", b"", "image/png"))

    def test_fetch_missing_returns_none(self):
        bs.settings.upload_bucket = "private-bucket"
        self.assertIsNone(bs.fetch("linkedin/acme/snap-x/none.png"))


if __name__ == "__main__":
    unittest.main()
