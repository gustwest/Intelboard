import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import prisma from '@/lib/prisma';
import { createSession } from '@/lib/auth/session';
import { ROLES } from '@/lib/auth/roles';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export async function POST(req) {
  try {
    const { credential } = await req.json();
    if (!credential) {
      return NextResponse.json({ error: 'Ingen credential skickades.' }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID is not set');
      return NextResponse.json({ error: 'Server saknar OAuth-konfiguration.' }, { status: 500 });
    }

    // Verify the Google ID token
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return NextResponse.json({ error: 'Ogiltig Google-token.' }, { status: 401 });
    }

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return NextResponse.json({ error: 'Kunde inte hämta e-post från Google.' }, { status: 400 });
    }

    // Check if user exists in whitelist (User table)
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Du har inte behörighet att logga in. Kontakta administratören.' },
        { status: 403 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Ditt konto har inaktiverats. Kontakta administratören.' },
        { status: 403 }
      );
    }

    // Update user with Google info on first OAuth login
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: googleId,
        name: user.name || name,
        avatarUrl: picture || user.avatarUrl,
        lastLoginAt: new Date(),
      },
    });

    // Create JWT session (same mechanism as before)
    await createSession({
      userId: user.id,
      role: user.role,
      consultantId: user.consultantId,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      redirectTo: user.role === ROLES.CONSULTANT ? '/my' : '/',
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return NextResponse.json({ error: 'Internt serverfel.' }, { status: 500 });
  }
}
