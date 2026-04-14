import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const consultant = await prisma.consultant.findUnique({
      where: { id },
      include: {
        contracts: {
          include: { client: true },
          orderBy: { endDate: 'desc' },
        },
      },
    });
    if (!consultant) {
      return NextResponse.json({ error: 'Konsult hittades inte' }, { status: 404 });
    }
    return NextResponse.json(consultant);
  } catch (error) {
    console.error('Consultant GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const consultant = await prisma.consultant.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        title: data.title || null,
        skills: data.skills ? JSON.stringify(data.skills) : null,
        status: data.status,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : null,
        notes: data.notes || null,
      },
    });
    return NextResponse.json(consultant);
  } catch (error) {
    console.error('Consultant PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await prisma.consultant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Consultant DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
