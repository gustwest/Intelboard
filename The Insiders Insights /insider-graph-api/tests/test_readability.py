"""A8: läsbarhetsheuristik (services/readability.py) — provisorisk, icke-blockerande."""
import unittest

from services import readability


class ReadabilityTest(unittest.TestCase):
    def test_none_for_empty(self):
        self.assertIsNone(readability.summarize([]))
        self.assertIsNone(readability.summarize(["", "   "]))

    def test_short_sentences_not_flagged(self):
        r = readability.summarize(["Vi bygger inbyggda system. Det fungerar bra."])
        self.assertEqual(r["sentence_count"], 2)
        self.assertFalse(r["low_readability"])
        self.assertTrue(r["provisional"])

    def test_long_sentence_flagged(self):
        long_sentence = " ".join(["ord"] * 40) + "."
        r = readability.summarize([long_sentence])
        self.assertEqual(r["long_sentence_count"], 1)
        self.assertTrue(r["low_readability"])
        self.assertGreater(r["avg_words_per_sentence"], 25)


if __name__ == "__main__":
    unittest.main()
