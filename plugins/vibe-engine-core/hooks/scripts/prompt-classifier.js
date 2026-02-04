#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - 分類用戶請求
 *
 * 功能：
 * 1. 分析用戶請求意圖
 * 2. 判斷複雜度（simple/moderate/complex）
 * 3. 決定是否需要任務分解
 *
 * 對應章節：Ch1 協調引擎
 */

const fs = require('fs');

// 讀取 stdin（hook input）
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  try {
    const hookInput = JSON.parse(input);
    const userPrompt = hookInput.user_prompt || '';

    // 簡單的複雜度判斷（TODO: 改進為更智能的分類）
    const complexity = classifyComplexity(userPrompt);
    const needsDecomposition = complexity !== 'simple';

    // 輸出分類結果
    const output = {
      systemMessage: `[Vibe Engine] Request classified: ${complexity}. ${needsDecomposition ? 'Task decomposition recommended.' : 'Direct execution OK.'}`,
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: {
        complexity: complexity,
        needsDecomposition: needsDecomposition
      }
    };

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      systemMessage: `Prompt classification skipped: ${error.message}`,
      continue: true,
      suppressOutput: false
    }));
  }
});

/**
 * 簡單的複雜度分類
 * TODO: 改進為更智能的分類
 */
function classifyComplexity(prompt) {
  const lowercasePrompt = prompt.toLowerCase();

  // 複雜度指標
  const complexIndicators = [
    'implement', 'build', 'create feature', 'refactor',
    'migrate', 'integrate', 'multiple files'
  ];

  const moderateIndicators = [
    'fix', 'update', 'modify', 'add', 'change',
    'improve', 'test'
  ];

  const simpleIndicators = [
    'what is', 'how to', 'explain', 'show', 'find',
    'read', 'status', 'help', '?'
  ];

  // 檢查是否匹配
  for (const indicator of simpleIndicators) {
    if (lowercasePrompt.includes(indicator)) {
      return 'simple';
    }
  }

  for (const indicator of complexIndicators) {
    if (lowercasePrompt.includes(indicator)) {
      return 'complex';
    }
  }

  for (const indicator of moderateIndicators) {
    if (lowercasePrompt.includes(indicator)) {
      return 'moderate';
    }
  }

  // 預設為 moderate
  return 'moderate';
}

// TODO: 實作更完整的分類邏輯
// - 使用 LLM 進行語義分類
// - 考慮上下文歷史
// - 支援自定義分類規則
