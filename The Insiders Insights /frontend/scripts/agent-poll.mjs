#!/usr/bin/env node
/**
 * The Insiders Insights — Agent Poller
 * Polls the frontend server for pending agent tasks and runs Claude CLI.
 *
 * Usage:
 *   AGENT_API_KEY=xxx npm run agent
 *   AGENT_API_KEY=xxx AGENT_MODEL=claude-opus-4-7 npm run agent
 *
 * Architecture matches dvoucher/AIDAS/OnTopofIT/TopOfMinds agent-poll:
 * - Pipes prompt via stdin (no shell quoting issues)
 * - Uses -p (pipe mode, enables file edits)
 * - 30 minute timeout for deploy-heavy tasks
 * - Session resumption via Claude Code session_id
 *
 * Auth: Bearer token (matches poll/route.ts)
 *
 * Note: This agent works on the ENTIRE project (frontend + backend),
 *       running from the project root directory.
 */

import { spawn } from 'child_process';

const API_BASE = process.env.AGENT_API_BASE || 'https://insiders-frontend-815335042776.europe-north1.run.app';
const API_KEY = process.env.AGENT_API_KEY || '';
const CLAUDE_CLI = process.env.AGENT_CLI || `${process.env.HOME}/.local/bin/claude`;
const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4-6';
const POLL_INTERVAL = 5000;
const TASK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const PROJECT_DIR = process.cwd();

// ── API Helpers ──────────────────────────────────────────────────

const authHeaders = () => ({
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'x-agent-model': DEFAULT_MODEL,
  'x-agent-version': 'insiders-agent-1.0',
  'x-agent-project': PROJECT_DIR,
});

async function poll() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/agent/poll`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status !== 404) console.error(`[POLL] HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.task;
  } catch (e) {
    console.error('[POLL] Error:', e.message || e);
    return null;
  }
}

async function patchTask(body) {
  try {
    await fetch(`${API_BASE}/api/admin/agent/poll`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[PATCH] Error:', e.message || e);
  }
}

async function sendLogs(taskId, logs) {
  await patchTask({ taskId, status: 'RUNNING', logs });
}

async function reportResult(taskId, status, response, error, claudeSessionId) {
  await patchTask({ taskId, status, response, error, claudeSessionId });
}

// ── Claude CLI Runner ────────────────────────────────────────────

function runClaude(task) {
  return new Promise((resolve) => {
    const model = task.model || DEFAULT_MODEL;
    const args = ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
    args.push('--model', model);

    // Resume existing Claude Code session if available
    if (task.resumeSessionId) {
      args.push('--resume', task.resumeSessionId);
    }

    console.log(`[CLAUDE] Running: ${CLAUDE_CLI} ${args.join(' ')}`);
    console.log(`[CLAUDE] Model: ${model}`);
    console.log(`[CLAUDE] Prompt: ${task.prompt.substring(0, 120)}...`);
    if (task.resumeSessionId) {
      console.log(`[CLAUDE] Resuming session: ${task.resumeSessionId}`);
    }

    const proc = spawn(CLAUDE_CLI, args, {
      cwd: PROJECT_DIR,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    // Pipe prompt via stdin
    proc.stdin.write(task.prompt);
    proc.stdin.end();

    let stdout = '';
    let stderr = '';
    let claudeSessionId;
    let lastLogFlush = Date.now();
    const pendingLogs = [];

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;

      for (const line of text.split('\n').filter(Boolean)) {
        try {
          const json = JSON.parse(line);

          if (json.session_id && !claudeSessionId) {
            claudeSessionId = json.session_id;
            console.log(`   🔌 Session: ${claudeSessionId}`);
            pendingLogs.push(`🔌 Session: ${claudeSessionId}`);
          }

          if (json.type === 'assistant' && json.message?.content) {
            for (const block of json.message.content) {
              if (block.type === 'tool_use') {
                const toolMsg = `🔧 ${block.name}(${JSON.stringify(block.input).substring(0, 80)})`;
                console.log(`   ${toolMsg}`);
                pendingLogs.push(toolMsg);
              }
              if (block.type === 'text' && block.text) {
                console.log(`   💬 ${block.text.substring(0, 200)}`);
              }
            }
          }

          if (json.type === 'result') {
            const costMsg = `💰 Cost: $${json.cost_usd?.toFixed(4) || '?'} | Duration: ${json.duration_ms ? (json.duration_ms / 1000).toFixed(1) + 's' : '?'}`;
            console.log(`   ${costMsg}`);
            pendingLogs.push(costMsg);
            if (json.session_id) claudeSessionId = json.session_id;
          }
        } catch {
          if (line.trim()) process.stdout.write(`   ${line}\n`);
        }
      }

      // Flush logs every 10s
      if (pendingLogs.length > 0 && Date.now() - lastLogFlush > 10000) {
        sendLogs(task.id, [...pendingLogs]);
        pendingLogs.length = 0;
        lastLogFlush = Date.now();
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (text.trim()) process.stderr.write(`   ⚠️ ${text}`);
    });

    const timeout = setTimeout(() => {
      console.error(`[CLAUDE] ⏰ Timeout after ${TASK_TIMEOUT / 60000} min — killing process`);
      proc.kill('SIGTERM');
      resolve({
        success: false,
        output: stdout,
        error: `Process timed out after ${TASK_TIMEOUT / 60000} minutes`,
        claudeSessionId,
      });
    }, TASK_TIMEOUT);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (pendingLogs.length > 0) sendLogs(task.id, pendingLogs);

      let resultText = stdout;
      try {
        for (const l of stdout.split('\n').filter(Boolean)) {
          const json = JSON.parse(l);
          if (json.type === 'result' && json.result) {
            resultText = json.result;
            break;
          }
        }
      } catch { /* use raw stdout */ }

      if (code === 0) {
        resolve({ success: true, output: resultText, claudeSessionId });
      } else {
        resolve({ success: false, output: resultText, error: stderr || `Exit code: ${code}`, claudeSessionId });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, output: '', error: `Failed to start Claude: ${err.message}` });
    });
  });
}

// ── Main Loop ────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🤖 The Insiders Insights — Agent Poller');
  console.log('═══════════════════════════════════════════════');
  console.log(`  API:     ${API_BASE}`);
  console.log(`  CLI:     ${CLAUDE_CLI}`);
  console.log(`  Dir:     ${PROJECT_DIR}`);
  console.log(`  Model:   ${DEFAULT_MODEL}`);
  console.log(`  Key:     ${API_KEY ? '***' + API_KEY.slice(-4) : 'MISSING!'}`);
  console.log(`  Timeout: ${TASK_TIMEOUT / 60000} min`);
  console.log('═══════════════════════════════════════════════');

  if (!API_KEY) {
    console.error('❌ AGENT_API_KEY is not set!');
    console.error('   Usage: AGENT_API_KEY=your_key npm run agent');
    process.exit(1);
  }

  let busy = false;

  setInterval(async () => {
    if (busy) return;

    const task = await poll();
    if (!task) return;

    busy = true;
    console.log(`\n🎯 Task received: ${task.id}`);
    console.log(`   Session: ${task.sessionId || 'standalone'}`);
    console.log(`   Resume: ${task.resumeSessionId || 'new session'}`);

    const result = await runClaude(task);

    const logs = [
      `🚀 Model: ${task.model || DEFAULT_MODEL}`,
      result.success ? '✅ Task completed successfully' : `❌ Task failed: ${result.error}`,
    ];
    if (result.claudeSessionId) {
      logs.push(`🔌 Claude session: ${result.claudeSessionId}`);
    }

    await reportResult(
      task.id,
      result.success ? 'DONE' : 'FAILED',
      result.output?.substring(0, 50000),
      result.error,
      result.claudeSessionId,
    );

    console.log(`\n${result.success ? '✅' : '❌'} Task ${task.id} ${result.success ? 'DONE' : 'FAILED'}\n`);
    busy = false;
  }, POLL_INTERVAL);
}

main();
