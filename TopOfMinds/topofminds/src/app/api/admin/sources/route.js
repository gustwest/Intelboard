import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';

/**
 * GET /api/admin/sources — list all broker sources (passwords masked)
 */
export async function GET() {
  try {
    const sources = await prisma.brokerSource.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Mask credentials — never send cipher to client
    const safe = sources.map((s) => ({
      ...s,
      credentialsCipher: undefined,
      hasCredentials: !!s.credentialsCipher,
    }));

    return NextResponse.json(safe);
  } catch (err) {
    console.error('[sources] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/sources — create a new broker source
 * Body: { name, type, url?, domain?, username?, password?, config?, checkIntervalMin? }
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { name, type, url, domain, username, password, config, checkIntervalMin } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
    }

    const data = {
      name,
      type,
      url: url || null,
      domain: domain || null,
      username: username || null,
      config: config ? (typeof config === 'string' ? config : JSON.stringify(config)) : null,
      checkIntervalMin: checkIntervalMin || 30,
    };

    // Encrypt password if provided
    if (password) {
      data.credentialsCipher = encrypt(password);
    }

    const source = await prisma.brokerSource.create({ data });

    return NextResponse.json({
      ...source,
      credentialsCipher: undefined,
      hasCredentials: !!source.credentialsCipher,
    });
  } catch (err) {
    console.error('[sources] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
