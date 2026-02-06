#!/usr/bin/env node
/**
 * SubAgent Lifecycle Tracker - SubAgent 生命週期追蹤
 *
 * 功能：
 * 1. SubagentStart 時註冊 active SubAgent（寫入 active-subagent.json）
 * 2. SubagentStop 時註銷（清除 active-subagent.json 中的 entry）
 * 3. routing-enforcer 讀取此檔案決定是否放行 Write/Edit/Bash
 *
 * 使用方式：
 * - hooks.json SubagentStart: node subagent-lifecycle.js start
 * - hooks.json SubagentStop: node subagent-lifecycle.js stop
 *
 * 解決問題：
 * PreToolUse hookInput 沒有任何欄位區分 Main Agent vs SubAgent，
 * 導致 routing-enforcer 無差別阻擋所有 Write/Edit/Bash（死結）。
 * 透過 SubagentStart/SubagentStop 生命週期事件寫入信號檔案，
 * routing-enforcer 即可判斷是否有 SubAgent 在執行。
 *
 * 對應章節：Ch1 協調引擎 - Star Topology
 */

const path = require('path');
const { readHookInput, writeHookOutput, buildSuccessOutput } = require('./lib/hook-io');
const { getVibeEnginePaths, safeReadJSON, safeWriteJSON } = require('./lib/common');

const SUBAGENT_TTL = 10 * 60 * 1000;

function cleanExpiredEntries(agents) {
  const now = Date.now();
  const cleaned = {};
  for (const [id, info] of Object.entries(agents)) {
    if (now - info.startedAt <= SUBAGENT_TTL) {
      cleaned[id] = info;
    }
  }
  return cleaned;
}

function handleStart(hookInput) {
  const paths = getVibeEnginePaths();
  const filePath = path.join(paths.root, 'active-subagent.json');
  const current = safeReadJSON(filePath, { agents: {} });

  const agentId = hookInput.agent_id || `unknown-${Date.now()}`;
  const agentType = hookInput.agent_type || 'unknown';

  current.agents = cleanExpiredEntries(current.agents || {});
  current.agents[agentId] = {
    type: agentType,
    startedAt: Date.now()
  };

  safeWriteJSON(filePath, current, false);

  return buildSuccessOutput({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: `SubAgent ${agentType} (${agentId}) registered for routing bypass.`
    }
  });
}

function handleStop(hookInput) {
  const paths = getVibeEnginePaths();
  const filePath = path.join(paths.root, 'active-subagent.json');
  const current = safeReadJSON(filePath, { agents: {} });

  const agentId = hookInput.agent_id;
  if (agentId && current.agents) {
    delete current.agents[agentId];
  }

  current.agents = cleanExpiredEntries(current.agents || {});
  safeWriteJSON(filePath, current, false);

  return buildSuccessOutput({});
}

function checkActiveSubagent() {
  const paths = getVibeEnginePaths();
  const filePath = path.join(paths.root, 'active-subagent.json');
  const data = safeReadJSON(filePath, null);

  if (!data || !data.agents) return null;

  const now = Date.now();
  for (const [id, info] of Object.entries(data.agents)) {
    if (now - info.startedAt <= SUBAGENT_TTL) {
      return { agentId: id, type: info.type, startedAt: info.startedAt };
    }
  }

  return null;
}

async function main() {
  const mode = process.argv[2];
  const { hookInput } = await readHookInput();

  if (!hookInput) {
    writeHookOutput(buildSuccessOutput({}));
    return;
  }

  if (mode === 'start') {
    writeHookOutput(handleStart(hookInput));
  } else if (mode === 'stop') {
    writeHookOutput(handleStop(hookInput));
  } else {
    writeHookOutput(buildSuccessOutput({}));
  }
}

module.exports = {
  SUBAGENT_TTL,
  cleanExpiredEntries,
  handleStart,
  handleStop,
  checkActiveSubagent
};

if (require.main === module) {
  main().catch(() => writeHookOutput(buildSuccessOutput({})));
}
