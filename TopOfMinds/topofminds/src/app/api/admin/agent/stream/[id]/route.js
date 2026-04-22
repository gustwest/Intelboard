/**
 * SSE stream endpoint for live agent task logs
 * GET /api/admin/agent/stream/[id]
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req, { params }) {
  const { id: taskId } = await params;

  // Verify task exists
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastLogId = null;
      let lastStatus = task.status;

      const sendEvent = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      const poll = setInterval(async () => {
        try {
          // Fetch new logs since last seen
          const logs = await prisma.agentTaskLog.findMany({
            where: {
              taskId,
              ...(lastLogId ? { id: { gt: lastLogId } } : {}),
            },
            orderBy: { createdAt: 'asc' },
            take: 50,
          });

          for (const log of logs) {
            sendEvent({
              type: 'log',
              time: log.createdAt.toLocaleTimeString(),
              message: log.message,
            });
            lastLogId = log.id;
          }

          // Check task status
          const currentTask = await prisma.agentTask.findUnique({
            where: { id: taskId },
            select: { status: true, error: true },
          });

          if (currentTask && currentTask.status !== lastStatus) {
            lastStatus = currentTask.status;

            if (['DONE', 'FAILED', 'STOPPED'].includes(currentTask.status)) {
              sendEvent({
                type: 'done',
                status: currentTask.status.toLowerCase(),
                error: currentTask.error,
              });
              clearInterval(poll);
              controller.close();
            }
          }
        } catch (err) {
          console.error('SSE poll error:', err);
        }
      }, 1000);

      // Client disconnected
      req.signal.addEventListener('abort', () => {
        clearInterval(poll);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
