'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGoogleResponse = useCallback(async (response) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Inloggning misslyckades.');
        setLoading(false);
        return;
      }

      // Redirect on success
      router.push(data.redirectTo || '/');
      router.refresh();
    } catch (err) {
      setError('Något gick fel. Försök igen.');
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Load the Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const clientId = document.querySelector('meta[name="google-client-id"]')?.content;
      if (!clientId || !window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320,
          locale: 'sv',
        }
      );
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) existing.remove();
    };
  }, [handleGoogleResponse]);

  return (
    <div className="auth-form">
      <div
        id="google-signin-btn"
        style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: '44px',
          marginBottom: '16px',
        }}
      />

      {loading && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Loggar in...
        </p>
      )}

      {error && <p className="auth-error auth-error-banner">{error}</p>}

      <p style={{
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: '12px',
        marginTop: '20px',
        lineHeight: 1.5,
      }}>
        Endast godkända användare kan logga in.<br />
        Kontakta din administratör om du behöver åtkomst.
      </p>
    </div>
  );
}
