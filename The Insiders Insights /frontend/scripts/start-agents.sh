#!/bin/bash
# Start 3 parallel Insiders Insights Claude agents.
# Each process handles one task at a time; parallelism comes from running
# multiple processes, not from one process juggling multiple tasks.
#
# Usage:
#   cd "The Insiders Insights " && bash frontend/scripts/start-agents.sh
#
# Stop them:
#   kill $(cat ~/.insiders-agents/agents.pids)

set -euo pipefail

# ── Config ────────────────────────────────────────────────
AGENT_API_BASE="https://insiders-frontend-815335042776.europe-north1.run.app"
AGENT_API_KEY="YcpFKbokWxTu89gJCAvktIkcsD-dSDQdGJMtnxrWA-o"
AGENT_CLI="$HOME/.local/bin/claude"
AGENT_MODEL="claude-opus-4-7"

# ── Export common env vars so child processes inherit them ──
export AGENT_API_BASE
export AGENT_API_KEY
export AGENT_CLI
export AGENT_MODEL
export CLAUDE_CONFIG_DIR="$HOME/.beachvibes-agents/freddi-claude-config"

LOG_DIR="$HOME/.insiders-agents"
mkdir -p "$LOG_DIR"
PID_FILE="$LOG_DIR/agents.pids"
: > "$PID_FILE"

# Kill any old insiders agent-poll processes first
pkill -f "node.*agent-poll.mjs" 2>/dev/null || true
sleep 1

# nohup + redirect + disown fully detaches the child so it survives shell exit.
start_agent() {
  local label="$1"
  local logfile="$LOG_DIR/${label}.log"
  nohup node frontend/scripts/agent-poll.mjs >"$logfile" 2>&1 &
  local pid=$!
  disown $pid
  echo "$pid" >> "$PID_FILE"
  echo "  ✅ $label (PID: $pid) → $logfile"
}

echo "📊 Starting 3 Insiders Insights agents (detached)..."
echo ""
start_agent "insiders-1"
start_agent "insiders-2"
start_agent "insiders-3"
echo ""
echo "All 3 agents detached. Logs: $LOG_DIR"
echo "Stop them with: kill \$(cat $PID_FILE)"
