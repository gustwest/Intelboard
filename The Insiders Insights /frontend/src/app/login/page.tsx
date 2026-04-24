'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0e12 0%, #16141c 50%, #0f0e12 100%)',
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid rgba(177,78,244,0.2)',
          borderTop: '3px solid #b14ef4',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0e12 0%, #16141c 50%, #0f0e12 100%)',
      fontFamily: "var(--brand-font-sans)",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '500px',
        height: '400px',
        background: 'radial-gradient(ellipse, rgba(177,78,244,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '420px',
        padding: '40px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '24px',
        backdropFilter: 'blur(20px)',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>THE</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 600, color: '#b14ef4', letterSpacing: '-0.02em' }}>INSIDERS.</span>
          </div>
          <p style={{
            marginTop: '12px',
            fontSize: '0.8125rem',
            color: 'rgba(255,255,255,0.4)',
            lineHeight: 1.5,
          }}>
            The Predictive Network Engine
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            marginBottom: '20px',
            padding: '12px 16px',
            background: 'rgba(248,81,73,0.1)',
            border: '1px solid rgba(248,81,73,0.2)',
            borderRadius: '12px',
            fontSize: '0.8125rem',
            color: '#f85149',
          }}>
            {error === 'AccessDenied'
              ? '⚠️ Åtkomst nekad — din e-post finns inte i godkännandelistan.'
              : '⚠️ Inloggningsfel. Försök igen.'}
          </div>
        )}

        {/* Sign-in button */}
        <button
          onClick={() => signIn('google', { callbackUrl })}
          style={{
            width: '100%',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '14px',
            color: '#e2e8f0',
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(177,78,244,0.15)';
            e.currentTarget.style.borderColor = 'rgba(177,78,244,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Logga in med Google
        </button>

        <p style={{
          marginTop: '20px',
          fontSize: '0.6875rem',
          color: 'rgba(255,255,255,0.2)',
          lineHeight: 1.5,
        }}>
          Åtkomst begränsad till godkända e-postadresser
        </p>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0e12 0%, #16141c 50%, #0f0e12 100%)',
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid rgba(177,78,244,0.2)',
          borderTop: '3px solid #b14ef4',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
