import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/dal';
import { isSuperadmin } from '@/lib/auth/roles';

// PATCH /api/admin/users/[id] — Update user role/status (SUPERADMIN only)
export async function PATCH(req, { params }) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !isSuperadmin(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const data = {};

    // Prevent self-demotion
    if (id === currentUser.id && body.role && body.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Du kan inte ändra din egen roll.' }, { status: 400 });
    }
    if (id === currentUser.id && body.isActive === false) {
      return NextResponse.json({ error: 'Du kan inte inaktivera dig själv.' }, { status: 400 });
    }

    if (body.role) {
      const validRoles = ['SUPERADMIN', 'ADMIN', 'CONSULTANT'];
      if (validRoles.includes(body.role)) data.role = body.role;
    }
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.name === 'string') data.name = body.name;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera.' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    console.error('Update user error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — Remove a user (SUPERADMIN only)
export async function DELETE(req, { params }) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !isSuperadmin(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    if (id === currentUser.id) {
      return NextResponse.json({ error: 'Du kan inte ta bort dig själv.' }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
