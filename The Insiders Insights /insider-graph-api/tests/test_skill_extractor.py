"""Enhetstester för den deterministiska kompetensextraktionen (services/skill_extractor.py)."""
import unittest

from services.skill_extractor import extract_skills


class SkillExtractorTest(unittest.TestCase):
    def test_extracts_canonical_skills(self):
        text = "Vi söker en molnarkitekt med AWS, Kubernetes och ISO 27001-erfarenhet."
        self.assertEqual(extract_skills(text), ["AWS", "ISO 27001", "Kubernetes"])

    def test_word_boundary_avoids_false_positives(self):
        # 'java' i 'javascript' ska inte matcha Java; 'go' ensamt ska inte matcha Go
        self.assertEqual(extract_skills("Erfarenhet av JavaScript och vi vill gå framåt."), [])

    def test_aliases_and_swedish(self):
        self.assertEqual(extract_skills("maskininlärning och hållbarhet"), ["Machine Learning", "Sustainability"])
        self.assertEqual(extract_skills("GCP-plattform"), ["Google Cloud"])

    def test_dedup_and_stable_sort(self):
        text = "AWS, aws, Amazon Web Services — allt i AWS."
        self.assertEqual(extract_skills(text), ["AWS"])

    def test_esg_terms(self):
        self.assertEqual(extract_skills("Ansvar för ESG och CSRD-rapportering."), ["CSRD", "ESG"])

    def test_empty(self):
        self.assertEqual(extract_skills(""), [])
        self.assertEqual(extract_skills("Vi söker en trevlig kollega."), [])


if __name__ == "__main__":
    unittest.main()
