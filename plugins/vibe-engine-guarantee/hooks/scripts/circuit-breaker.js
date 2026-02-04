#!/usr/bin/env node

/**
 * Circuit Breaker Hook Script
 *
 * Implements circuit breaker pattern to prevent cascading failures.
 * States: CLOSED (normal) -> OPEN (blocking) -> HALF_OPEN (testing)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  failureThreshold: 5,      // Failures before opening circuit
  successThreshold: 3,      // Successes in half-open before closing
  timeout: 60000,           // Time in open state before half-open (ms)
  stateFile: '.vibe-engine/circuit-breaker-state.json'
};

// Circuit state structure
const DEFAULT_STATE = {
  state: 'CLOSED',          // CLOSED, OPEN, HALF_OPEN
  failures: 0,
  successes: 0,
  lastFailureTime: null,
  lastStateChange: Date.now(),
  failureHistory: []
};

function getProjectRoot() {
  // Try to find project root by looking for .vibe-engine or .git
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
    // Ignore parse errors, return default
  }

  return { ...DEFAULT_STATE };
}

function saveState(state) {
  const projectRoot = getProjectRoot();
  const stateDir = path.join(projectRoot, '.vibe-engine');
  const stateFile = path.join(projectRoot, CONFIG.stateFile);

  // Ensure directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function checkCircuit() {
  const state = loadState();
  const now = Date.now();

  // If OPEN, check if timeout elapsed -> transition to HALF_OPEN
  if (state.state === 'OPEN') {
    const timeSinceLastFailure = now - state.lastFailureTime;

    if (timeSinceLastFailure >= CONFIG.timeout) {
      state.state = 'HALF_OPEN';
      state.successes = 0;
      state.lastStateChange = now;
      saveState(state);

      return {
        decision: 'ALLOW',
        message: '[Circuit Breaker] Transitioning to HALF_OPEN state, allowing test request'
      };
    } else {
      const remainingMs = CONFIG.timeout - timeSinceLastFailure;
      const remainingSec = Math.ceil(remainingMs / 1000);

      return {
        decision: 'BLOCK',
        message: `[Circuit Breaker] Circuit is OPEN due to repeated failures. Waiting ${remainingSec}s before retry.`
      };
    }
  }

  // CLOSED or HALF_OPEN - allow operation
  return {
    decision: 'ALLOW',
    message: `[Circuit Breaker] State: ${state.state}, allowing operation`
  };
}

function recordFailure(errorMessage) {
  const state = loadState();
  const now = Date.now();

  state.failures++;
  state.lastFailureTime = now;
  state.failureHistory.push({
    timestamp: now,
    error: errorMessage?.substring(0, 200) || 'Unknown error'
  });

  // Keep only last 10 failures
  if (state.failureHistory.length > 10) {
    state.failureHistory = state.failureHistory.slice(-10);
  }

  // Check if should open circuit
  if (state.state === 'CLOSED' && state.failures >= CONFIG.failureThreshold) {
    state.state = 'OPEN';
    state.lastStateChange = now;
    saveState(state);

    return {
      stateChanged: true,
      newState: 'OPEN',
      message: `[Circuit Breaker] Circuit OPENED after ${state.failures} failures`
    };
  }

  // If HALF_OPEN and failure, go back to OPEN
  if (state.state === 'HALF_OPEN') {
    state.state = 'OPEN';
    state.lastStateChange = now;
    saveState(state);

    return {
      stateChanged: true,
      newState: 'OPEN',
      message: '[Circuit Breaker] Test request failed, circuit back to OPEN'
    };
  }

  saveState(state);
  return {
    stateChanged: false,
    message: `[Circuit Breaker] Recorded failure (${state.failures}/${CONFIG.failureThreshold})`
  };
}

function recordSuccess() {
  const state = loadState();
  const now = Date.now();

  if (state.state === 'HALF_OPEN') {
    state.successes++;

    if (state.successes >= CONFIG.successThreshold) {
      // Close circuit
      state.state = 'CLOSED';
      state.failures = 0;
      state.successes = 0;
      state.lastStateChange = now;
      saveState(state);

      return {
        stateChanged: true,
        newState: 'CLOSED',
        message: '[Circuit Breaker] Circuit CLOSED after successful recovery'
      };
    }

    saveState(state);
    return {
      stateChanged: false,
      message: `[Circuit Breaker] Recovery progress (${state.successes}/${CONFIG.successThreshold})`
    };
  }

  // Reset failure count on success in CLOSED state
  if (state.state === 'CLOSED' && state.failures > 0) {
    state.failures = Math.max(0, state.failures - 1);
    saveState(state);
  }

  return {
    stateChanged: false,
    message: '[Circuit Breaker] Operation successful'
  };
}

function resetCircuit() {
  const state = { ...DEFAULT_STATE };
  saveState(state);
  return {
    message: '[Circuit Breaker] Circuit reset to CLOSED state'
  };
}

function getStatus() {
  const state = loadState();
  return {
    state: state.state,
    failures: state.failures,
    successes: state.successes,
    lastFailureTime: state.lastFailureTime,
    failureHistory: state.failureHistory
  };
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  // Check for special flags
  if (args.includes('--reset-on-success')) {
    // Called from Stop hook - record success and potentially reset
    const result = recordSuccess();
    console.log(JSON.stringify({
      continue: true,
      systemMessage: result.message
    }));
    return;
  }

  if (args.includes('--record-failure')) {
    const errorMsg = args.find(a => a.startsWith('--error='))?.replace('--error=', '');
    const result = recordFailure(errorMsg);
    console.log(JSON.stringify({
      continue: !result.stateChanged || result.newState !== 'OPEN',
      systemMessage: result.message
    }));
    return;
  }

  if (args.includes('--status')) {
    const status = getStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (args.includes('--reset')) {
    const result = resetCircuit();
    console.log(JSON.stringify({
      continue: true,
      systemMessage: result.message
    }));
    return;
  }

  // Default: check circuit before operation
  const result = checkCircuit();

  if (result.decision === 'BLOCK') {
    console.log(JSON.stringify({
      decision: 'block',
      reason: result.message
    }));
  } else {
    console.log(JSON.stringify({
      continue: true,
      systemMessage: result.message
    }));
  }
}

main();
