#!/usr/bin/env node
/**
 * Memory Init Hook - 記憶初始化
 *
 * 功能：
 * 1. 初始化記憶系統目錄結構
 * 2. 載入高信心背景記憶
 * 3. 注入到會話上下文
 *
 * 觸發時機：SessionStart
 * 對應章節：Ch5 記憶系統
 */

const path = require('path');
const { getProjectRoot, ensureVibeEngineDirs } = require('./lib/common');
const { MemoryStore } = require('./lib/memory-store');
const { formatMemoryItem, MEMORY_TYPES } = require('./lib/memory-item');
const { THRESHOLDS, getConfidenceIcon } = require('./lib/confidence');

/**
 * 載入高信心記憶並格式化為注入字串
 *
 * @param {MemoryStore} store - 記憶存儲
 * @param {number} maxMemories - 最大記憶數量
 * @returns {object} - { memories, formatted }
 */
function loadAndFormatMemories(store, maxMemories = 10) {
  // 查找高信心記憶（>= 0.7）
  const memories = store.findHighConfidence(THRESHOLDS.AUTO_APPLY, {
    limit: maxMemories
  });

  if (memories.length === 0) {
    return { memories: [], formatted: '' };
  }

  // 格式化為注入字串
  const lines = [
    '## \u{1F4BE} Background Memory',
    ''
  ];

  // 按類型分組
  const byType = {};
  for (const mem of memories) {
    const type = mem.type || 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(mem);
  }

  const typeLabels = {
    [MEMORY_TYPES.SEMANTIC]: '\u{1F4CC} Project Facts',      // 📌
    [MEMORY_TYPES.EPISODIC]: '\u{1F4A1} Past Experiences',   // 💡
    [MEMORY_TYPES.PROCEDURAL]: '\u{1F4CB} Procedures'        // 📋
  };

  for (const [type, items] of Object.entries(byType)) {
    const label = typeLabels[type] || type;
    lines.push(`### ${label}`);

    for (const item of items) {
      const icon = getConfidenceIcon(item.metadata?.confidence || 0);
      const conf = ((item.metadata?.confidence || 0) * 100).toFixed(0);
      lines.push(`- ${item.content} ${icon} (${conf}%)`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return {
    memories,
    formatted: lines.join('\n')
  };
}

/**
 * 載入活躍的 Instincts
 *
 * @param {string} instinctsDir - Instincts 目錄
 * @returns {Array} - Instinct 列表
 */
function loadActiveInstincts(instinctsDir) {
  const fs = require('fs');

  if (!fs.existsSync(instinctsDir)) {
    return [];
  }

  const instincts = [];

  try {
    const files = fs.readdirSync(instinctsDir).filter(f => f.endsWith('.md'));

    for (const file of files.slice(0, 5)) { // 最多 5 個
      const content = fs.readFileSync(path.join(instinctsDir, file), 'utf8');

      // 解析 YAML frontmatter
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const yaml = match[1];
        const trigger = yaml.match(/trigger:\s*"?([^"\n]+)"?/)?.[1];
        const confidence = parseFloat(yaml.match(/confidence:\s*([\d.]+)/)?.[1] || '0.5');

        if (trigger && confidence >= 0.5) {
          instincts.push({ trigger, confidence });
        }
      }
    }
  } catch (e) {
    // 忽略錯誤
  }

  return instincts;
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

    // 初始化記憶存儲
    const store = new MemoryStore(projectRoot);

    // 載入高信心記憶
    const { memories, formatted } = loadAndFormatMemories(store, 10);

    // 載入活躍 Instincts
    const instincts = loadActiveInstincts(paths.instincts);

    // 獲取統計
    const stats = store.getStats();

    // 構建輸出
    const output = {
      continue: true,
      suppressOutput: false
    };

    // 構建系統訊息
    const messageParts = [];

    if (memories.length > 0) {
      messageParts.push(`[Memory Init] Loaded ${memories.length} memories`);
    }

    if (instincts.length > 0) {
      messageParts.push(`${instincts.length} instincts active`);
    }

    if (stats.total > 0) {
      messageParts.push(`(total: ${stats.total} in store)`);
    }

    if (messageParts.length > 0) {
      output.systemMessage = messageParts.join(' | ');

      // 如果有高信心記憶，注入到 context
      if (formatted) {
        output.systemMessage += '\n\n' + formatted;
      }

      // 如果有活躍 Instincts，也注入
      if (instincts.length > 0) {
        output.systemMessage += '\n## \u{1F9E0} Active Instincts\n\n';
        for (const inst of instincts) {
          const icon = getConfidenceIcon(inst.confidence);
          output.systemMessage += `- ${inst.trigger} ${icon}\n`;
        }
      }
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      systemMessage: `[Memory Init] Warning: ${error.message}`
    }));
  }
}

main().catch(console.error);
