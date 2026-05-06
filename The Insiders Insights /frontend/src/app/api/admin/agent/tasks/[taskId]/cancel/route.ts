/**
 * POST /api/admin/agent/tasks/{taskId}/cancel — Cancel a running/pending agent task.
 */
import { NextResponse } from 'next/server';
import { cancelTask } from '@/lib/agent-store';

export async function POST(_req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await ctx.params;
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }
  const task = await cancelTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Could not cancel task' }, { status: 500 });
  }
  return NextResponse.json(task);
}
