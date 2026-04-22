#!/usr/bin/env node
/**
 * TopOfMinds Agent Poller
 * Polls the staging server for pending agent tasks and runs Claude CLI.
 *
 * Usage:
 *   AGENT_POLL_SECRET=xxx npm run agent
 *   AGENT_POLL_SECRET=xxx AGENT_MODEL=claude-opus-4-7 npm run agent
 *
 * Architecture matches dvoucher/OnTopofIT/AIDAS agent-poll:
 * - Pipes prompt via stdin (no shell quoting issues)
 * - Uses -p (pipe mode, enables file edits)
 * - 30 minute timeout for deploy-heavy tasks
 * - Session resumption via Claude Code session_id
 *
 * Auth: query param (?secret=xxx) — matches TopOfMinds poll/route.js
 */

import { spawn } from 'child_process';

const API_BASE = process.env.AGENT_API_BASE || 'https://topofminds-app-815335042776.europe-north1.run.app';
const POLL_SECRET = process.env.AGENT_POLL_SECRET || '';
const CLAUDE_CLI = process.env.AGENT_CLI || `${process.env.HOME}/.local/bin/claude`;
const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4-6';
const POLL_INTERVAL = 5000;
const TASK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const PROJECT_DIR = process.cwd();

// ── API Helpers ──────────────────────────────────────────────────

async function poll() {
  try {
    const params = new URLSearchParams();
    if (POLL_SECRET) params.set('secret', POLL_SECRET);
    params.set('model', DEFAULT_MODEL);
    params.set('projectDir', PROJECT_DIR);
    const url = `${API_BASE}/api/admin/agent/poll?${params.toString()}`;
    const res = await fetch(url);
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

async function reportResult(taskId, status, response, error, claudeSessionId) {
  try {
    await fetch(`${API_BASE}/api/admin/agent/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        status,
        response,
        error,
        claudeSessionId,
        secret: POLL_SECRET,
      }),
    });
  } catch (e) {
    console.error('[REPORT] Error:', e.message || e);
  }
}

// ── Claude CLI Runner ────────────────────────────────────────────

function runClaude(task) {
  return new Promise((resolve) => {
    const model = task.model || DEFAULT_MODEL;
    const args = ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
    args.push('--model', model);

    // Resume existing Claude Code session if available
    const resumeId = task.session?.claudeSessionId;
    if (resumeId) {
      args.push('--resume', resumeId);
    }

    console.log(`[CLAUDE] Running: ${CLAUDE_CLI} ${args.join(' ')}`);
    console.log(`[CLAUDE] Model: ${model}`);
    console.log(`[CLAUDE] Prompt: ${task.prompt.substring(0, 120)}...`);
    if (resumeId) {
      console.log(`[CLAUDE] Resuming session: ${resumeId}`);
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

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;

      // Parse stream-json for session ID and tool usage
      for (const line of text.split('\n').filter(Boolean)) {
        try {
          const json = JSON.parse(line);

          // Extract session ID
          if (json.session_id && !claudeSessionId) {
            claudeSessionId = json.session_id;
            console.log(`   🔌 Session: ${claudeSessionId}`);
          }

          // Log tool usage
          if (json.type === 'assistant' && json.message?.content) {
            for (const block of json.message.content) {
              if (block.type === 'tool_use') {
                console.log(`   🔧 ${block.name}(${JSON.stringify(block.input).substring(0, 80)})`);
              }
              if (block.type === 'text' && block.text) {
                console.log(`   💬 ${block.text.substring(0, 200)}`);
              }
            }
          }

          // Log result
          if (json.type === 'result') {
            console.log(`   💰 Cost: $${json.cost_usd?.toFixed(4) || '?'} | Duration: ${json.duration_ms ? (json.duration_ms / 1000).toFixed(1) + 's' : '?'}`);
            if (json.session_id) claudeSessionId = json.session_id;

            // Extract result text immediately
            const resultText = json.result || stdout;
            clearTimeout(timeout);
            // Resolve immediately — don't wait for process exit
            resolve({ success: !json.is_error, output: resultText, claudeSessionId });
            // Kill lingering process after grace period
            setTimeout(() => {
              try { proc.kill('SIGTERM'); } catch {}
              setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000);
            }, 5000);
          }
        } catch {
          // Not JSON
          if (line.trim()) process.stdout.write(`   ${line}\n`);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (text.trim()) process.stderr.write(`   ⚠️ ${text}`);
    });

    // Timeout
    const timeout = setTimeout(() => {
      console.error(`[CLAUDE] ⏰ Timeout after ${TASK_TIMEOUT / 60000} minutes — killing process`);
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

      // Extract result text from stream-json output
      let resultText = stdout;
      try {
        const lines = stdout.split('\n').filter(Boolean);
        for (const l of lines) {
          const json = JSON.parse(l);
          if (json.type === 'result' && json.result) {
            resultText = json.result;
            break;
          }
        }
      } catch {
        /* use raw stdout */
      }

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
  console.log('═══════════════════════════════════════');
  console.log('  🤖 TopOfMinds Agent Poller Started');
  console.log('═══════════════════════════════════════');
  console.log(`  API:     ${API_BASE}`);
  console.log(`  CLI:     ${CLAUDE_CLI}`);
  console.log(`  Dir:     ${PROJECT_DIR}`);
  console.log(`  Model:   ${DEFAULT_MODEL}`);
  console.log(`  Secret:  ${POLL_SECRET ? '***' + POLL_SECRET.slice(-4) : 'MISSING!'}`);
  console.log(`  Timeout: ${TASK_TIMEOUT / 60000} min`);
  console.log('═══════════════════════════════════════');

  if (!POLL_SECRET) {
    console.error('❌ AGENT_POLL_SECRET is not set!');
    console.error('   Usage: AGENT_POLL_SECRET=your_secret npm run agent');
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

    const result = await runClaude(task);

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
