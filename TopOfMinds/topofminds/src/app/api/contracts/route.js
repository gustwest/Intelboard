import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const contracts = await prisma.contract.findMany({
      include: { consultant: true, client: true },
      orderBy: { endDate: 'asc' },
    });
    return NextResponse.json(contracts);
  } catch (error) {
    console.error('Contracts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const contract = await prisma.contract.create({
      data: {
        title: data.title,
        description: data.description || null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        rate: data.rate ? parseFloat(data.rate) : null,
        rateType: data.rateType || 'HOURLY',
        estimatedHours: data.estimatedHours ? parseInt(data.estimatedHours) : null,
        status: data.status || 'ACTIVE',
        renewalNoticeDays: data.renewalNoticeDays ? parseInt(data.renewalNoticeDays) : 30,
        notes: data.notes || null,
        consultantId: data.consultantId,
        clientId: data.clientId,
      },
      include: { consultant: true, client: true },
    });
    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error('Contracts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
