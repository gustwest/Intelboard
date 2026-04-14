import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const [consultants, contracts, clients, notifications] = await Promise.all([
      prisma.consultant.findMany({ include: { contracts: true } }),
      prisma.contract.findMany({ include: { consultant: true, client: true } }),
      prisma.client.findMany({ include: { contracts: true } }),
      prisma.notification.findMany({
        where: { isRead: false },
        include: { contract: { include: { consultant: true, client: true } } },
        orderBy: { triggerDate: 'desc' },
      }),
    ]);

    const now = new Date();
    const activeContracts = contracts.filter(c => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON');
    const expiringSoon30 = contracts.filter(c => {
      const days = Math.ceil((new Date(c.endDate) - now) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 30;
    });
    const expiringSoon60 = contracts.filter(c => {
      const days = Math.ceil((new Date(c.endDate) - now) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 60;
    });
    const availableConsultants = consultants.filter(c => c.status === 'AVAILABLE');

    // Financial summary
    const totalMonthlyRevenue = activeContracts.reduce((sum, c) => {
      if (c.rateType === 'HOURLY') return sum + (c.rate || 0) * 160;
      if (c.rateType === 'MONTHLY') return sum + (c.rate || 0);
      return sum;
    }, 0);

    const totalContractValue = contracts
      .filter(c => c.status !== 'EXPIRED' && c.status !== 'TERMINATED')
      .reduce((sum, c) => sum + (c.rate || 0) * (c.estimatedHours || 0), 0);

    return NextResponse.json({
      stats: {
        totalConsultants: consultants.length,
        activeContracts: activeContracts.length,
        expiringSoon30: expiringSoon30.length,
        expiringSoon60: expiringSoon60.length,
        availableConsultants: availableConsultants.length,
        totalClients: clients.length,
        totalMonthlyRevenue,
        totalContractValue,
      },
      expiringSoonContracts: expiringSoon60.sort((a, b) => new Date(a.endDate) - new Date(b.endDate)),
      notifications,
      contracts,
      consultants,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
