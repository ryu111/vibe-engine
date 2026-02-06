#!/usr/bin/env node

/**
 * Error Handler Hook Script
 *
 * Triggered when tester or reviewer agents complete.
 * Analyzes results and triggers auto-fix loop if failures detected.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  maxAutoFixIterations: 3,
  stateFile: '.vibe-engine/auto-fix-state.json',
  autoFixEnabled: true
};

// Auto-fix state structure
const DEFAULT_STATE = {
  active: false,
  iteration: 0,
  maxIterations: CONFIG.maxAutoFixIterations,
  originalErrors: [],
  fixAttempts: [],
  currentStatus: 'idle'
};

function getProjectRoot() {
  let current = process.cwd();
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.vibe-engine')) ||
        fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

function loadState() {
  const projectRoot = getProjectRoot();
  const stateFile = path.join(projectRoot, CONFIG.stateFile);

  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }

  return { ...DEFAULT_STATE };
}

function saveState(state) {
  const projectRoot = getProjectRoot();
  const stateDir = path.join(projectRoot, '.vibe-engine');
  const stateFile = path.join(projectRoot, CONFIG.stateFile);

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function parseSubagentOutput() {
  // Try to parse from environment or stdin
  const toolInput = process.env.TOOL_INPUT || '';
  const toolOutput = process.env.TOOL_OUTPUT || '';

  // Look for failure indicators
  const failurePatterns = [
    /failed/i,
    /error/i,
    /FAIL/,
    /❌/,
    /tests?:\s*0\s*passed/i,
    /"status":\s*"failed"/i
  ];

  const hasFailures = failurePatterns.some(pattern =>
    pattern.test(toolInput) || pattern.test(toolOutput)
  );

  // Extract error details if possible
  const errors = [];

  // Try to extract test failures
  const testFailureMatch = toolOutput.match(/Failed:\s*(\d+)/i);
  if (testFailureMatch) {
    errors.push({
      type: 'test_failure',
      count: parseInt(testFailureMatch[1], 10),
      source: 'tester'
    });
  }

  // Try to extract build errors
  if (/error TS\d+/i.test(toolOutput)) {
    const tsErrors = toolOutput.match(/error TS\d+/gi) || [];
    errors.push({
      type: 'typescript_error',
      count: tsErrors.length,
      source: 'build'
    });
  }

  // Try to extract lint errors
  if (/\d+ errors?/i.test(toolOutput) && /lint/i.test(toolInput)) {
    const lintMatch = toolOutput.match(/(\d+) errors?/i);
    if (lintMatch) {
      errors.push({
        type: 'lint_error',
        count: parseInt(lintMatch[1], 10),
        source: 'lint'
      });
    }
  }

  return {
    hasFailures,
    errors,
    rawOutput: toolOutput.substring(0, 1000)
  };
}

/**
 * 錯誤四分類（transient/compensatable/logic/irreversible）
 */
function classifyError(errors) {
  if (!errors || errors.length === 0) {
    return { type: 'none', confidence: 1.0, strategy: 'none' };
  }

  const transientPatterns = [
    'econnreset', 'etimedout', 'enotfound', 'rate_limit', '429', '503', '504'
  ];
  const irreversiblePatterns = [
    'email_sent', 'deployed', 'api_key_exposed', 'published'
  ];
  const compensatablePatterns = [
    'partial_commit', 'file_write_failed'
  ];

  for (const error of errors) {
    const errorStr = JSON.stringify(error).toLowerCase();

    if (irreversiblePatterns.some(p => errorStr.includes(p))) {
      return { type: 'irreversible', confidence: 0.9, strategy: 'escalate' };
    }
    if (transientPatterns.some(p => errorStr.includes(p))) {
      return { type: 'transient', confidence: 0.8, strategy: 'retry_with_backoff' };
    }
    if (compensatablePatterns.some(p => errorStr.includes(p))) {
      return { type: 'compensatable', confidence: 0.7, strategy: 'rollback_and_retry' };
    }
  }

  return { type: 'logic', confidence: 0.6, strategy: 'fix_and_retry' };
}

function shouldAutoFix(errors) {
  // Determine if errors are auto-fixable
  const autoFixableTypes = [
    'typescript_error',
    'lint_error',
    'import_error'
  ];

  const semiAutoFixableTypes = [
    'test_failure'
  ];

  const hasAutoFixable = errors.some(e => autoFixableTypes.includes(e.type));
  const hasSemiAutoFixable = errors.some(e => semiAutoFixableTypes.includes(e.type));

  return {
    canAutoFix: hasAutoFixable || hasSemiAutoFixable,
    confidence: hasAutoFixable ? 'high' : (hasSemiAutoFixable ? 'medium' : 'low'),
    recommendation: hasAutoFixable ? 'auto_fix' : (hasSemiAutoFixable ? 'diagnose_first' : 'escalate')
  };
}

function generateAutoFixPlan(state, result) {
  const plan = {
    action: 'auto_fix',
    steps: []
  };

  for (const error of result.errors) {
    switch (error.type) {
      case 'typescript_error':
        plan.steps.push({
          agent: 'debugger',
          task: 'Diagnose TypeScript errors and suggest fixes',
          followUp: {
            agent: 'developer',
            task: 'Apply suggested fixes'
          }
        });
        break;

      case 'lint_error':
        plan.steps.push({
          agent: 'developer',
          task: 'Run auto-fix for lint errors: npm run lint -- --fix',
          autoApply: true
        });
        break;

      case 'test_failure':
        plan.steps.push({
          agent: 'debugger',
          task: 'Analyze test failures and identify root cause',
          followUp: {
            agent: 'developer',
            task: 'Fix code to pass failing tests'
          }
        });
        break;

      default:
        plan.steps.push({
          agent: 'debugger',
          task: `Diagnose ${error.type} error`,
          escalateIfUncertain: true
        });
    }
  }

  return plan;
}

function handleSuccess(state) {
  // Clear auto-fix state on success
  if (state.active) {
    return {
      systemMessage: `[Auto-Fix Loop] ✅ Fixed successfully after ${state.iteration} iteration(s)`,
      stateUpdate: { ...DEFAULT_STATE }
    };
  }

  return {
    systemMessage: '[Error Handler] ✅ No errors detected',
    stateUpdate: state
  };
}

function handleFailure(state, result) {
  // Check if auto-fix is enabled
  if (!CONFIG.autoFixEnabled) {
    return {
      systemMessage: '[Error Handler] ❌ Errors detected but auto-fix is disabled',
      stateUpdate: state
    };
  }

  // Check if we've exceeded max iterations
  if (state.active && state.iteration >= CONFIG.maxAutoFixIterations) {
    return {
      systemMessage: `⛔ MANDATORY STOP: Auto-fix loop exceeded max iterations (${CONFIG.maxAutoFixIterations}).\n\n⛔ BLOCK: Further auto-fix attempts are FORBIDDEN.\n\nMUST escalate to user with full diagnosis report. Do NOT attempt additional fixes without user guidance.\n\n${generateEscalationReport(state, result)}`,
      escalate: true,
      escalationReport: generateEscalationReport(state, result),
      stateUpdate: { ...DEFAULT_STATE }
    };
  }

  // 錯誤分類
  const classification = classifyError(result.errors);

  // 不可逆錯誤直接 escalate
  if (classification.type === 'irreversible') {
    return {
      systemMessage: `⛔ IRREVERSIBLE ERROR — Cannot auto-fix.\n\n${generateEscalationReport(state, result)}`,
      escalate: true,
      errorClassification: classification,
      stateUpdate: { ...DEFAULT_STATE }
    };
  }

  // 暫態錯誤：不消耗迭代次數
  if (classification.type === 'transient') {
    return {
      systemMessage: `⏳ TRANSIENT ERROR — Will retry with backoff.\nType: ${classification.type} (confidence: ${classification.confidence})`,
      errorClassification: classification,
      stateUpdate: state
    };
  }

  // 其餘（logic/compensatable）走原有流程
  const fixability = shouldAutoFix(result.errors);

  if (!fixability.canAutoFix) {
    return {
      systemMessage: `⛔ CRITICAL: Errors detected but not auto-fixable.\n\nError types found:\n${result.errors.map(e => `  - ${e.type}: ${e.count} issue(s)`).join('\n')}\n\n⛔ BLOCK: Auto-fix not possible. MUST escalate to user for manual intervention.`,
      escalate: true,
      errorClassification: classification,
      stateUpdate: state
    };
  }

  // Start or continue auto-fix loop
  const newState = {
    ...state,
    active: true,
    iteration: state.active ? state.iteration + 1 : 1,
    originalErrors: state.active ? state.originalErrors : result.errors,
    fixAttempts: [
      ...state.fixAttempts,
      {
        iteration: (state.iteration || 0) + 1,
        timestamp: Date.now(),
        errors: result.errors,
        plan: generateAutoFixPlan(state, result)
      }
    ],
    currentStatus: 'fixing'
  };

  const plan = generateAutoFixPlan(state, result);

  // 生成 MANDATORY debugger 調用指令
  const mandatorySteps = plan.steps.map((step, i) => {
    const lines = [`**MUST ${i + 1}**: Use Task tool to invoke ${step.agent}`];
    lines.push(`  Task({ subagent_type: "vibe-engine-guarantee:${step.agent}", prompt: "${step.task}" })`);
    if (step.followUp) {
      lines.push(`  → Then MUST invoke ${step.followUp.agent}: "${step.followUp.task}"`);
    }
    return lines.join('\n');
  }).join('\n\n');

  // Generate checkpoint message for iteration
  const checkpointMessage = `
[CHECKPOINT] Auto-Fix Iteration ${newState.iteration}/${CONFIG.maxAutoFixIterations}
├─ 嘗試修復：${plan.steps.map(s => s.task.substring(0, 30)).join(', ')}
├─ 錯誤類型：${result.errors.map(e => e.type).join(', ')}
├─ 錯誤數量：${result.errors.reduce((sum, e) => sum + e.count, 0)}
└─ 下一步：execute fix plan`;

  return {
    systemMessage: [
      `[Auto-Fix Loop] 🔄 Iteration ${newState.iteration}/${CONFIG.maxAutoFixIterations}`,
      `Error Classification: ${classification.type} (${classification.strategy})`,
      '',
      '### MANDATORY Fix Steps',
      mandatorySteps,
      '',
      `**MUST** output checkpoint after fix attempt:`,
      checkpointMessage,
      '',
      '⛔ 未輸出 iteration checkpoint 禁止進入下一迭代'
    ].join('\n'),
    autoFixPlan: plan,
    errorClassification: classification,
    stateUpdate: newState
  };
}

function generateEscalationReport(state, result) {
  return `
╔══════════════════════════════════════════════════╗
║         Auto-Fix Loop Escalation                  ║
╠══════════════════════════════════════════════════╣
║ Status: Unable to auto-fix after ${state.iteration} attempts       ║
╠══════════════════════════════════════════════════╣
║ Original Errors                                  ║
${state.originalErrors.map(e => `║ ├─ ${e.type}: ${e.count} issue(s)`).join('\n')}
╠══════════════════════════════════════════════════╣
║ Fix Attempts                                     ║
${state.fixAttempts.map((a, i) => `║ [${i + 1}] ${a.plan.steps.map(s => s.task).join(', ').substring(0, 40)}...`).join('\n')}
╠══════════════════════════════════════════════════╣
║ Current Errors                                   ║
${result.errors.map(e => `║ ├─ ${e.type}: ${e.count} issue(s)`).join('\n')}
╠══════════════════════════════════════════════════╣
║ Recommended Action                               ║
║ Manual intervention required. Please review      ║
║ the errors and provide guidance.                 ║
╚══════════════════════════════════════════════════╝`;
}

function main() {
  const state = loadState();
  const result = parseSubagentOutput();

  let response;

  if (result.hasFailures) {
    response = handleFailure(state, result);
  } else {
    response = handleSuccess(state);
  }

  // Save updated state
  saveState(response.stateUpdate);

  // Output response
  const output = {
    continue: !response.escalate,
    systemMessage: response.systemMessage
  };

  if (response.autoFixPlan) {
    output.autoFixPlan = response.autoFixPlan;
  }

  if (response.escalationReport) {
    output.escalationReport = response.escalationReport;
  }

  console.log(JSON.stringify(output, null, 2));
}

module.exports = {
  classifyError,
  shouldAutoFix,
  generateAutoFixPlan,
  handleFailure,
  handleSuccess
};

if (require.main === module) {
  main();
}
