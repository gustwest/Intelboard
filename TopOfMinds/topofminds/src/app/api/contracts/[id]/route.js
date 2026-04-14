import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: { consultant: true, client: true, notifications: true },
    });
    if (!contract) {
      return NextResponse.json({ error: 'Kontrakt hittades inte' }, { status: 404 });
    }
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Contract GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const contract = await prisma.contract.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description || null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        rate: data.rate ? parseFloat(data.rate) : null,
        rateType: data.rateType || 'HOURLY',
        estimatedHours: data.estimatedHours ? parseInt(data.estimatedHours) : null,
        status: data.status,
        renewalNoticeDays: data.renewalNoticeDays ? parseInt(data.renewalNoticeDays) : 30,
        notes: data.notes || null,
        consultantId: data.consultantId,
        clientId: data.clientId,
      },
      include: { consultant: true, client: true },
    });
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Contract PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contract DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
