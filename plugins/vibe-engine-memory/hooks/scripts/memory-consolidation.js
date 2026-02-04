#!/usr/bin/env node
/**
 * Memory Consolidation Hook - 記憶固化
 *
 * 功能：
 * 1. 會話結束時整合短期記憶到長期記憶
 * 2. 從觀察中提取值得記住的資訊
 * 3. 去重和更新現有記憶
 * 4. 觸發信心衰減檢查
 *
 * 觸發時機：Stop
 * 對應章節：Ch5 記憶系統
 */

const path = require('path');
const { getProjectRoot, ensureVibeEngineDirs } = require('./lib/common');
const { readJSONL, writeJSONL } = require('./lib/jsonl');
const { MemoryStore } = require('./lib/memory-store');
const { MEMORY_TYPES, MEMORY_SOURCES } = require('./lib/memory-item');
const { INITIAL_CONFIDENCE } = require('./lib/confidence');

/**
 * 獲取觀察統計
 */
function getObservationStats(observationsFile) {
  const observations = readJSONL(observationsFile);

  return {
    count: observations.length,
    corrections: observations.filter(o => o.user_correction).length,
    successes: observations.filter(o => o.outcome === 'success').length,
    failures: observations.filter(o => o.outcome === 'failure').length,
    tools: [...new Set(observations.map(o => o.tool_name).filter(Boolean))]
  };
}

/**
 * 分析觀察，提取可固化的資訊
 *
 * @param {Array} observations - 觀察列表
 * @returns {Array} - 提取的記憶候選
 */
function analyzeObservations(observations) {
  const candidates = [];

  // 1. 提取錯誤修復經驗（episodic）
  const corrections = observations.filter(o => o.user_correction || o.outcome === 'corrected');
  for (const obs of corrections) {
    candidates.push({
      type: MEMORY_TYPES.EPISODIC,
      content: `When using ${obs.tool_name}, correction was needed: ${obs.tool_result_summary || 'details unavailable'}`,
      confidence: INITIAL_CONFIDENCE.SINGLE_OBSERVATION + 0.1, // 糾正有較高信心
      source: MEMORY_SOURCES.SYSTEM,
      tags: ['correction', obs.tool_name]
    });
  }

  // 2. 識別重複成功的工具使用模式（procedural）
  const toolCounts = {};
  for (const obs of observations) {
    if (obs.outcome === 'success' && obs.tool_name) {
      const key = `${obs.tool_name}:${JSON.stringify(Object.keys(obs.tool_input || {}).sort())}`;
      toolCounts[key] = (toolCounts[key] || 0) + 1;
    }
  }

  for (const [key, count] of Object.entries(toolCounts)) {
    if (count >= 3) {
      const [toolName] = key.split(':');
      candidates.push({
        type: MEMORY_TYPES.PROCEDURAL,
        content: `Tool "${toolName}" was used successfully ${count} times in this session`,
        confidence: Math.min(0.6, INITIAL_CONFIDENCE.SINGLE_OBSERVATION + count * 0.05),
        source: MEMORY_SOURCES.SYSTEM,
        tags: ['tool-usage', toolName]
      });
    }
  }

  // 3. 從 Edit/Write 操作中提取檔案相關資訊（semantic）
  const fileOps = observations.filter(o =>
    ['Edit', 'Write'].includes(o.tool_name) && o.outcome === 'success'
  );

  const uniqueFiles = [...new Set(fileOps.map(o => o.tool_input?.file_path).filter(Boolean))];
  if (uniqueFiles.length > 0) {
    // 只記錄如果修改了多個相關檔案
    if (uniqueFiles.length >= 2) {
      const fileNames = uniqueFiles.map(f => path.basename(f)).slice(0, 5);
      candidates.push({
        type: MEMORY_TYPES.SEMANTIC,
        content: `Files modified in this session: ${fileNames.join(', ')}`,
        confidence: INITIAL_CONFIDENCE.INFERRED_CODE,
        source: MEMORY_SOURCES.SYSTEM,
        tags: ['files', 'session-summary']
      });
    }
  }

  return candidates;
}

/**
 * 固化記憶到長期存儲
 *
 * @param {MemoryStore} store - 記憶存儲
 * @param {Array} candidates - 記憶候選
 * @returns {object} - { stored, skipped, updated }
 */
function consolidateMemories(store, candidates) {
  let stored = 0;
  let skipped = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const result = store.store(candidate.type, candidate.content, {
      confidence: candidate.confidence,
      source: candidate.source,
      tags: candidate.tags,
      dedup: true
    });

    if (result.success) {
      if (result.duplicate) {
        updated++;
      } else {
        stored++;
      }
    } else {
      skipped++;
    }
  }

  return { stored, skipped, updated };
}

/**
 * 清理已處理的觀察
 *
 * @param {string} observationsFile - 觀察檔案路徑
 * @param {number} keepRecent - 保留最近的觀察數量
 */
function cleanupObservations(observationsFile, keepRecent = 100) {
  const observations = readJSONL(observationsFile);

  if (observations.length <= keepRecent) {
    return;
  }

  // 保留最近的觀察
  const recentObservations = observations.slice(-keepRecent);
  writeJSONL(observationsFile, recentObservations);
}

/**
 * 主函數
 */
async function main() {
  let input = '';

  // 讀取 stdin
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', resolve);
    });
  }

  try {
    const projectRoot = getProjectRoot();
    const paths = ensureVibeEngineDirs(projectRoot);

    // 獲取觀察統計
    const stats = getObservationStats(paths.observations);

    // 初始化記憶存儲
    const store = new MemoryStore(projectRoot);

    // 構建輸出
    const output = {
      continue: true,
      suppressOutput: false,
      decision: 'approve',
      reason: 'Memory consolidation completed'
    };

    const messageParts = [];

    if (stats.count > 0) {
      // 讀取觀察並分析
      const observations = readJSONL(paths.observations);
      const candidates = analyzeObservations(observations);

      // 固化記憶
      const consolidation = consolidateMemories(store, candidates);

      // 執行信心衰減
      const decay = store.runDecay();

      // 清理舊觀察
      cleanupObservations(paths.observations, 100);

      // 構建訊息
      messageParts.push(`[Memory Consolidation] Session: ${stats.count} observations`);

      if (stats.corrections > 0) {
        messageParts.push(`${stats.corrections} corrections`);
      }

      if (consolidation.stored > 0 || consolidation.updated > 0) {
        messageParts.push(`\u{2192} ${consolidation.stored} new, ${consolidation.updated} updated`);
      }

      if (decay.decayed > 0) {
        messageParts.push(`${decay.decayed} decayed`);
      }

      // 獲取最新統計
      const finalStats = store.getStats();
      messageParts.push(`(total: ${finalStats.total} memories)`);
    } else {
      messageParts.push('[Memory Consolidation] No observations to consolidate');
    }

    output.systemMessage = messageParts.join(' | ');

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      decision: 'approve',
      reason: `Consolidation skipped: ${error.message}`
    }));
  }
}

main().catch(console.error);
