/**
 * Agent Status
 * GET /api/admin/agent/status — Check if agent poller is online
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Shared heartbeat from poll/route.js
globalThis.__agentHeartbeat = globalThis.__agentHeartbeat || { lastPoll: null, model: null, projectDir: null };

export async function GET() {
  try {
    const heartbeat = globalThis.__agentHeartbeat;
    const lastPoll = heartbeat.lastPoll;

    // Agent is "online" if it polled within the last 30 seconds
    const online = lastPoll
      ? Date.now() - new Date(lastPoll).getTime() < 30 * 1000
      : false;

    const stats = await prisma.agentTask.groupBy({
      by: ['status'],
      _count: true,
    });

    const total = stats.reduce((sum, s) => sum + s._count, 0);
    const completed = stats.find((s) => s.status === 'DONE')?._count || 0;
    const failed = stats.find((s) => s.status === 'FAILED')?._count || 0;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return NextResponse.json({
      online,
      lastPoll,
      model: heartbeat.model || 'claude-sonnet-4-6',
      projectDir: heartbeat.projectDir,
      stats: { total, completed, failed, successRate },
    });
  } catch (error) {
    console.error('Agent status error:', error);
    return NextResponse.json({ online: false }, { status: 500 });
  }
}
