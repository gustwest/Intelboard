"""Enhetstester för SSRF-grinden (services/safe_fetch). IP-literaler används så ingen
riktig DNS-uppslagning sker (getaddrinfo på en literal IP träffar inte nätet)."""
import unittest

from services import safe_fetch as sf


class AssertPublicUrlTest(unittest.TestCase):
    def _blocked(self, url):
        with self.assertRaises(sf.SsrfError, msg=f"borde blockeras: {url}"):
            sf.assert_public_url(url)

    def test_blocks_gcp_metadata_ip(self):
        self._blocked("http://169.254.169.254/computeMetadata/v1/")

    def test_blocks_metadata_hostname(self):
        self._blocked("http://metadata.google.internal/")

    def test_blocks_loopback(self):
        self._blocked("http://127.0.0.1/admin")
        self._blocked("http://localhost:8080/")
        self._blocked("http://[::1]/")

    def test_blocks_private_ranges(self):
        for ip in ("10.1.2.3", "172.16.5.5", "192.168.1.1", "0.0.0.0"):
            self._blocked(f"http://{ip}/")

    def test_blocks_non_http_scheme(self):
        self._blocked("file:///etc/passwd")
        self._blocked("gopher://x/")
        self._blocked("ftp://example.com/")

    def test_allows_public_ip(self):
        # Public IP-literal → getaddrinfo returnerar den utan nät → tillåts.
        sf.assert_public_url("https://8.8.8.8/")
        sf.assert_public_url("http://93.184.216.34/path?q=1")

    def test_safe_get_raises_before_network_for_blocked(self):
        # safe_get validerar FÖRE anrop → ingen nätverkstrafik mot interna mål.
        with self.assertRaises(sf.SsrfError):
            sf.safe_get("http://169.254.169.254/")


if __name__ == "__main__":
    unittest.main()
