"""Enhetstester för LinkedIn-kvartalsflödet: uppladdning → intern verifiering (spec §4)."""
import asyncio
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from fastapi import BackgroundTasks

from routers import linkedin, review


class UploadTest(unittest.TestCase):
    def setUp(self):
        fakefs.reset(client={"company_name": "Acme AB"}, todos={"t1": {"type": "linkedin_quarterly", "status": "open"}})

    def _upload(self, skills="AWS, GDPR\nKubernetes"):
        return asyncio.run(
            linkedin.upload_snapshot("acme", skills=skills, quarter="2026-Q2", followers=1200, file=None)
        )

    def test_upload_creates_pending_snapshot_and_closes_todo(self):
        result = self._upload()
        self.assertEqual(result["snapshot_status"], "PENDING_INTERNAL_VERIFICATION")
        self.assertEqual(result["skills"], ["AWS", "GDPR", "Kubernetes"])  # parsad, dedup
        snap = list(fakefs.STATE["linkedin_snapshots"].values())[0]
        self.assertEqual(snap["status"], "PENDING_INTERNAL_VERIFICATION")
        self.assertFalse(snap["is_active"])
        self.assertEqual(snap["followers"], 1200)  # lagras för intern visning
        # öppen kvartals-To-Do kvitterad
        self.assertEqual(fakefs.STATE["todos"]["t1"]["status"], "done")

    def test_empty_skills_rejected(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException):
            self._upload(skills="  ,  \n ")

    def test_unknown_client_404(self):
        from fastapi import HTTPException

        fakefs.reset(client=None)
        with self.assertRaises(HTTPException):
            self._upload()


class _FakeUpload:
    def __init__(self, name, content, content_type):
        self.filename = name
        self._content = content
        self.content_type = content_type

    async def read(self, size: int = -1):
        return self._content if size < 0 else self._content[:size]


class FileStorageTest(unittest.TestCase):
    def setUp(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        self._orig_store = linkedin.blob_storage.store
        self._orig_fetch = linkedin.blob_storage.fetch

    def tearDown(self):
        linkedin.blob_storage.store = self._orig_store
        linkedin.blob_storage.fetch = self._orig_fetch

    def test_upload_stores_file_and_saves_path(self):
        linkedin.blob_storage.store = lambda *a: "linkedin/acme/snap/x.png"
        asyncio.run(linkedin.upload_snapshot(
            "acme", skills="AWS", quarter=None, followers=None,
            file=_FakeUpload("x.png", b"PNG", "image/png"),
        ))
        snap = list(fakefs.STATE["linkedin_snapshots"].values())[0]
        self.assertEqual(snap["file_path"], "linkedin/acme/snap/x.png")

    def test_screenshot_only_upload_no_skills_ok(self):
        # bara skärmklipp, inga kompetenser — kompetenser fylls vid verifiering
        linkedin.blob_storage.store = lambda *a: "linkedin/acme/snap/s.png"
        res = asyncio.run(linkedin.upload_snapshot(
            "acme", skills="", quarter=None, followers=None,
            file=_FakeUpload("s.png", b"PNG", "image/png"),
        ))
        self.assertEqual(res["snapshot_status"], "PENDING_INTERNAL_VERIFICATION")
        snap = list(fakefs.STATE["linkedin_snapshots"].values())[0]
        self.assertEqual(snap["skills"], [])
        self.assertEqual(snap["file_path"], "linkedin/acme/snap/s.png")

    def test_download_proxy_streams_stored_file(self):
        fakefs.reset(client={}, linkedin_snapshots={"s1": {"file_path": "linkedin/acme/s1/x.png"}})
        linkedin.blob_storage.fetch = lambda path: (b"PNG", "image/png")
        resp = linkedin.download_snapshot_file("acme", "s1")
        self.assertEqual(resp.body, b"PNG")
        self.assertEqual(resp.media_type, "image/png")

    def test_download_404_without_file(self):
        from fastapi import HTTPException

        fakefs.reset(client={}, linkedin_snapshots={"s1": {"file_path": None}})
        with self.assertRaises(HTTPException):
            linkedin.download_snapshot_file("acme", "s1")


class VerifyTest(unittest.TestCase):
    def _setup(self, snapshots):
        fakefs.reset(client={"company_name": "Acme AB"}, linkedin_snapshots=snapshots)

    def test_list_pending(self):
        self._setup({"s1": {"status": "PENDING_INTERNAL_VERIFICATION", "skills": ["AWS"]},
                     "s2": {"status": "VERIFIED", "is_active": True, "skills": ["GDPR"]}})
        result = review.list_pending_linkedin("acme")
        self.assertEqual([x["id"] for x in result["snapshots"]], ["s1"])

    def test_approve_activates_and_replaces_previous(self):
        self._setup({
            "old": {"status": "VERIFIED", "is_active": True, "skills": ["GDPR"]},
            "new": {"status": "PENDING_INTERNAL_VERIFICATION", "is_active": False, "skills": ["AWS"]},
        })
        review.verify_linkedin("acme", "new", review.LinkedInVerifyAction(decision="approve"), BackgroundTasks())
        snaps = fakefs.STATE["linkedin_snapshots"]
        self.assertEqual(snaps["new"]["status"], "VERIFIED")
        self.assertTrue(snaps["new"]["is_active"])
        self.assertFalse(snaps["old"]["is_active"])  # gamla ersatt

    def test_approve_can_refine_skills(self):
        self._setup({"s1": {"status": "PENDING_INTERNAL_VERIFICATION", "is_active": False, "skills": ["AWS", "brus"]}})
        review.verify_linkedin("acme", "s1", review.LinkedInVerifyAction(decision="approve", skills=["AWS"]), BackgroundTasks())
        self.assertEqual(fakefs.STATE["linkedin_snapshots"]["s1"]["skills"], ["AWS"])

    def test_reject(self):
        self._setup({"s1": {"status": "PENDING_INTERNAL_VERIFICATION", "is_active": False, "skills": ["AWS"]}})
        review.verify_linkedin("acme", "s1", review.LinkedInVerifyAction(decision="reject", note="fel bolag"), BackgroundTasks())
        snap = fakefs.STATE["linkedin_snapshots"]["s1"]
        self.assertEqual(snap["status"], "REJECTED")
        self.assertFalse(snap["is_active"])


if __name__ == "__main__":
    unittest.main()
