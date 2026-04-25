import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';

/**
 * PUT /api/admin/sources/:id — update a broker source
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, url, domain, username, password, config, checkIntervalMin, enabled } = body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (url !== undefined) data.url = url || null;
    if (domain !== undefined) data.domain = domain || null;
    if (username !== undefined) data.username = username || null;
    if (enabled !== undefined) data.enabled = enabled;
    if (checkIntervalMin !== undefined) data.checkIntervalMin = checkIntervalMin;
    if (config !== undefined) {
      data.config = config ? (typeof config === 'string' ? config : JSON.stringify(config)) : null;
    }

    // Update password only if new one provided
    if (password) {
      data.credentialsCipher = encrypt(password);
    }

    const source = await prisma.brokerSource.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...source,
      credentialsCipher: undefined,
      hasCredentials: !!source.credentialsCipher,
    });
  } catch (err) {
    console.error('[sources] PUT error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sources/:id — delete a broker source
 */
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    await prisma.brokerSource.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sources] DELETE error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
