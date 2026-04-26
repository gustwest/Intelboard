#!/usr/bin/env node
/**
 * The Insiders Insights — Agent Poller
 * Polls the frontend server for pending agent tasks and runs Claude CLI.
 *
 * Architecture matches dvoucher agent-poll — proven pattern:
 * - Pipes prompt via stdin (no shell quoting issues)
 * - Uses -p (pipe mode, enables file edits)
 * - Reports DONE from stream-json result event (avoids CLI hang)
 * - Session resumption via Claude Code session_id
 * - Batched log sending every 1 second
 *
 * Usage:
 *   AGENT_API_KEY=xxx node frontend/scripts/agent-poll.mjs
 *
 * Environment variables:
 *   AGENT_API_BASE    — Frontend URL (default: Cloud Run)
 *   AGENT_API_KEY     — Shared secret for authentication (required)
 *   AGENT_CLI         — CLI command (default: ~/.local/bin/claude)
 *   AGENT_MODEL       — Default model (default: claude-sonnet-4-6)
 *   POLL_INTERVAL_MS  — Poll interval in ms (default: 5000)
 */

import { spawn } from 'child_process';

// ─── Configuration ──────────────────────────────────────
const API_BASE = process.env.AGENT_API_BASE || 'https://insiders-frontend-815335042776.europe-north1.run.app';
const API_KEY = process.env.AGENT_API_KEY || '';
const CLAUDE_CLI = process.env.AGENT_CLI || `${process.env.HOME}/.local/bin/claude`;
const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4-6';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const LOG_BATCH_INTERVAL = 1000; // Send logs every 1 second
const PROJECT_DIR = process.cwd();

if (!API_KEY) {
  console.error('❌ AGENT_API_KEY environment variable is required');
  console.error('   Set it: export AGENT_API_KEY="your-secret-key"');
  process.exit(1);
}

// ─── API Helpers ────────────────────────────────────────
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
  'x-agent-model': DEFAULT_MODEL,
  'x-agent-version': 'insiders-agent-2.0',
  'x-agent-project': PROJECT_DIR,
};

async function pollForTask() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/agent/poll`, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        console.error('❌ Authentication failed — check AGENT_API_KEY');
        process.exit(1);
      }
      if (res.status !== 404) console.error(`⚠️  Poll failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data.task || null;
  } catch (err) {
    console.error(`⚠️  Failed to reach server: ${err.message || err}`);
    return null;
  }
}

async function updateTask(taskId, update) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/agent/poll`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ taskId, ...update }),
    });
    if (!res.ok) {
      console.error(`⚠️  PATCH failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.error(`⚠️  Failed to send update: ${err.message || err}`);
  }
}

// ─── Stream-JSON parsing (matches dvoucher) ─────────────

function formatEvent(ev) {
  if (ev.type === 'system' && ev.subtype === 'init') {
    return `🔌 Session started (${ev.session_id?.slice(0, 8) || '?'})`;
  }
  if (ev.type === 'assistant' && ev.message?.content) {
    const parts = [];
    for (const block of ev.message.content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text);
      } else if (block.type === 'tool_use') {
        const input = typeof block.input === 'object' ? JSON.stringify(block.input).slice(0, 120) : '';
        parts.push(`🔧 ${block.name || 'tool'}(${input})`);
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (ev.type === 'user' && ev.message?.content) {
    const parts = [];
    for (const block of ev.message.content) {
      if (block.type === 'tool_result') {
        const text =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map(c => c.text || '').join('')
              : '';
        const preview = text.length > 200 ? text.slice(0, 200) + '…' : text;
        if (preview.trim()) parts.push(`↳ ${preview}`);
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (ev.type === 'result') {
    if (ev.is_error) return '❌ Result error';
    const cost = ev.total_cost_usd ? ` · $${ev.total_cost_usd.toFixed(4)}` : '';
    const dur = ev.duration_ms ? ` · ${(ev.duration_ms / 1000).toFixed(1)}s` : '';
    return `✅ Done${dur}${cost}`;
  }
  return null;
}

// ─── Task Execution ─────────────────────────────────────

let isRunning = false;

async function executeTask(task) {
  isRunning = true;
  console.log(`\n🚀 Executing task ${task.id}`);
  console.log(`   Prompt: ${task.prompt.substring(0, 100)}${task.prompt.length > 100 ? '...' : ''}`);
  console.log(`   Project: ${PROJECT_DIR}`);
  console.log(`   CLI: ${CLAUDE_CLI}`);
  const model = task.model || DEFAULT_MODEL;
  console.log(`   Model: ${model}`);
  if (task.resumeSessionId) {
    console.log(`   Resume: ${task.resumeSessionId}`);
  }

  // Claim the task
  const startLogs = [
    '🚀 Agent connected — starting task...',
    `📂 Working directory: ${PROJECT_DIR}`,
    `💬 Prompt: ${task.prompt}`,
  ];
  if (task.resumeSessionId) {
    startLogs.push(`🔁 Resuming Claude session ${task.resumeSessionId.slice(0, 8)}`);
  }
  await updateTask(task.id, { status: 'RUNNING', logs: startLogs });

  // Build CLI args
  const args = ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
  args.push('--model', model);
  if (task.resumeSessionId) {
    args.push('--resume', task.resumeSessionId);
  }

  console.log(`   Command: ${CLAUDE_CLI} ${args.join(' ')}`);

  // Buffer logs and send them in batches
  let logBuffer = [];
  let stdoutBuffer = '';
  let capturedSessionId = null;
  let finalResponse = '';

  const flushLogs = async () => {
    if (logBuffer.length === 0) return;
    const batch = [...logBuffer];
    logBuffer = [];
    await updateTask(task.id, { logs: batch });
  };

  const logTimer = setInterval(flushLogs, LOG_BATCH_INTERVAL);

  return new Promise((resolvePromise) => {
    try {
      const child = spawn(CLAUDE_CLI, args, {
        cwd: PROJECT_DIR,
        env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
        shell: false,
      });

      // Pipe prompt via stdin
      child.stdin.write(task.prompt);
      child.stdin.end();

      child.stdout.on('data', async (data) => {
        stdoutBuffer += data.toString();
        let nl;
        while ((nl = stdoutBuffer.indexOf('\n')) !== -1) {
          const rawLine = stdoutBuffer.slice(0, nl).trim();
          stdoutBuffer = stdoutBuffer.slice(nl + 1);
          if (!rawLine) continue;

          let handled = false;
          if (rawLine.startsWith('{')) {
            try {
              const ev = JSON.parse(rawLine);
              if (ev.session_id && !capturedSessionId) {
                capturedSessionId = ev.session_id;
              }
              if (ev.type === 'result') {
                if (ev.result) finalResponse = ev.result;
                // Immediately report DONE — don't wait for process exit
                // Claude CLI sometimes hangs after emitting the result event.
                clearInterval(logTimer);
                await flushLogs();
                const costInfo = ev.total_cost_usd ? ` ($${ev.total_cost_usd.toFixed(4)})` : '';
                const durInfo = ev.duration_ms ? ` (${(ev.duration_ms / 1000).toFixed(1)}s)` : '';
                console.log(`✅ Task ${task.id} completed via result event${durInfo}${costInfo}`);
                await updateTask(task.id, {
                  status: 'DONE',
                  logs: [`✅ Agent completed successfully${durInfo}${costInfo}`],
                  ...(capturedSessionId ? { claudeSessionId: capturedSessionId } : {}),
                  ...(finalResponse ? { response: finalResponse } : {}),
                });
                isRunning = false;
                // Give the process a few seconds to exit gracefully, then kill it
                setTimeout(() => {
                  try { child.kill('SIGTERM'); } catch {}
                  setTimeout(() => {
                    try { child.kill('SIGKILL'); } catch {}
                  }, 3000);
                }, 5000);
              }
              const formatted = formatEvent(ev);
              if (formatted) {
                for (const line of formatted.split('\n')) {
                  if (line.trim()) {
                    logBuffer.push(line);
                    process.stdout.write(`   ${line}\n`);
                  }
                }
              }
              handled = true;
            } catch {
              // Not valid JSON — fall through to raw
            }
          }
          if (!handled) {
            logBuffer.push(rawLine);
            process.stdout.write(`   ${rawLine}\n`);
          }
        }
      });

      child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          logBuffer.push(`⚠️ ${line}`);
          process.stderr.write(`   ${line}\n`);
        }
      });

      child.on('close', async (code) => {
        clearInterval(logTimer);
        await flushLogs();

        // If the result event already reported DONE, just resolve.
        if (!isRunning) {
          resolvePromise();
          return;
        }

        if (code === 0) {
          console.log(`✅ Task ${task.id} completed successfully`);
          if (capturedSessionId) {
            console.log(`   Claude session: ${capturedSessionId}`);
          }
          await updateTask(task.id, {
            status: 'DONE',
            logs: ['✅ Agent completed successfully'],
            ...(capturedSessionId ? { claudeSessionId: capturedSessionId } : {}),
            ...(finalResponse ? { response: finalResponse } : {}),
          });
        } else {
          const errorMsg = `Process exited with code ${code}`;
          console.error(`❌ Task ${task.id} failed: ${errorMsg}`);
          await updateTask(task.id, {
            status: 'FAILED',
            error: errorMsg,
            logs: [`❌ ${errorMsg}`],
            ...(capturedSessionId ? { claudeSessionId: capturedSessionId } : {}),
          });
        }
        isRunning = false;
        resolvePromise();
      });

      child.on('error', async (err) => {
        clearInterval(logTimer);
        await flushLogs();
        const errorMsg = `Spawn error: ${err.message}`;
        console.error(`❌ Task ${task.id} spawn error: ${errorMsg}`);
        await updateTask(task.id, {
          status: 'FAILED',
          error: errorMsg,
          logs: [`❌ ${errorMsg}`],
        });
        isRunning = false;
        resolvePromise();
      });
    } catch (err) {
      clearInterval(logTimer);
      const msg = err.message || String(err);
      console.error(`❌ Failed to start: ${msg}`);
      updateTask(task.id, {
        status: 'FAILED',
        error: msg,
        logs: [`❌ Failed to start agent: ${msg}`],
      }).then(() => {
        isRunning = false;
        resolvePromise();
      });
    }
  });
}

// ─── Main Loop ──────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🤖 The Insiders Insights — Agent Poller v2');
  console.log('═══════════════════════════════════════════════');
  console.log(`  API:     ${API_BASE}`);
  console.log(`  CLI:     ${CLAUDE_CLI}`);
  console.log(`  Dir:     ${PROJECT_DIR}`);
  console.log(`  Model:   ${DEFAULT_MODEL}`);
  console.log(`  Key:     ${API_KEY ? '***' + API_KEY.slice(-4) : 'MISSING!'}`);
  console.log(`  Poll:    every ${POLL_INTERVAL / 1000}s`);
  console.log('═══════════════════════════════════════════════');
  console.log('  Waiting for tasks...\n');

  const poll = async () => {
    if (isRunning) return;
    const task = await pollForTask();
    if (task) {
      await executeTask(task);
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL);
}

process.on('SIGINT', () => {
  console.log('\n⏹ Agent shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹ Agent shutting down...');
  process.exit(0);
});

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
