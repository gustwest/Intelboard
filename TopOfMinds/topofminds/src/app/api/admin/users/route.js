import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/dal';
import { isAdmin, isSuperadmin } from '@/lib/auth/roles';

// GET /api/admin/users — List all users (ADMIN+)
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !isAdmin(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        lastLoginAt: true,
        createdAt: true,
        consultantId: true,
        consultant: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json(users);
  } catch (err) {
    console.error('List users error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/users — Invite/create a new user (SUPERADMIN only)
export async function POST(req) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !isSuperadmin(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden — only SUPERADMIN can add users' }, { status: 403 });
    }

    const { email, name, role } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'E-post krävs.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const validRoles = ['SUPERADMIN', 'ADMIN', 'CONSULTANT'];
    const userRole = validRoles.includes(role) ? role : 'CONSULTANT';

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json({ error: 'En användare med den e-postadressen finns redan.' }, { status: 409 });
    }

    // Try to auto-link to consultant profile
    const consultant = await prisma.consultant.findFirst({
      where: { email: normalizedEmail },
    });

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name || null,
        role: userRole,
        isActive: true,
        consultantId: consultant?.id ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
