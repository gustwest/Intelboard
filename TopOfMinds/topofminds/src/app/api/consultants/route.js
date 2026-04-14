import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const consultants = await prisma.consultant.findMany({
      include: { contracts: { include: { client: true } } },
      orderBy: [{ team: 'asc' }, { lastName: 'asc' }],
    });
    return NextResponse.json(consultants);
  } catch (error) {
    console.error('Consultants GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const consultant = await prisma.consultant.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        title: data.title || null,
        team: data.team || null,
        skills: data.skills ? JSON.stringify(data.skills) : null,
        status: data.status || 'AVAILABLE',
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : null,
        bio: data.bio || null,
        education: data.education ? JSON.stringify(data.education) : null,
        experience: data.experience ? JSON.stringify(data.experience) : null,
        interests: data.interests || null,
        developmentGoals: data.developmentGoals || null,
        linkedin: data.linkedin || null,
        wantsNewAssignment: data.wantsNewAssignment || false,
        notes: data.notes || null,
      },
    });
    return NextResponse.json(consultant, { status: 201 });
  } catch (error) {
    console.error('Consultants POST error:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'E-postadressen används redan' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
